import type { JSX } from '@solidjs/web';
import { For, Show } from 'solid-js';
import {
  axisMarks,
  makeWindow,
  shiftWindow,
  timeAt,
  type LaneTick,
  type Lanes,
  type TimeWindow,
} from './model.js';

/** Narrowest window, as a share of the range. */
const MIN_WINDOW = 0.01;
/** One arrow key press moves the window by this share of the range. */
const KEY_STEP = 0.02;
/** Pixels a drag has to travel before it counts as a drag and not a click. */
const DRAG_SLOP = 3;

const MARKS = axisMarks();

type DragMode = 'new' | 'move' | 'from' | 'to';

export interface ScrubProps {
  lanes: Lanes;
  window: TimeWindow | undefined;
  selected: string | undefined;
  onWindow: (window: TimeWindow | undefined) => void;
}

function Ticks(props: { ticks: LaneTick[]; selected: string | undefined }): JSX.Element {
  return (
    <For each={props.ticks} keyed={(tick) => tick.member}>
      {(tick) => (
        <span
          data-solid-activity-tick
          data-big={tick().big ? '' : undefined}
          data-selected={props.selected === tick().member ? '' : undefined}
          style={{
            left: `${tick().left}%`,
            width: tick().width ? `${tick().width}%` : undefined,
          }}
        />
      )}
    </For>
  );
}

/** Three lanes of ticks along the time the session covers, and a window to pick a range of it. */
export function Scrub(props: ScrubProps): JSX.Element {
  let track: HTMLDivElement | undefined;

  function shown(): { left: number; width: number } | undefined {
    const range = props.window;
    if (!range) return undefined;
    const span = props.lanes.end - props.lanes.start;
    const left = Math.max(0, ((range.from - props.lanes.start) / span) * 100);
    const right = Math.min(100, ((range.to - props.lanes.start) / span) * 100);
    if (right <= left) return undefined;
    return { left, width: right - left };
  }

  function startDrag(event: PointerEvent, mode: DragMode): void {
    if (event.button !== 0 || !track) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = track.getBoundingClientRect();
    if (!rect.width) return;
    const lanes = props.lanes;
    const base = props.window;
    const span = lanes.end - lanes.start;
    const minMs = span * MIN_WINDOW;
    const startX = event.clientX;
    const startTime = timeAt(lanes, (startX - rect.left) / rect.width);
    let moved = false;

    function onMove(next: PointerEvent): void {
      const dx = next.clientX - startX;
      if (Math.abs(dx) > DRAG_SLOP) moved = true;
      if (!moved) return;
      const time = timeAt(lanes, (next.clientX - rect.left) / rect.width);
      if (mode === 'new') props.onWindow(makeWindow(lanes, startTime, time, minMs));
      else if (!base) return;
      else if (mode === 'move') props.onWindow(shiftWindow(lanes, base, (dx / rect.width) * span));
      else if (mode === 'from') props.onWindow(makeWindow(lanes, time, base.to, minMs));
      else props.onWindow(makeWindow(lanes, base.from, time, minMs));
    }

    function onUp(): void {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      // A click on the bare strip drops the window.
      if (mode === 'new' && !moved) props.onWindow(undefined);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function onKeyDown(event: KeyboardEvent): void {
    const current = props.window;
    if (!current) return;
    const span = props.lanes.end - props.lanes.start;
    if (event.key === 'Escape') props.onWindow(undefined);
    else if (event.key === 'ArrowLeft')
      props.onWindow(shiftWindow(props.lanes, current, -span * KEY_STEP));
    else if (event.key === 'ArrowRight')
      props.onWindow(shiftWindow(props.lanes, current, span * KEY_STEP));
    else return;
    event.preventDefault();
  }

  return (
    <div data-solid-activity-scrub>
      <div data-solid-activity-lane="actions">
        <label>Actions</label>
        <Ticks ticks={props.lanes.actions} selected={props.selected} />
      </div>
      <div data-solid-activity-lane="server">
        <label>Server</label>
        <Ticks ticks={props.lanes.server} selected={props.selected} />
      </div>
      <div data-solid-activity-lane="async">
        <label>Async</label>
        <Ticks ticks={props.lanes.async} selected={props.selected} />
      </div>
      <div data-solid-activity-grid aria-hidden="true">
        <For each={MARKS}>
          {(mark) => <span data-solid-activity-gridline style={{ left: `${mark.left}%` }} />}
        </For>
        <span data-solid-activity-nowline />
      </div>
      <div data-solid-activity-axis aria-hidden="true">
        <For each={MARKS}>
          {(mark) => (
            <span data-solid-activity-axis-label style={{ left: `${mark.left}%` }}>
              {mark.label}
            </span>
          )}
        </For>
      </div>
      <div
        ref={track}
        data-solid-activity-track-area
        title="Drag to pick a time range, click to clear it"
        onPointerDown={(event) => startDrag(event, 'new')}
      >
        <Show when={shown()}>
          {(box) => (
            <div
              data-solid-activity-window
              role="group"
              tabindex="0"
              aria-label="Time range. Drag to move it, press Escape to clear it."
              style={{ left: `${box().left}%`, width: `${box().width}%` }}
              onPointerDown={(event) => startDrag(event, 'move')}
              onDblClick={() => props.onWindow(undefined)}
              onKeyDown={onKeyDown}
            >
              <span
                data-solid-activity-window-edge="from"
                onPointerDown={(event) => startDrag(event, 'from')}
              />
              <span
                data-solid-activity-window-edge="to"
                onPointerDown={(event) => startDrag(event, 'to')}
              />
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
