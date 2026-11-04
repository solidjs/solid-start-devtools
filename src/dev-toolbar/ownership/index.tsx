import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, For, getOwner, onCleanup, Show } from 'solid-js';
import Placeholder from '../../ui/Placeholder.js';
import { ResizeHandle } from '../../ui/ResizeHandle.js';
import { useResizableDetail } from '../../ui/use-resizable-detail.js';
import { HealthButton } from '../health/HealthButton.js';
import { CollapseIcon, ExpandIcon, EyeIcon, PauseIcon, PlayIcon } from '../icons.js';
import { openInEditor } from '../open-in-editor.js';
import { createDraftEdit } from '../reactivity/draft-edit.js';
import { DraftInput } from '../reactivity/DraftInput.js';
import {
  snapshotReactivityGraph,
  startReactivityTracking,
  subscribeReactivityGraph,
} from '../reactivity/registry.js';
import { isTextEditable, writeReactiveValue } from '../reactivity/value-editor.js';
import { ValueInspector } from '../reactivity/ValueInspector.js';
import { CopyReportButton } from '../report/CopyReportButton.js';
import { pageRoute } from '../report/markdown.js';
import { ownerReport } from '../report/owner-report.js';
import { previewValue } from './format.js';
import { groupRuns, type RunItem } from './runs.js';
import {
  collectActivity,
  describeHeat,
  formatAgo,
  pushRateSample,
  type OwnerActivity,
  type RateSample,
} from './heat.js';
import {
  excludeOwner,
  isOwnershipAvailable,
  ownerChainIds,
  snapshotOwnershipTree,
  startOwnershipTracking,
  subscribeOwnershipTree,
} from './registry.js';
import {
  ancestorsOf,
  EMPTY_TREE,
  readPropValues,
  type OwnerKind,
  type OwnershipTree,
  type PropValue,
  type TreeNode,
} from './tree.js';
import './styles.css';

/** Owners the reactivity graph draws. Components, roots and plain scopes hold no value. */
function isInGraph(kind: OwnerKind): boolean {
  return kind !== 'component' && kind !== 'root' && kind !== 'scope';
}

/** How long a row stays marked as new after it first appears. */
const FRESH_MS = 900;
/** Width of one level of the tree, in pixels. */
const INDENT = 14;

interface Row {
  node: TreeNode;
  /** Depth in the visible tree, which differs from the owner depth when filtering. */
  indent: number;
  expandable: boolean;
  expanded: boolean;
  /** Set on a row that stands for several siblings of one name. */
  run?: { ids: string[]; label: string };
}

/** A change of a signal, as the timeline recorded it. */
export interface SignalChange {
  /** The previous value, already formatted. */
  prev?: string;
  /** When the write happened, on the `performance.now()` clock. */
  at: number;
}

export interface OwnershipViewerProps {
  show?: boolean;
  /** Opens a signal, memo or effect in the reactivity graph. */
  onViewInGraph?: (node: object) => void;
  /**
   * An owner another panel asked to show. Pass a new object for every request,
   * so asking for the same owner twice still moves the tree.
   */
  focus?: { owner: object };
  /** Shown first in the filter row, ahead of the search. */
  lead?: JSX.Element;
  /**
   * The last change of a signal. The first argument is the id this panel gives
   * the signal, the second the runtime signal itself.
   */
  lastChange?: (nodeId: string | number, node?: object) => SignalChange | undefined;
  /** Opens the activity of an owner. */
  onShowActivity?: (owner: object, name: string) => void;
}

/** The colour class of a value, as the prototype sets it. */
function valueTone(value: unknown): 'str' | 'num' | 'kw' | undefined {
  if (typeof value === 'string') return 'str';
  if (typeof value === 'number' || typeof value === 'bigint') return 'num';
  if (typeof value === 'boolean' || value === null || value === undefined) return 'kw';
  return undefined;
}

/** The file name of a location, such as `OrderTable.tsx` from `src/OrderTable.tsx:41:7`. */
function shortLocation(location: string): string {
  // Step 1: drop the line and the column.
  const parts = location.split(':');
  while (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1]!)) parts.pop();
  // Step 2: keep the file name.
  const path = parts.join(':');
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(slash + 1) : path;
}

/** The component name without the angle brackets the tree keeps. */
function plainName(node: TreeNode): string {
  return node.kind === 'component' ? node.name.slice(1, -1) : node.name;
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

interface ValueCellProps {
  value: unknown;
  /** Writes a new value. A value without it is read only. */
  write?: (nextValue: unknown) => boolean;
  /** Writes into a value that is not a primitive, at a path inside it. */
  writeAt?: (path: readonly (string | number)[], nextValue: unknown) => boolean;
  /** The runtime node the graph can show. */
  node?: object;
  label: string;
  onViewInGraph?: (node: object) => void;
  /** Shown after the value, such as when it last changed. */
  note?: JSX.Element;
}

function ValueCell(props: ValueCellProps): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);
  const edit = createDraftEdit({
    value: () => props.value,
    write: (nextValue) => props.write?.(nextValue) ?? false,
  });

  const isComplex = createMemo(() => typeof props.value === 'object' && props.value !== null);
  // A Map, a Date or a class instance would come back from JSON as a plain
  // object, so only values that survive the round trip are edited as text.
  const textEditable = createMemo(() => !!props.write && isTextEditable(props.value));

  function valueTitle(): string {
    if (edit.failed()) return 'The app did not take this edit';
    if (!textEditable()) return isComplex() ? 'Click to expand' : '';
    if (isComplex()) return 'Click to expand, double-click to edit JSON';
    return typeof props.value === 'boolean' ? 'Click to toggle' : 'Click to edit';
  }

  function activate(): void {
    // Step 1: a boolean flips on one click.
    if (props.write && typeof props.value === 'boolean') {
      edit.write(!props.value);
      return;
    }
    // Step 2: an object opens, and a primitive goes to the editor.
    if (isComplex()) setExpanded((current) => !current);
    else if (textEditable()) edit.start();
  }

  return (
    <>
      <Show
        when={edit.editing()}
        fallback={
          <span
            data-solid-ownership-value
            data-editable={textEditable() ? '' : undefined}
            data-tone={valueTone(props.value)}
            data-solid-ownership-edit-failed={edit.failed() ? '' : undefined}
            title={valueTitle()}
            onClick={activate}
            onDblClick={() => {
              if (isComplex() && textEditable()) edit.start();
            }}
          >
            {previewValue(props.value)}
          </span>
        }
      >
        <DraftInput edit={edit} marker="data-solid-ownership-signal-input" />
      </Show>
      {props.note}
      <Show when={props.node && props.onViewInGraph}>
        <button
          type="button"
          data-solid-ownership-view-graph
          aria-label={`View ${props.label} in graph`}
          title="View in graph"
          onClick={() => props.onViewInGraph?.(props.node!)}
        >
          <EyeIcon title="View in graph" />
        </button>
      </Show>
      <Show when={isComplex() && expanded()}>
        <div data-solid-ownership-inspector>
          <ValueInspector
            value={props.value}
            open
            editable={!!props.writeAt}
            onEdit={(path, nextValue) => props.writeAt?.(path, nextValue) ?? false}
          />
        </div>
      </Show>
    </>
  );
}

interface KindChipProps {
  kind: 'prop' | 'signal' | 'memo' | 'other';
  children: JSX.Element;
}

function KindChip(props: KindChipProps): JSX.Element {
  return <span data-solid-ownership-kind-chip={props.kind}>{props.children}</span>;
}

interface ActivityEntry {
  activity: OwnerActivity;
  rate: number;
}

export default function OwnershipViewer(props: OwnershipViewerProps): JSX.Element {
  // The panel renders inside the app it inspects, so its own scope is marked.
  excludeOwner(getOwner());

  const [tree, setTree] = createSignal<OwnershipTree>(EMPTY_TREE);
  const [componentsOnly, setComponentsOnly] = createSignal(true);
  const [paused, setPaused] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [openRuns, setOpenRuns] = createSignal<string[]>([]);
  const [collapsed, setCollapsed] = createSignal<string[]>([]);
  const [selected, setSelected] = createSignal<string>();
  const [activity, setActivity] = createSignal(new Map<string, ActivityEntry>());
  const [now, setNow] = createSignal(Date.now());
  const detail = useResizableDetail({
    storageKey: 'solid-start-devtools:ownership-detail-width',
    defaultWidth: 480,
  });

  const firstSeen = new Map<string, number>();
  const rateSamples = new Map<string, RateSample[]>();
  let appliedFocus: { owner: object } | undefined;
  let treeElement: HTMLDivElement | undefined;

  // Takes the mode as an argument because reading a signal inside an effect
  // callback is not tracked.
  function refresh(mode: boolean): void {
    const next = snapshotOwnershipTree({ componentsOnly: mode, hideBuiltins: mode });
    const at = Date.now();
    for (const node of next.nodes) {
      if (!firstSeen.has(node.id)) firstSeen.set(node.id, at);
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

  // Heat comes from the reactivity graph. Each computation counts for the row
  // above it, so a row shows how much runs under it.
  function readActivity(nodes: TreeNode[]): void {
    const at = Date.now();
    const found = collectActivity(nodes, snapshotReactivityGraph().nodes);
    const next = new Map<string, ActivityEntry>();
    for (const [id, entry] of found) {
      let samples = rateSamples.get(id);
      if (!samples) {
        samples = [];
        rateSamples.set(id, samples);
      }
      next.set(id, { activity: entry, rate: pushRateSample(samples, at, entry.updates) });
    }
    setActivity(next);
    setNow(at);
  }

  createEffect(
    () => ({ watching: !!props.show && !paused(), nodes: tree().nodes }),
    (state) => {
      if (!state.watching) return;
      const read = () => readActivity(state.nodes);
      const stop = startReactivityTracking();
      const unsubscribe = subscribeReactivityGraph(read);
      read();
      // The ages in the rows move on without a graph change, so a clock runs.
      const clock = setInterval(() => setNow(Date.now()), 1000);
      return () => {
        clearInterval(clock);
        unsubscribe();
        stop();
      };
    },
  );
  onCleanup(() => rateSamples.clear());

  // The graph can ask for an owner. The request selects the closest row the
  // tree shows for it, opens the rows above that row, and waits for a snapshot
  // that contains it.
  createEffect(
    () => ({ request: props.focus, nodes: tree().nodes, visible: !!props.show }),
    ({ request, nodes, visible }) => {
      if (!request || !visible || request === appliedFocus) return;
      const known = new Map<string, TreeNode>();
      for (const node of nodes) known.set(node.id, node);
      let id: string | undefined;
      for (const candidate of ownerChainIds(request.owner)) {
        if (known.has(candidate)) {
          id = candidate;
          break;
        }
      }
      if (!id) return;
      appliedFocus = request;
      const open = new Set([id, ...ancestorsOf(known, id)]);
      setQuery('');
      setCollapsed((current) => current.filter((item) => !open.has(item)));
      setSelected(id);
      // The row exists after this flush renders, so scroll on the next frame.
      requestAnimationFrame(() => {
        treeElement?.querySelector(`[data-owner-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
      });
    },
  );

  const byId = createMemo(() => {
    const map = new Map<string, TreeNode>();
    for (const node of tree().nodes) map.set(node.id, node);
    return map;
  });

  // Siblings that share a name get a number, so `<OrderRow>` twice reads as #1 and #2.
  const instances = createMemo(() => {
    const out = new Map<string, number>();
    const groups = new Map<string, string[]>();
    for (const node of tree().nodes) {
      const key = `${node.parentId ?? ''}\u0000${node.name}`;
      const group = groups.get(key);
      if (group) group.push(node.id);
      else groups.set(key, [node.id]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (let index = 0; index < group.length; index++) out.set(group[index]!, index + 1);
    }
    return out;
  });

  const matches = createMemo(() => {
    const search = query().trim().toLowerCase();
    if (!search) return undefined;
    const nodes = byId();
    const keep = new Set<string>();
    for (const node of tree().nodes) {
      let hit = node.name.toLowerCase().includes(search) || node.kind.includes(search);
      for (const signal of node.signals) {
        if (hit) break;
        hit =
          signal.name.toLowerCase().includes(search) ||
          previewValue(signal.value).toLowerCase().includes(search);
      }
      for (const scope of node.scopes) {
        if (hit) break;
        hit =
          scope.name.toLowerCase().includes(search) ||
          previewValue(scope.value).toLowerCase().includes(search);
      }
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
    const chosen = selected();
    const opened = openRuns();

    function isOpen(child: string): boolean {
      const node = nodes.get(child);
      return !!node && node.children.length > 0 && !hidden.includes(child);
    }

    // Step 1: group same-name siblings, unless a search is showing them.
    function segmentsOf(children: string[]) {
      const items: RunItem[] = [];
      for (const child of children) {
        items.push({
          id: child,
          name: nodes.get(child)?.name ?? child,
          foldable: !visible && child !== chosen && !isOpen(child),
        });
      }
      return groupRuns(items);
    }

    function walk(id: string, indent: number): void {
      const node = nodes.get(id);
      if (!node) return;
      if (visible && !visible.has(id)) return;
      const children: string[] = [];
      for (const child of node.children) {
        if (!visible || visible.has(child)) children.push(child);
      }
      // A search result is always open, so matches deeper down stay reachable.
      const expanded = visible ? true : !hidden.includes(id);
      out.push({ node, indent, expandable: children.length > 0, expanded });
      if (!expanded) return;
      pushChildren(children, indent + 1);
    }

    function pushChildren(children: string[], indent: number): void {
      for (const segment of segmentsOf(children)) {
        if (segment.kind === 'item') {
          walk(segment.id, indent);
          continue;
        }
        // Step 2: an opened run shows its rows, a closed one shows one row.
        if (opened.includes(segment.ids[0]!)) {
          for (const child of segment.ids) walk(child, indent);
          continue;
        }
        const first = nodes.get(segment.ids[0]!)!;
        const last = nodes.get(segment.ids[segment.ids.length - 1]!)!;
        const label = `${plainName(first)} #${instances().get(first.id) ?? ''} … #${instances().get(last.id) ?? ''}`;
        out.push({
          node: first,
          indent,
          expandable: false,
          expanded: false,
          run: { ids: segment.ids, label },
        });
      }
    }

    // The roots follow the same rule as any other siblings.
    pushChildren(tree().roots, 0);
    return out;
  });

  function openRun(row: Row): void {
    const first = row.run?.ids[0];
    if (first) setOpenRuns((current) => [...current, first]);
  }

  function expandAll(): void {
    setCollapsed([]);
  }

  function collapseAll(): void {
    const ids: string[] = [];
    for (const node of tree().nodes) {
      if (node.children.length > 0) ids.push(node.id);
    }
    setCollapsed(ids);
  }

  /** Rows the tree holds, counting the ones a run stands for. */
  const shownCount = createMemo(() => {
    let count = 0;
    for (const row of rows()) count += row.run ? row.run.ids.length : 1;
    return count;
  });

  function toggle(id: string): void {
    setCollapsed((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  const selectedNode = createMemo(() => {
    const id = selected();
    return id ? byId().get(id) : undefined;
  });

  const ancestry = createMemo<TreeNode[]>(() => {
    const id = selected();
    if (!id) return [];
    const nodes = byId();
    const current = nodes.get(id);
    if (!current) return [];
    const frames = [current];
    for (const parent of ancestorsOf(nodes, id)) {
      const owner = nodes.get(parent);
      if (owner) frames.push(owner);
    }
    return frames;
  });

  // Props are getters. Reading them again each second keeps the values live.
  const propValues = createMemo<PropValue[]>(() => {
    const node = selectedNode();
    now();
    return node?.kind === 'component' ? readPropValues(node.owner) : [];
  });

  /** The text on the right of a row: its heat, else what it owns. */
  function metaOf(node: TreeNode) {
    const entry = activity().get(node.id);
    const heat = describeHeat(entry?.activity, entry?.rate ?? 0, now());
    let memos = 0;
    for (const scope of node.scopes) {
      if (scope.kind === 'memo') memos += 1;
    }
    const counts: string[] = [];
    if (node.signals.length > 0) counts.push(pluralize(node.signals.length, 'signal'));
    if (memos > 0) counts.push(pluralize(memos, 'memo'));
    let text = heat.text ?? (counts.length > 0 ? counts.join(' · ') : undefined);
    if (node.disposed) text = 'disposed';
    return { dot: heat.dot, text, tone: node.disposed ? ('red' as const) : heat.tone };
  }

  /** `<OrderRow #2>` for a component, the plain name for the rest. */
  function titleOf(node: TreeNode): string {
    const instance = instances().get(node.id);
    if (node.kind !== 'component') return node.name;
    return `<${plainName(node)}${instance ? ` #${instance}` : ''}>`;
  }

  function onRowKeyDown(event: KeyboardEvent, row: Row): void {
    if (event.target !== event.currentTarget) return;
    if (row.run) {
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowRight') return;
      openRun(row);
    } else if (event.key === 'Enter' || event.key === ' ') {
      setSelected((current) => (current === row.node.id ? undefined : row.node.id));
    } else if (event.key === 'ArrowRight' && row.expandable && !row.expanded) {
      toggle(row.node.id);
    } else if (event.key === 'ArrowLeft' && row.expandable && row.expanded) {
      toggle(row.node.id);
    } else {
      return;
    }
    event.preventDefault();
  }

  return (
    <Show when={props.show}>
      <div data-solid-dev-toolbar-panel>
        <div data-solid-ownership-viewer>
          <div
            data-solid-ownership-tree
            ref={(element) => {
              treeElement = element;
            }}
          >
            <div data-solid-ownership-filters>
              {props.lead}
              <input
                data-solid-ownership-search
                type="search"
                placeholder="Filter by component, scope or signal"
                aria-label="Filter the ownership tree"
                value={query()}
                onInput={(event) => setQuery(event.currentTarget.value)}
              />
              <button
                type="button"
                data-solid-structure-chip
                data-ghost
                data-solid-ownership-mode
                aria-pressed={componentsOnly() ? 'true' : 'false'}
                onClick={() => setComponentsOnly((current) => !current)}
              >
                Hide Solid internals
              </button>
              <span data-solid-ownership-count>{`${shownCount()} of ${tree().nodes.length}`}</span>
              <button
                type="button"
                data-solid-ownership-tool
                data-solid-ownership-pause
                aria-label={paused() ? 'Resume live updates' : 'Pause live updates'}
                title={paused() ? 'Resume live updates' : 'Pause live updates'}
                onClick={() => setPaused((current) => !current)}
              >
                <Show
                  when={paused()}
                  fallback={<PauseIcon title="Pause live updates" />}
                  children={<PlayIcon title="Resume live updates" />}
                />
              </button>
              <button
                type="button"
                data-solid-ownership-tool
                data-solid-ownership-expand-all
                aria-label="Expand all"
                title="Expand all"
                onClick={expandAll}
              >
                <ExpandIcon title="Expand all" />
              </button>
              <button
                type="button"
                data-solid-ownership-tool
                data-solid-ownership-collapse-all
                aria-label="Collapse all"
                title="Collapse all"
                onClick={collapseAll}
              >
                <CollapseIcon title="Collapse all" />
              </button>
            </div>
            <Show
              when={isOwnershipAvailable()}
              fallback={
                <Placeholder>The ownership tree needs a development build of solid-js.</Placeholder>
              }
            >
              <Show
                when={rows().length > 0}
                fallback={
                  <Placeholder>
                    {query() ? 'Nothing matches this filter.' : 'No owners observed yet.'}
                  </Placeholder>
                }
              >
                <div data-solid-ownership-rows role="tree">
                  <For
                    each={rows()}
                    keyed={(row) => (row.run ? `run:${row.node.id}` : row.node.id)}
                  >
                    {(row) => (
                      <div
                        data-solid-ownership-row
                        data-owner-id={row().node.id}
                        data-selected={!row().run && selected() === row().node.id ? '' : undefined}
                        data-solid-ownership-run={row().run ? '' : undefined}
                        data-fresh={
                          Date.now() - (firstSeen.get(row().node.id) ?? 0) < FRESH_MS
                            ? ''
                            : undefined
                        }
                        role="treeitem"
                        tabindex="0"
                        aria-selected={selected() === row().node.id ? 'true' : 'false'}
                        aria-expanded={
                          row().expandable ? (row().expanded ? 'true' : 'false') : undefined
                        }
                        style={{ 'padding-left': `${row().indent * INDENT}px` }}
                        onClick={() => {
                          if (row().run) openRun(row());
                          else
                            setSelected((current) =>
                              current === row().node.id ? undefined : row().node.id,
                            );
                        }}
                        onKeyDown={(event) => onRowKeyDown(event, row())}
                      >
                        <span
                          data-solid-ownership-chevron
                          data-leaf={row().expandable ? undefined : ''}
                          data-expanded={row().expanded ? '' : undefined}
                          aria-label={
                            row().expandable ? (row().expanded ? 'Collapse' : 'Expand') : undefined
                          }
                          onClick={(event) => {
                            // The caret opens the row and leaves the selection alone.
                            event.stopPropagation();
                            if (row().expandable) toggle(row().node.id);
                          }}
                        >
                          {row().run ? '▸' : row().expandable ? (row().expanded ? '▾' : '▸') : ''}
                        </span>
                        <span data-solid-ownership-label data-kind={row().node.kind}>
                          <Show
                            when={row().run}
                            fallback={
                              <>
                                <span data-solid-ownership-name>{plainName(row().node)}</span>
                                <Show when={instances().get(row().node.id)}>
                                  {(instance) => ` #${instance()}`}
                                </Show>
                              </>
                            }
                          >
                            {(run) => (
                              <>
                                <span data-solid-ownership-name>{run().label.split(' #')[0]}</span>
                                {run().label.slice(run().label.indexOf(' #'))}
                              </>
                            )}
                          </Show>
                        </span>
                        <Show when={!row().run && metaOf(row().node)}>
                          {(meta) => (
                            <span data-solid-ownership-meta data-tone={meta().tone}>
                              <Show when={meta().dot}>
                                {(dot) => <span data-solid-ownership-heat={dot()} />}
                              </Show>
                              {meta().text}
                            </span>
                          )}
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>

          <Show when={selectedNode()}>
            {(node) => {
              const entry = () => activity().get(node().id)?.activity;
              const parent = () => {
                const id = node().parentId;
                return id ? byId().get(id) : undefined;
              };
              const memos = () => node().scopes.filter((scope) => scope.kind === 'memo');
              const otherScopes = () => node().scopes.filter((scope) => scope.kind !== 'memo');

              // The line under the title: where it is, who owns it, how busy it is.
              const subLine = createMemo(() => {
                const parts: string[] = [];
                const location = node().location;
                if (location) parts.push(`${shortLocation(location)}${lineOf(location)}`);
                const owner = parent();
                if (owner) parts.push(`owned by ${plainName(owner)}`);
                const found = entry();
                if (found && found.updates > 0) {
                  const ago =
                    found.updatedAt > 0 ? `, last ${formatAgo(now() - found.updatedAt)} ago` : '';
                  parts.push(`${pluralize(found.updates, 'update')}${ago}`);
                } else {
                  parts.push('no updates yet');
                }
                if (node().disposed) parts.push('disposed');
                return parts.join(' · ');
              });

              return (
                <aside data-solid-ownership-detail style={{ width: `${detail.width()}px` }}>
                  <ResizeHandle detail={detail} />
                  <h2 data-solid-ownership-detail-head>{titleOf(node())}</h2>
                  <div data-solid-ownership-sub>{subLine()}</div>

                  <dl data-solid-ownership-kv>
                    <Show when={node().hasValue && node().kind !== 'component'}>
                      <dt>
                        <KindChip kind={node().kind === 'memo' ? 'memo' : 'other'}>
                          {node().kind}
                        </KindChip>
                        value
                      </dt>
                      <dd>
                        <ValueCell
                          value={node().value}
                          label="value"
                          node={isInGraph(node().kind) ? node().owner : undefined}
                          onViewInGraph={props.onViewInGraph}
                        />
                      </dd>
                    </Show>
                    <For each={propValues()}>
                      {(prop) => (
                        <>
                          <dt>
                            <KindChip kind="prop">prop</KindChip>
                            {prop.name}
                          </dt>
                          <dd>
                            <ValueCell value={prop.value} label={prop.name} />
                          </dd>
                        </>
                      )}
                    </For>
                    <For each={node().signals}>
                      {(signal) => {
                        const change = () => {
                          now();
                          return props.lastChange?.(signal.id, signal.node);
                        };
                        return (
                          <>
                            <dt data-solid-ownership-signal>
                              <KindChip kind="signal">signal</KindChip>
                              {signal.name}
                            </dt>
                            <dd>
                              <ValueCell
                                value={signal.value}
                                label={signal.name}
                                node={signal.node}
                                write={(next) => writeReactiveValue(signal.node, [], next)}
                                writeAt={(path, next) =>
                                  writeReactiveValue(signal.node, path, next)
                                }
                                onViewInGraph={props.onViewInGraph}
                                note={
                                  <Show when={change()}>
                                    {(last) => (
                                      <span data-solid-ownership-was>
                                        {`${last().prev !== undefined ? `was ${last().prev} · ` : 'changed '}${formatAgo(
                                          performance.now() - last().at,
                                        )} ago`}
                                      </span>
                                    )}
                                  </Show>
                                }
                              />
                            </dd>
                          </>
                        );
                      }}
                    </For>
                    <For each={memos()}>
                      {(scope) => (
                        <>
                          <dt>
                            <KindChip kind="memo">memo</KindChip>
                            {scope.name}
                          </dt>
                          <dd>
                            <ValueCell
                              value={scope.value}
                              label={scope.name}
                              node={scope.node}
                              onViewInGraph={props.onViewInGraph}
                            />
                          </dd>
                        </>
                      )}
                    </For>
                  </dl>
                  <Show
                    when={
                      propValues().length +
                        node().signals.length +
                        memos().length +
                        (node().hasValue && node().kind !== 'component' ? 1 : 0) ===
                      0
                    }
                  >
                    <div data-solid-ownership-empty>
                      {node().kind === 'component'
                        ? 'No props, signals or memos.'
                        : 'This owner holds nothing.'}
                    </div>
                  </Show>

                  <Show when={otherScopes().length > 0}>
                    <div data-solid-ownership-sect>Scopes</div>
                    <dl data-solid-ownership-kv>
                      <For each={otherScopes()}>
                        {(scope) => (
                          <>
                            <dt>
                              <KindChip kind="other">{scope.kind}</KindChip>
                              {scope.name}
                            </dt>
                            <dd>
                              <Show when={scope.hasValue}>
                                <ValueCell
                                  value={scope.value}
                                  label={scope.name}
                                  node={isInGraph(scope.kind) ? scope.node : undefined}
                                  onViewInGraph={props.onViewInGraph}
                                />
                              </Show>
                            </dd>
                          </>
                        )}
                      </For>
                    </dl>
                  </Show>

                  <div data-solid-ownership-buttons>
                    <Show when={node().location}>
                      {(location) => (
                        <HealthButton primary onClick={() => openInEditor(location())}>
                          <svg
                            viewBox="0 0 24 24"
                            width="14"
                            height="14"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.6"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />
                          </svg>
                          {`Open ${shortLocation(location())}${lineOf(location())}`}
                        </HealthButton>
                      )}
                    </Show>
                    <Show when={props.onShowActivity}>
                      <HealthButton
                        onClick={() => props.onShowActivity?.(node().owner, plainName(node()))}
                      >
                        Activity for this owner
                      </HealthButton>
                    </Show>
                    <Show when={props.onViewInGraph && isInGraph(node().kind)}>
                      <HealthButton onClick={() => props.onViewInGraph?.(node().owner)}>
                        View in graph
                      </HealthButton>
                    </Show>
                    <CopyReportButton
                      label={`this ${node().kind}`}
                      text="Copy report"
                      report={() =>
                        ownerReport({
                          node: node(),
                          ancestry: ancestry(),
                          nodes: byId(),
                          route: pageRoute(),
                        })
                      }
                    />
                  </div>

                  <div data-solid-ownership-sect>
                    <span>Ancestry</span>
                    <span>{ancestry().length}</span>
                  </div>
                  <div data-solid-ownership-stack>
                    <For each={ancestry()}>
                      {(frame, index) => (
                        <button
                          type="button"
                          data-solid-ownership-frame
                          data-current={index() === 0 ? '' : undefined}
                          onClick={() => setSelected(frame.id)}
                        >
                          <span data-solid-ownership-frame-name>{titleOf(frame)}</span>
                          <Show when={frame.location}>
                            {(location) => (
                              <span data-solid-ownership-frame-location>
                                {shortLocation(location()) + lineOf(location())}
                              </span>
                            )}
                          </Show>
                        </button>
                      )}
                    </For>
                  </div>
                </aside>
              );
            }}
          </Show>
        </div>
      </div>
    </Show>
  );
}

/** `:41` from `src/OrderTable.tsx:41:7`, or nothing when the location has no line. */
function lineOf(location: string): string {
  const parts = location.split(':');
  const last = parts[parts.length - 1]!;
  if (parts.length > 2 && /^\d+$/.test(last) && /^\d+$/.test(parts[parts.length - 2]!)) {
    return `:${parts[parts.length - 2]}`;
  }
  if (parts.length === 2 && /^\d+$/.test(last)) return `:${last}`;
  return '';
}
