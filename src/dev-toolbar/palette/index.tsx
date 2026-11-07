import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, For, onSettled, Show } from 'solid-js';
import { snapshotOwnershipTree, startOwnershipTracking } from '../ownership/registry.js';
import { formatValue } from '../reactivity/format.js';
import { snapshotReactivityGraph, startReactivityTracking } from '../reactivity/registry.js';
import type { ServerFunctionInstance } from '../functions/index.js';
import type { TimelineEntry } from '../timeline/tracker.js';
import {
  searchPalette,
  type PaletteItem,
  type PaletteMatch,
  type PaletteTarget,
} from './search.js';
import './styles.css';

export interface CommandPaletteProps {
  entries: TimelineEntry[];
  instances: Record<string, ServerFunctionInstance | undefined>;
  onPick: (target: PaletteTarget) => void;
  onClose: () => void;
}

/** How long ago a `performance.now()` time was, in words. */
function ago(at: number): string {
  const seconds = Math.max(0, Math.round((performance.now() - at) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function shorten(text: string, max = 32): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Everything the palette can jump to, read once when it opens. */
function collectItems(props: CommandPaletteProps): PaletteItem[] {
  const items: PaletteItem[] = [];

  // Components come from the ownership tree, folded down to components.
  for (const node of snapshotOwnershipTree({ componentsOnly: true }).nodes) {
    if (node.kind !== 'component') continue;
    items.push({
      group: 'Components',
      label: node.name,
      detail: node.location ?? `${node.signals.length} signals`,
      target: { kind: 'component', owner: node.owner },
    });
  }

  // Signals and memos come from the reactive graph, with their current value.
  for (const node of snapshotReactivityGraph().nodes) {
    if (node.kind !== 'signal' && node.kind !== 'memo') continue;
    const owner = node.ownerPath[node.ownerPath.length - 1];
    const value = shorten(formatValue(node.value));
    items.push({
      group: node.kind === 'memo' ? 'Memos' : 'Signals',
      label: node.name,
      detail: owner ? `${value} · ${owner}` : value,
      target: { kind: node.kind, node: node.raw },
    });
  }

  // Actions, newest first as the timeline holds them.
  for (const entry of props.entries) {
    items.push({
      group: 'Actions',
      label: entry.label,
      detail: ago(entry.at),
      target: { kind: 'action', origin: entry.origin, id: entry.id },
    });
  }

  // Server functions by name, with how many calls each made.
  const calls = new Map<string, { instance: string; count: number }>();
  for (const [instance, value] of Object.entries(props.instances)) {
    if (!value) continue;
    const name = String(value.request.meta?.name ?? value.request.id);
    const known = calls.get(name);
    if (known) known.count++;
    else calls.set(name, { instance, count: 1 });
  }
  for (const [name, { instance, count }] of calls) {
    items.push({
      group: 'Server functions',
      label: name,
      detail: count === 1 ? '1 call' : `${count} calls`,
      target: { kind: 'call', instance },
    });
  }
  return items;
}

/** The label with its matched characters marked. */
function Highlighted(props: { match: PaletteMatch }): JSX.Element {
  const parts = createMemo(() => {
    const marked = new Set(props.match.positions);
    const result: { text: string; marked: boolean }[] = [];
    for (const [index, char] of [...props.match.item.label].entries()) {
      const last = result[result.length - 1];
      const isMarked = marked.has(index);
      if (last && last.marked === isMarked) last.text += char;
      else result.push({ text: char, marked: isMarked });
    }
    return result;
  });
  return (
    <code>
      <For each={parts()}>{(part) => (part.marked ? <mark>{part.text}</mark> : part.text)}</For>
    </code>
  );
}

const KIND_CHIPS: Record<PaletteTarget['kind'], { text: string; kind: string }> = {
  component: { text: '<>', kind: 'component' },
  memo: { text: 'memo', kind: 'memo' },
  signal: { text: 'signal', kind: 'signal' },
  action: { text: 'A', kind: 'action' },
  call: { text: 'ƒ', kind: 'call' },
};

/** ⌘K: jump to a component, signal, memo, action or server function by name. */
export default function CommandPalette(props: CommandPaletteProps): JSX.Element {
  const [query, setQuery] = createSignal('');
  const [active, setActive] = createSignal(0);
  const [items, setItems] = createSignal<PaletteItem[]>([]);
  let input: HTMLInputElement | undefined;

  // The registries only see nodes while something tracks them, so the palette
  // tracks while it is open and reads once the trackers have walked the app.
  onSettled(() => {
    const stopOwnership = startOwnershipTracking();
    const stopReactivity = startReactivityTracking();
    const frame = requestAnimationFrame(() => setItems(collectItems(props)));
    input?.focus();
    return () => {
      cancelAnimationFrame(frame);
      stopOwnership();
      stopReactivity();
    };
  });

  const matches = createMemo(() => searchPalette(items(), query()));

  function pick(match: PaletteMatch | undefined): void {
    if (!match) return;
    props.onPick(match.item.target);
    props.onClose();
  }

  function onKeyDown(event: KeyboardEvent): void {
    const count = matches().length;
    if (event.key === 'ArrowDown') setActive((index) => (count ? (index + 1) % count : 0));
    else if (event.key === 'ArrowUp')
      setActive((index) => (count ? (index - 1 + count) % count : 0));
    else if (event.key === 'Enter') pick(matches()[active()]);
    else if (event.key === 'Escape') props.onClose();
    else return;
    event.preventDefault();
  }

  return (
    <div
      data-solid-palette-backdrop
      onPointerDown={(event) => event.target === event.currentTarget && props.onClose()}
    >
      <div data-solid-palette role="dialog" aria-label="Find in the app" onKeyDown={onKeyDown}>
        <label data-solid-palette-query>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6" />
            <path d="m20 20-4.5-4.5" />
          </svg>
          <input
            ref={input}
            type="text"
            placeholder="Find signal, component, call"
            aria-label="Find signal, component, call"
            role="combobox"
            aria-expanded="true"
            aria-controls="solid-palette-results"
            aria-activedescendant={matches().length ? `solid-palette-item-${active()}` : undefined}
            value={query()}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setActive(0);
            }}
          />
          <kbd>esc</kbd>
        </label>
        <div data-solid-palette-results id="solid-palette-results" role="listbox">
          <Show
            when={matches().length}
            fallback={
              <div data-solid-palette-empty>
                {items().length ? 'No matches.' : 'Reading the app…'}
              </div>
            }
          >
            <For each={matches()}>
              {(match, index) => {
                const chip = KIND_CHIPS[match.item.target.kind];
                const heading = () =>
                  index() === 0 || matches()[index() - 1]!.item.group !== match.item.group;
                return (
                  <>
                    <Show when={heading()}>
                      <div data-solid-palette-group>{match.item.group}</div>
                    </Show>
                    <div
                      id={`solid-palette-item-${index()}`}
                      role="option"
                      aria-selected={active() === index() ? 'true' : 'false'}
                      data-solid-palette-item
                      onPointerMove={() => setActive(index())}
                      onClick={() => pick(match)}
                    >
                      <span data-solid-palette-kind={chip.kind}>{chip.text}</span>
                      <Highlighted match={match} />
                      <span data-solid-palette-detail>{match.item.detail}</span>
                    </div>
                  </>
                );
              }}
            </For>
          </Show>
        </div>
      </div>
    </div>
  );
}
