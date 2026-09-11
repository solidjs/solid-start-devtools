import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, For, getOwner, Show } from 'solid-js';
import { Badge } from '../../ui/Badge.js';
import IconButton from '../../ui/IconButton.js';
import Placeholder from '../../ui/Placeholder.js';
import { Text } from '../../ui/Text.js';
import { CollapseIcon, ExpandIcon, PauseIcon, PlayIcon, TreeIcon } from '../icons.js';
import { previewValue, typeName } from './format.js';
import {
  excludeOwner,
  isOwnershipAvailable,
  snapshotOwnershipTree,
  startOwnershipTracking,
  subscribeOwnershipTree,
} from './registry.js';
import { ancestorsOf, EMPTY_TREE, type OwnershipTree, type TreeNode } from './tree.js';
import './styles.css';

/**
 * Asks the dev server to open the file. Vite serves this endpoint in
 * development. A failure is ignored, since the panel has nowhere to report it.
 */
function openInEditor(location: string): void {
  void fetch(`/__open-in-editor?file=${encodeURIComponent(location)}`).catch(() => {});
}

/** How long a row stays marked as new after it first appears. */
const FRESH_MS = 900;

interface Row {
  node: TreeNode;
  /** Depth in the visible tree, which differs from the owner depth when filtering. */
  indent: number;
  expandable: boolean;
  expanded: boolean;
}

export interface OwnershipViewerProps {
  show?: boolean;
}

export default function OwnershipViewer(props: OwnershipViewerProps): JSX.Element {
  // The panel renders inside the app it inspects, so its own scope is marked.
  excludeOwner(getOwner());

  const [tree, setTree] = createSignal<OwnershipTree>(EMPTY_TREE);
  const [componentsOnly, setComponentsOnly] = createSignal(true);
  const [paused, setPaused] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [collapsed, setCollapsed] = createSignal<string[]>([]);
  const [selected, setSelected] = createSignal<string>();

  const firstSeen = new Map<string, number>();

  // Takes the mode as an argument because reading a signal inside an effect
  // callback is not tracked.
  function refresh(mode: boolean): void {
    const next = snapshotOwnershipTree({ componentsOnly: mode });
    const now = Date.now();
    for (const node of next.nodes) {
      if (!firstSeen.has(node.id)) firstSeen.set(node.id, now);
    }
    // An unchanged fingerprint means the app tree did not move. Skipping the
    // write stops the panel's own render from feeding itself another update.
    setTree((current) => (current.fingerprint === next.fingerprint ? current : next));
  }

  createEffect(
    () => ({ watching: !!props.show && !paused(), mode: componentsOnly() }),
    (state) => {
      if (!state.watching) return;
      const read = () => refresh(state.mode);
      const stop = startOwnershipTracking();
      const unsubscribe = subscribeOwnershipTree(read);
      read();
      return () => {
        unsubscribe();
        stop();
      };
    },
  );

  const byId = createMemo(() => new Map(tree().nodes.map((node) => [node.id, node])));

  const matches = createMemo(() => {
    const search = query().trim().toLowerCase();
    if (!search) return undefined;
    const nodes = byId();
    const keep = new Set<string>();
    for (const node of tree().nodes) {
      const hit =
        node.name.toLowerCase().includes(search) ||
        node.kind.includes(search) ||
        node.signals.some(
          (signal) =>
            signal.name.toLowerCase().includes(search) ||
            previewValue(signal.value).toLowerCase().includes(search),
        ) ||
        node.scopes.some(
          (scope) =>
            scope.name.toLowerCase().includes(search) ||
            previewValue(scope.value).toLowerCase().includes(search),
        );
      if (!hit) continue;
      keep.add(node.id);
      for (const parent of ancestorsOf(nodes, node.id)) keep.add(parent);
    }
    return keep;
  });

  const rows = createMemo<Row[]>(() => {
    const nodes = byId();
    const visible = matches();
    const hidden = collapsed();
    const out: Row[] = [];

    const walk = (id: string, indent: number) => {
      const node = nodes.get(id);
      if (!node) return;
      if (visible && !visible.has(id)) return;
      const children = visible
        ? node.children.filter((child) => visible.has(child))
        : node.children;
      // A search result is always open, so matches deeper down stay reachable.
      const expanded = visible ? true : !hidden.includes(id);
      out.push({ node, indent, expandable: children.length > 0, expanded });
      if (!expanded) return;
      for (const child of children) walk(child, indent + 1);
    };

    for (const root of tree().roots) walk(root, 0);
    return out;
  });

  function toggle(id: string): void {
    setCollapsed((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function collapseAll(): void {
    setCollapsed(
      tree()
        .nodes.filter((node) => node.children.length > 0)
        .map((node) => node.id),
    );
  }

  const selectedNode = createMemo(() => {
    const id = selected();
    return id ? byId().get(id) : undefined;
  });

  const selectedPath = createMemo(() => {
    const id = selected();
    if (!id) return [];
    const nodes = byId();
    return ancestorsOf(nodes, id)
      .map((parent) => nodes.get(parent)?.name)
      .filter((name): name is string => !!name)
      .reverse();
  });

  return (
    <Show when={props.show}>
      <div data-solid-dev-toolbar-panel>
        <div data-solid-ownership-viewer>
          <div data-solid-ownership-nav>
            <div data-solid-ownership-nav-title>
              <TreeIcon title="Ownership tree" />
              <Text options={{ size: 'sm' }}>Ownership</Text>
            </div>
            <input
              data-solid-ownership-search
              type="search"
              placeholder="Filter by component, scope or signal"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
            <div data-solid-ownership-modes>
              <button
                type="button"
                data-solid-ownership-mode
                data-active={componentsOnly() ? '' : undefined}
                onClick={() => setComponentsOnly(true)}
              >
                <Text options={{ size: 'xs', weight: 'semibold', wrap: 'nowrap' }}>Components</Text>
              </button>
              <button
                type="button"
                data-solid-ownership-mode
                data-active={componentsOnly() ? undefined : ''}
                onClick={() => setComponentsOnly(false)}
              >
                <Text options={{ size: 'xs', weight: 'semibold', wrap: 'nowrap' }}>Owners</Text>
              </button>
            </div>
            <div data-solid-ownership-nav-actions>
              <Text data-solid-ownership-count options={{ size: 'xs', font: 'mono' }}>
                {`${rows().length} of ${tree().nodes.length}`}
              </Text>
              <IconButton onClick={() => setPaused((current) => !current)}>
                <Show
                  when={paused()}
                  fallback={<PauseIcon title="Pause live updates" />}
                  children={<PlayIcon title="Resume live updates" />}
                />
              </IconButton>
              <IconButton onClick={() => setCollapsed([])}>
                <ExpandIcon title="Expand all" />
              </IconButton>
              <IconButton onClick={collapseAll}>
                <CollapseIcon title="Collapse all" />
              </IconButton>
            </div>
          </div>

          <div data-solid-ownership-body>
            <Show
              when={isOwnershipAvailable()}
              fallback={
                <Placeholder>
                  <Text options={{ size: 'xs' }}>
                    The ownership tree needs a development build of solid-js.
                  </Text>
                </Placeholder>
              }
            >
              <div data-solid-ownership-rows>
                <Show
                  when={rows().length > 0}
                  fallback={
                    <Placeholder>
                      <Text options={{ size: 'xs' }}>
                        {query() ? 'Nothing matches this filter.' : 'No owners observed yet.'}
                      </Text>
                    </Placeholder>
                  }
                >
                  <For each={rows()}>
                    {(row) => (
                      <div
                        data-solid-ownership-row
                        data-selected={selected() === row.node.id ? '' : undefined}
                        data-fresh={
                          Date.now() - (firstSeen.get(row.node.id) ?? 0) < FRESH_MS ? '' : undefined
                        }
                        style={{ 'padding-left': `${row.indent * 0.875 + 0.25}rem` }}
                      >
                        <button
                          type="button"
                          data-solid-ownership-chevron
                          data-leaf={row.expandable ? undefined : ''}
                          data-expanded={row.expanded ? '' : undefined}
                          aria-label={row.expanded ? 'Collapse' : 'Expand'}
                          onClick={() => row.expandable && toggle(row.node.id)}
                        />
                        <button
                          type="button"
                          data-solid-ownership-label
                          onClick={() =>
                            setSelected((current) =>
                              current === row.node.id ? undefined : row.node.id,
                            )
                          }
                        >
                          <span data-solid-ownership-kind={row.node.kind} />
                          <Text
                            data-solid-ownership-name
                            options={{
                              size: 'xs',
                              weight: 'semibold',
                              font: 'mono',
                              wrap: 'nowrap',
                            }}
                          >
                            {row.node.name}
                          </Text>
                          <Show when={row.node.signals.length > 0}>
                            <Badge type="info">{`${row.node.signals.length} signals`}</Badge>
                          </Show>
                          <Show when={row.node.scopes.length > 0}>
                            <Badge type="info">{`${row.node.scopes.length} scopes`}</Badge>
                          </Show>
                          <Show when={row.node.disposed}>
                            <Badge type="failure">disposed</Badge>
                          </Show>
                        </button>
                      </div>
                    )}
                  </For>
                </Show>
              </div>

              <aside data-solid-ownership-detail>
                <Show
                  when={selectedNode()}
                  fallback={
                    <Placeholder>
                      <Text options={{ size: 'xs' }}>Select an owner to see what it holds.</Text>
                    </Placeholder>
                  }
                >
                  {(node) => (
                    <div data-solid-ownership-detail-content>
                      <div data-solid-ownership-detail-head>
                        <span data-solid-ownership-kind={node().kind} />
                        <Text options={{ size: 'sm', weight: 'semibold', font: 'mono' }}>
                          {node().name}
                        </Text>
                        <Badge type="info">{node().kind}</Badge>
                      </div>

                      <Show when={node().location}>
                        {(location) => (
                          <button
                            type="button"
                            data-solid-ownership-location
                            title="Open in editor"
                            onClick={() => openInEditor(location())}
                          >
                            <Text options={{ size: 'xs', font: 'mono', wrap: 'nowrap' }}>
                              {location()}
                            </Text>
                          </button>
                        )}
                      </Show>

                      <Show when={selectedPath().length > 0}>
                        <Text data-solid-ownership-path options={{ size: 'xs', font: 'mono' }}>
                          {selectedPath().join(' › ')}
                        </Text>
                      </Show>

                      <Show when={node().hasValue}>
                        <div data-solid-ownership-detail-block>
                          <Text options={{ size: 'xs', weight: 'semibold' }}>Value</Text>
                          <Text options={{ size: 'xs', font: 'mono' }}>
                            {`${previewValue(node().value)} (${typeName(node().value)})`}
                          </Text>
                        </div>
                      </Show>

                      <Show when={node().props}>
                        {(props) => (
                          <div data-solid-ownership-detail-block>
                            <Text options={{ size: 'xs', weight: 'semibold' }}>
                              {`Props (${props().length})`}
                            </Text>
                            <div data-solid-ownership-chips>
                              <For
                                each={props()}
                                fallback={
                                  <Text options={{ size: 'xs' }}>
                                    This component takes no props.
                                  </Text>
                                }
                              >
                                {(name) => (
                                  <span data-solid-ownership-chip>
                                    <Text options={{ size: 'xs', font: 'mono', wrap: 'nowrap' }}>
                                      {name}
                                    </Text>
                                  </span>
                                )}
                              </For>
                            </div>
                            <Text data-solid-ownership-note options={{ size: 'xs' }}>
                              Props are getters, so the panel lists their names without reading
                              them.
                            </Text>
                          </div>
                        )}
                      </Show>

                      <div data-solid-ownership-detail-block>
                        <Text options={{ size: 'xs', weight: 'semibold' }}>
                          {`Signals (${node().signals.length})`}
                        </Text>
                        <div data-solid-ownership-signals>
                          <For
                            each={node().signals}
                            fallback={
                              <Text options={{ size: 'xs' }}>This owner holds no signals.</Text>
                            }
                          >
                            {(signal) => (
                              <div data-solid-ownership-signal>
                                <Text
                                  options={{
                                    size: 'xs',
                                    weight: 'semibold',
                                    font: 'mono',
                                    wrap: 'nowrap',
                                  }}
                                >
                                  {signal.name}
                                </Text>
                                <Text
                                  data-solid-ownership-signal-value
                                  options={{ size: 'xs', font: 'mono' }}
                                >
                                  {previewValue(signal.value)}
                                </Text>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>

                      <Show when={node().scopes.length > 0}>
                        <div data-solid-ownership-detail-block>
                          <Text options={{ size: 'xs', weight: 'semibold' }}>
                            {`Scopes (${node().scopes.length})`}
                          </Text>
                          <div data-solid-ownership-signals>
                            <For each={node().scopes}>
                              {(scope) => (
                                <div data-solid-ownership-signal>
                                  <span data-solid-ownership-scope-name>
                                    <span data-solid-ownership-kind={scope.kind} />
                                    <Text
                                      options={{
                                        size: 'xs',
                                        weight: 'semibold',
                                        font: 'mono',
                                        wrap: 'nowrap',
                                      }}
                                    >
                                      {scope.name}
                                    </Text>
                                  </span>
                                  <Text
                                    data-solid-ownership-signal-value
                                    options={{ size: 'xs', font: 'mono' }}
                                  >
                                    {scope.hasValue ? previewValue(scope.value) : scope.kind}
                                  </Text>
                                </div>
                              )}
                            </For>
                          </div>
                          <Text data-solid-ownership-note options={{ size: 'xs' }}>
                            Memos and effects created inside this component, folded into it by
                            component mode.
                          </Text>
                        </div>
                      </Show>

                      <div data-solid-ownership-detail-block>
                        <Text options={{ size: 'xs', weight: 'semibold' }}>
                          {`Children (${node().children.length})`}
                        </Text>
                        <div data-solid-ownership-chips>
                          <For
                            each={node().children}
                            fallback={<Text options={{ size: 'xs' }}>Nothing below this one.</Text>}
                          >
                            {(id) => (
                              <Show when={byId().get(id)}>
                                {(child) => (
                                  <button
                                    type="button"
                                    data-solid-ownership-chip
                                    onClick={() => setSelected(id)}
                                  >
                                    <span data-solid-ownership-kind={child().kind} />
                                    <Text options={{ size: 'xs', font: 'mono', wrap: 'nowrap' }}>
                                      {child().name}
                                    </Text>
                                  </button>
                                )}
                              </Show>
                            )}
                          </For>
                        </div>
                      </div>
                    </div>
                  )}
                </Show>
              </aside>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
