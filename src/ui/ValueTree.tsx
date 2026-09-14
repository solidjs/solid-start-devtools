import type { JSX } from '@solidjs/web';
import { createSignal, Show } from 'solid-js';
import { Text } from './Text.js';
import './ValueTree.css';

export type ValueTokenKind = 'key' | 'string' | 'number' | 'keyword' | 'plain';

export interface ValueTokenProps {
  value: string | number | boolean | undefined | null;
  kind?: ValueTokenKind;
}

/** One coloured token in a value tree, such as a key, a string or a number. */
export function ValueToken(props: ValueTokenProps): JSX.Element {
  return (
    <Text
      data-solid-value-token={props.kind ?? 'plain'}
      options={{ size: 'xs', weight: 'semibold', font: 'mono', wrap: 'nowrap' }}
    >
      {`${props.value}`}
    </Text>
  );
}

export function ValueSeparator(): JSX.Element {
  return (
    <Text data-solid-value-separator options={{ size: 'xs', weight: 'semibold', wrap: 'nowrap' }}>
      :
    </Text>
  );
}

export interface TreeKeyProps {
  value: string | number;
  kind?: Exclude<ValueTokenKind, 'string' | 'plain'>;
}

/** The key half of a row, followed by its separator. */
export function TreeKey(props: TreeKeyProps): JSX.Element {
  return (
    <span data-solid-value-tree-key>
      <ValueToken kind={props.kind ?? 'key'} value={props.value} />
      <ValueSeparator />
    </span>
  );
}

export interface TreeLeafProps {
  label?: JSX.Element;
  children: JSX.Element;
}

/** A row with nothing to expand. */
export function TreeLeaf(props: TreeLeafProps): JSX.Element {
  return (
    <div data-solid-value-tree-node>
      <div data-solid-value-tree-row>
        <span data-solid-value-tree-chevron data-leaf="true" />
        {props.label}
        {props.children}
      </div>
    </div>
  );
}

export interface TreeBranchProps {
  label?: JSX.Element;
  badges?: JSX.Element;
  /** Shown in place of the children while the row is closed. */
  preview: JSX.Element;
  open?: boolean;
  children: JSX.Element;
}

/** A row that opens to show its children. */
export function TreeBranch(props: TreeBranchProps): JSX.Element {
  const [open, setOpen] = createSignal(props.open ?? false);
  return (
    <div data-solid-value-tree-node>
      <button
        type="button"
        data-solid-value-tree-row
        data-expanded={open() ? 'true' : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span data-solid-value-tree-chevron />
        {props.label}
        {props.badges}
        <Show when={!open()}>
          <span data-solid-value-tree-preview>{props.preview}</span>
        </Show>
      </button>
      <Show when={open()}>
        <div data-solid-value-tree-children>{props.children}</div>
      </Show>
    </div>
  );
}

export interface TreeMarkProps {
  children: JSX.Element;
}

/** Marks a row that points back at a value already shown higher up. */
export function TreeMark(props: TreeMarkProps): JSX.Element {
  return <span data-solid-value-tree-mark>{props.children}</span>;
}
