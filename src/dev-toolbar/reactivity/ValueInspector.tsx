import type { JSX } from '@solidjs/web';
import { createMemo, For, Show } from 'solid-js';
import { Badge } from '../../ui/Badge.js';
import { TreeBranch, TreeKey, TreeLeaf, TreeMark, ValueToken } from '../../ui/ValueTree.js';
import { formatValue, typeName } from './format.js';
import { containerEntries, entryCount, ownEntries } from './value-entries.js';

function LinkIcon(props: { title: string }): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <title>{props.title}</title>
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
      />
    </svg>
  );
}

export interface ValueInspectorProps {
  value: unknown;
  label?: JSX.Element;
  /** Open the row on first render. */
  open?: boolean;
  /** Values already shown higher up this branch, used to catch cycles. */
  seen?: object[];
}

/**
 * Renders a live value as an expandable tree, the same shape the server
 * function panel uses for serialized values.
 *
 * Children are only built when a row opens, so a deep object costs nothing
 * until it is inspected.
 */
export function ValueInspector(props: ValueInspectorProps): JSX.Element {
  // The tree is rebuilt when the value changes, so the reads below have to
  // happen inside a tracking scope.
  const tree = createMemo(() =>
    renderValue(props.value, props.label, props.open, props.seen ?? []),
  );
  return <>{tree()}</>;
}

function renderValue(
  value: unknown,
  label: JSX.Element | undefined,
  open: boolean | undefined,
  seen: object[],
): JSX.Element {
  if (value === null) {
    return (
      <TreeLeaf label={label}>
        <ValueToken kind="keyword" value="null" />
      </TreeLeaf>
    );
  }

  switch (typeof value) {
    case 'undefined':
      return (
        <TreeLeaf label={label}>
          <ValueToken kind="keyword" value="undefined" />
        </TreeLeaf>
      );
    case 'string':
      return (
        <TreeLeaf label={label}>
          <ValueToken kind="string" value={`"${value}"`} />
        </TreeLeaf>
      );
    case 'number':
      return (
        <TreeLeaf label={label}>
          <ValueToken kind="number" value={value} />
        </TreeLeaf>
      );
    case 'bigint':
      return (
        <TreeLeaf label={label}>
          <ValueToken kind="number" value={`${value}n`} />
        </TreeLeaf>
      );
    case 'boolean':
      return (
        <TreeLeaf label={label}>
          <ValueToken kind="keyword" value={value} />
        </TreeLeaf>
      );
    case 'symbol':
      return (
        <TreeLeaf label={label}>
          <ValueToken kind="keyword" value={value.toString()} />
        </TreeLeaf>
      );
    case 'function':
      return (
        <TreeLeaf label={label}>
          <Badge type="info">function</Badge>
          <ValueToken kind="keyword" value={formatValue(value)} />
        </TreeLeaf>
      );
  }

  // Everything primitive returned above, so what is left is an object.
  const object = value as object;

  if (seen.includes(object)) {
    return (
      <TreeLeaf label={label}>
        <TreeMark>
          <LinkIcon title="Already shown higher up" />
          <Badge type="info">circular</Badge>
        </TreeMark>
      </TreeLeaf>
    );
  }

  // Values with nothing useful to expand read better as one row.
  if (object instanceof Date || object instanceof RegExp || object instanceof Promise) {
    return (
      <TreeLeaf label={label}>
        <Badge type="info">{typeName(object)}</Badge>
        <ValueToken kind="string" value={formatValue(object)} />
      </TreeLeaf>
    );
  }

  if (typeof Node === 'function' && object instanceof Node) {
    return (
      <TreeLeaf label={label}>
        <Badge type="info">dom</Badge>
        <ValueToken kind="string" value={formatValue(object)} />
      </TreeLeaf>
    );
  }

  const count = entryCount(object);
  const type = typeName(object);
  const badges = (
    <>
      <Badge type="info">{type}</Badge>
      <Show when={count !== undefined}>
        <Badge type="info">{`${count}`}</Badge>
      </Show>
    </>
  );

  const nested = [...seen, object];

  return (
    <TreeBranch label={label} badges={badges} open={open} preview={formatValue(object)}>
      {(() => {
        const entries = containerEntries(object) ?? ownEntries(object);
        const total = count ?? entries.length;
        return (
          <>
            <For
              each={entries}
              fallback={
                <TreeLeaf>
                  <ValueToken kind="keyword" value="no entries" />
                </TreeLeaf>
              }
            >
              {(entry) => (
                <Show
                  when={!entry.accessor}
                  fallback={
                    <TreeLeaf label={<TreeKey value={entry.key} kind={entry.keyKind} />}>
                      <Badge type="warning">getter</Badge>
                    </TreeLeaf>
                  }
                >
                  <ValueInspector
                    value={entry.value}
                    seen={nested}
                    label={<TreeKey value={entry.key} kind={entry.keyKind} />}
                  />
                </Show>
              )}
            </For>
            <Show when={total > entries.length}>
              <TreeLeaf>
                <ValueToken kind="keyword" value={`${total - entries.length} more`} />
              </TreeLeaf>
            </Show>
          </>
        );
      })()}
    </TreeBranch>
  );
}
