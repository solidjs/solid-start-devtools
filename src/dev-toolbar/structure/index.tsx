import type { JSX } from '@solidjs/web';
import { createSignal, For } from 'solid-js';
import OwnershipViewer, { type SignalChange } from '../ownership/index.js';
import ReactivityViewer from '../reactivity/index.js';
import './styles.css';

export type StructureMode = 'owners' | 'graph';

export type { SignalChange };

export interface StructureViewerProps {
  show?: boolean;
  /** Which of the two the view shows. Leave it out to let the view keep its own. */
  mode?: StructureMode;
  onModeChange?: (mode: StructureMode) => void;
  /** A signal, memo or effect another panel asked the graph to show. */
  focus?: { node: object };
  /** An owner another panel asked the tree to show. Pass a new object for every request. */
  ownerFocus?: { owner: object };
  /** Graph: only nodes owned by or under this component instance. */
  ownerFilter?: object;
  /** Graph: only nodes owned by or under a component of this name. */
  componentFilter?: string;
  onClearComponentFilter?: () => void;
  /** Graph: opens the owner of a node in the tree. */
  onViewOwner?: (owner: object) => void;
  /** Tree: opens a signal, memo or effect in the graph. */
  onViewInGraph?: (node: object) => void;
  /** The last change of a signal, from the timeline. The second argument is the runtime signal. */
  lastChange?: (nodeId: string | number, node?: object) => SignalChange | undefined;
  /** Opens the activity of an owner. */
  onShowActivity?: (owner: object, name: string) => void;
}

const MODES: { value: StructureMode; label: string; name: string }[] = [
  { value: 'owners', label: 'Owners', name: 'Ownership' },
  { value: 'graph', label: 'Graph', name: 'Reactivity' },
];

interface ModeChipsProps {
  mode: StructureMode;
  onChange: (mode: StructureMode) => void;
}

/** The Owners and Graph chips. Both sides of the view show them. */
function ModeChips(props: ModeChipsProps): JSX.Element {
  function moveMode(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    props.onChange(props.mode === 'owners' ? 'graph' : 'owners');
    // The chip that takes over is the one that is now selected.
    queueMicrotask(() => {
      (event.currentTarget as HTMLElement | null)?.parentElement
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.focus();
    });
  }

  return (
    <div data-solid-structure-modes role="tablist" aria-label="Structure">
      <For each={MODES}>
        {(entry) => (
          <button
            type="button"
            role="tab"
            data-solid-structure-chip
            data-solid-structure-mode={entry.value}
            aria-label={entry.name}
            aria-selected={props.mode === entry.value ? 'true' : 'false'}
            tabindex={props.mode === entry.value ? 0 : -1}
            onClick={() => props.onChange(entry.value)}
            onKeyDown={moveMode}
          >
            {entry.label}
          </button>
        )}
      </For>
    </div>
  );
}

/**
 * The Structure view: the ownership tree and the reactivity graph behind one
 * pair of chips. Selecting a chip swaps the pane, and each pane keeps its own
 * selection while it is hidden.
 */
export default function StructureViewer(props: StructureViewerProps): JSX.Element {
  const [ownMode, setOwnMode] = createSignal<StructureMode>('owners');
  const mode = () => props.mode ?? ownMode();

  function changeMode(next: StructureMode): void {
    setOwnMode(next);
    props.onModeChange?.(next);
  }

  const chips = () => <ModeChips mode={mode()} onChange={changeMode} />;

  return (
    <>
      <OwnershipViewer
        show={!!props.show && mode() === 'owners'}
        focus={props.ownerFocus}
        onViewInGraph={props.onViewInGraph}
        lastChange={props.lastChange}
        onShowActivity={props.onShowActivity}
        lead={chips()}
      />
      <ReactivityViewer
        show={!!props.show && mode() === 'graph'}
        focus={props.focus}
        ownerFilter={props.ownerFilter}
        componentFilter={props.componentFilter}
        onClearComponentFilter={props.onClearComponentFilter}
        onViewOwner={props.onViewOwner}
        lead={chips()}
      />
    </>
  );
}
