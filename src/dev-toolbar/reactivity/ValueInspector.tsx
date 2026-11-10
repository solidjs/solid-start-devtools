import type { JSX } from '@solidjs/web';
import { createMemo, For, Show } from 'solid-js';
import { Badge } from '../../ui/Badge.js';
import {
  TreeBranch,
  TreeKey,
  TreeLeaf,
  TreeMark,
  ValueToken,
  type ValueTokenKind,
} from '../../ui/ValueTree.js';
import { EditIcon } from '../icons.js';
import { formatValue, typeName } from './format.js';
import { containerEntries, entryCount, ownEntries } from './value-entries.js';
import { createDraftEdit } from './draft-edit.js';
import { DraftInput } from './DraftInput.js';
import { formatDraftValue, isPlainContainer } from './value-editor.js';

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

/** Writes `nextValue` at `path`. Returns false when the app did not take it. */
export type ValueEditHandler = (path: readonly (string | number)[], nextValue: unknown) => boolean;

interface EditableValueProps {
  value: string | number | boolean | bigint | null | undefined;
  kind?: ValueTokenKind;
  path: readonly (string | number)[];
  onEdit: ValueEditHandler;
}

const FAILED_TITLE = 'The app did not take this edit';

function EditableValue(props: EditableValueProps): JSX.Element {
  const edit = createDraftEdit({
    value: () => props.value,
    write: (nextValue) => props.onEdit(props.path, nextValue),
  });

  if (typeof props.value === 'boolean') {
    return (
      <span data-solid-value-editable-container>
        <button
          type="button"
          data-solid-value-toggle-btn
          data-value={props.value ? 'true' : 'false'}
          data-solid-value-edit-failed={edit.failed() ? '' : undefined}
          onClick={() => edit.write(!props.value)}
          title={edit.failed() ? FAILED_TITLE : 'Click to toggle boolean'}
        >
          <ValueToken kind="keyword" value={props.value} />
        </button>
      </span>
    );
  }

  return (
    <span data-solid-value-editable-container>
      <Show
        when={edit.editing()}
        fallback={
          <span
            data-solid-value-editable-trigger
            data-solid-value-edit-failed={edit.failed() ? '' : undefined}
            onDblClick={edit.start}
            title={edit.failed() ? FAILED_TITLE : 'Double-click to edit'}
          >
            <ValueToken kind={props.kind} value={formatDraftValue(props.value)} />
            <button
              type="button"
              data-solid-value-edit-btn
              onClick={edit.start}
              aria-label="Edit value"
              title="Edit value"
            >
              <EditIcon title="Edit value" />
            </button>
          </span>
        }
      >
        <DraftInput edit={edit} marker="data-solid-value-input" />
      </Show>
    </span>
  );
}

export interface ValueInspectorProps {
  value: unknown;
  label?: JSX.Element;
  /** Open the row on first render. */
  open?: boolean;
  /** Values already shown higher up this branch, used to catch cycles. */
  seen?: object[];
  /** Whether leaf values can be edited interactively. */
  editable?: boolean;
  /** Callback fired when a leaf or nested property is updated. */
  onEdit?: ValueEditHandler;
  /** Path from the root inspected value down to this node. */
  path?: readonly (string | number)[];
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
    renderValue(
      props.value,
      props.label,
      props.open,
      props.seen ?? [],
      props.editable,
      props.onEdit,
      props.path ?? [],
    ),
  );
  return <>{tree()}</>;
}

function renderValue(
  value: unknown,
  label: JSX.Element | undefined,
  open: boolean | undefined,
  seen: object[],
  editable: boolean | undefined,
  onEdit: ValueEditHandler | undefined,
  path: readonly (string | number)[],
): JSX.Element {
  if (value === null) {
    return (
      <TreeLeaf label={label}>
        <Show when={editable && onEdit} fallback={<ValueToken kind="keyword" value="null" />}>
          <EditableValue value={null} kind="keyword" path={path} onEdit={onEdit!} />
        </Show>
      </TreeLeaf>
    );
  }

  switch (typeof value) {
    case 'undefined':
      return (
        <TreeLeaf label={label}>
          <Show
            when={editable && onEdit}
            fallback={<ValueToken kind="keyword" value="undefined" />}
          >
            <EditableValue value={undefined} kind="keyword" path={path} onEdit={onEdit!} />
          </Show>
        </TreeLeaf>
      );
    case 'string':
      return (
        <TreeLeaf label={label}>
          <Show
            when={editable && onEdit}
            fallback={<ValueToken kind="string" value={`"${value}"`} />}
          >
            <EditableValue value={value} kind="string" path={path} onEdit={onEdit!} />
          </Show>
        </TreeLeaf>
      );
    case 'number':
      return (
        <TreeLeaf label={label}>
          <Show when={editable && onEdit} fallback={<ValueToken kind="number" value={value} />}>
            <EditableValue value={value} kind="number" path={path} onEdit={onEdit!} />
          </Show>
        </TreeLeaf>
      );
    case 'bigint':
      return (
        <TreeLeaf label={label}>
          <Show
            when={editable && onEdit}
            fallback={<ValueToken kind="number" value={`${value}n`} />}
          >
            <EditableValue value={value} kind="number" path={path} onEdit={onEdit!} />
          </Show>
        </TreeLeaf>
      );
    case 'boolean':
      return (
        <TreeLeaf label={label}>
          <Show when={editable && onEdit} fallback={<ValueToken kind="keyword" value={value} />}>
            <EditableValue value={value} kind="keyword" path={path} onEdit={onEdit!} />
          </Show>
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
  // Edits copy each container on the path with a spread, which would turn a
  // Map, a Set or a class instance into a plain object, so only plain
  // containers pass editing down.
  const editChildren = editable && isPlainContainer(object);

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
                    editable={editChildren}
                    onEdit={onEdit}
                    path={[...path, entry.key]}
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
