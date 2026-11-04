import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, For, getOwner, onCleanup, Show } from 'solid-js';
import { PauseIcon, PlayIcon } from '../icons.js';
import Placeholder from '../../ui/Placeholder.js';
import { ResizeHandle } from '../../ui/ResizeHandle.js';
import { Text } from '../../ui/Text.js';
import { useResizableDetail } from '../../ui/use-resizable-detail.js';
import { isAsyncAvailable, type AsyncHistory, type AsyncRecord } from '../async/tracker.js';
import type { ErrorRecord } from '../error-record.js';
import type { ServerFunctionInstance } from '../functions/index.js';
import {
  excludeReactiveOwner,
  snapshotReactivityGraph,
  startReactivityTracking,
  subscribeReactivityGraph,
} from '../reactivity/registry.js';
import { isTimelineAvailable, type TimelineEntry } from '../timeline/tracker.js';
import { ActionDetail, AsyncDetail, ErrorDetail, LiveDetail, ServerDetail } from './detail.js';
import {
  actionKey,
  bucketRows,
  collectRows,
  GLYPHS,
  frozenSources,
  inWindow,
  type ActivitySources,
  layoutLanes,
  viewRange,
  WINDOW_MS,
  matchesFilter,
  matchesOwner,
  resolveSelection,
  serverKey,
  ValueMemory,
  type ActivityFilter,
  type ActivityRow,
  type LiveLoad,
  type TimeWindow,
} from './model.js';
import { Scrub } from './scrub.js';
import './styles.css';

const FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'actions', label: 'Actions' },
  { value: 'server', label: 'Server' },
  { value: 'async', label: 'Async' },
];

/** How often the group labels and the elapsed time of what loads now are redrawn. */
const TICK_MS = 250;

export interface ActivityFocus {
  /** Select the action that began with this interaction or frame. */
  origin?: object;
  /** Select the server-function call with this key. */
  instance?: string;
  /** Show only what involves this owner, such as `<OrderRow>`. */
  ownerName?: string;
}

export interface ActivityViewerProps {
  show?: boolean;
  entries: TimelineEntry[];
  /** The async history, to tell the sources of a load from the nodes that wait on them. */
  history: AsyncHistory;
  records: AsyncRecord[];
  instances: Record<string, ServerFunctionInstance | undefined>;
  errors: ErrorRecord[];
  /**
   * Another view asking Activity to show something. Pass a new object for every
   * request, so asking for the same thing twice still selects it.
   */
  focus?: ActivityFocus;
  /** Clears the timeline and the async history. The button shows only when this is given. */
  onClear?: () => void;
  onDeleteInstance: (instance: string) => void;
  onViewInGraph?: (node: object) => void;
  onViewOwner?: (owner: object) => void;
  onShowInStructure?: (node: object) => void;
  /** Opens the error at this index of `errors`. */
  onShowError?: (index: number) => void;
}

function Row(props: { row: ActivityRow; selected: boolean; onSelect: () => void }): JSX.Element {
  return (
    <button
      type="button"
      data-solid-activity-row
      data-kind={props.row.kind}
      data-selected={props.selected ? '' : undefined}
      data-repeat={props.row.count > 1 ? '' : undefined}
      aria-pressed={props.selected ? 'true' : 'false'}
      onClick={props.onSelect}
    >
      <span data-solid-activity-glyph={props.row.glyph} aria-hidden="true">
        {GLYPHS[props.row.glyph]}
      </span>
      <div data-solid-activity-what>
        <b>{props.row.title}</b>
        <Show when={props.row.count > 1}>
          <span data-solid-activity-count>{` ×${props.row.count}`}</span>
        </Show>
        <div>{props.row.subtitle}</div>
      </div>
      <div data-solid-activity-t>{props.row.time}</div>
    </button>
  );
}

/** Actions, server calls, async waits and thrown errors in one stream, with the selected one beside it. */
export default function ActivityViewer(props: ActivityViewerProps): JSX.Element {
  const detail = useResizableDetail({
    storageKey: 'solid-start-devtools:activity-detail-width',
    defaultWidth: 520,
  });
  // The live list reads the graph, which must not list the panel's own nodes.
  excludeReactiveOwner(getOwner());

  const [filter, setFilter] = createSignal<ActivityFilter>('all');
  const [unfold, setUnfold] = createSignal(false);
  const [selected, setSelected] = createSignal<string>();
  const [timeRange, setTimeRange] = createSignal<TimeWindow>();
  const [owner, setOwner] = createSignal<string>();
  const [live, setLive] = createSignal<LiveLoad[]>([]);
  const [now, setNow] = createSignal(performance.now());
  const [paused, setPaused] = createSignal(false);
  // What the list showed when it was paused.
  const [frozenSrc, setFrozenSrc] = createSignal<ActivitySources>();
  // The clock reads this outside any tracking scope.
  let frozen = false;
  const [observed, setObserved] = createSignal(0);
  const since = new Map<string, number>();
  const memory = new ValueMemory();

  // What is loading now comes from the graph, so it is read only while the panel shows.
  createEffect(
    () => !!props.show,
    (visible) => {
      if (!visible) return;
      function read(): void {
        const nodes = snapshotReactivityGraph().nodes;
        const ids = new Set<string>();
        const loads: LiveLoad[] = [];
        // Step 1: the nodes that wait on a source of async work are not listed, only the sources.
        for (const node of nodes) {
          if (!node.pending || node.kind === 'signal') continue;
          if (!props.history.isSource(node.raw)) continue;
          ids.add(node.id);
          if (!since.has(node.id)) since.set(node.id, performance.now());
          loads.push({
            id: node.id,
            name: node.name,
            ownerPath: node.ownerPath,
            since: since.get(node.id)!,
            raw: node.raw,
          });
        }
        // Step 2: forget what stopped loading.
        for (const id of since.keys()) if (!ids.has(id)) since.delete(id);
        setLive(loads);
      }
      const stop = startReactivityTracking();
      const unsubscribe = subscribeReactivityGraph(read);
      const timer = setInterval(() => {
        if (!frozen) setNow(performance.now());
      }, TICK_MS);
      read();
      return () => {
        clearInterval(timer);
        unsubscribe();
        stop();
      };
    },
  );
  onCleanup(() => since.clear());

  // The values of the memos that re-ran are read as the runs arrive, so the next run can show what it changed from.
  createEffect(
    () => props.entries,
    (entries) => {
      memory.observe(entries);
      setObserved((count) => count + 1);
    },
  );

  // Another view asked for something.
  createEffect(
    () => props.focus,
    (request) => {
      if (!request) return;
      if (request.ownerName !== undefined) setOwner(request.ownerName || undefined);
      if (request.origin) {
        for (const entry of props.entries) {
          if (entry.origin !== request.origin) continue;
          setFilter('all');
          setTimeRange(undefined);
          setSelected(actionKey(entry.id));
          break;
        }
      }
      if (request.instance) {
        setFilter('all');
        setTimeRange(undefined);
        setSelected(serverKey(request.instance));
      }
    },
  );

  // The strip and the list cover the last `WINDOW_MS`. While paused nothing newer than the pause shows.
  const range = createMemo(() => {
    const current = viewRange(now());
    return paused() ? current : { ...current, until: Number.POSITIVE_INFINITY };
  });

  // A picked time range that has slid out of the strip is dropped.
  createEffect(
    () => {
      const picked = timeRange();
      return picked !== undefined && picked.to < now() - WINDOW_MS;
    },
    (stale) => {
      if (stale) setTimeRange(undefined);
    },
  );

  function togglePause(): void {
    const next = !paused();
    frozen = next;
    // Pausing keeps what is shown, so the stores can evict without the view losing rows.
    setFrozenSrc(
      next
        ? {
            entries: props.entries,
            instances: props.instances,
            records: props.records,
            errors: props.errors,
            live: live(),
          }
        : undefined,
    );
    // Resuming jumps back to live.
    if (!next) setNow(performance.now());
    setPaused(next);
  }

  const collected = createMemo(() => {
    const current: ActivitySources = {
      entries: props.entries,
      instances: props.instances,
      records: props.records,
      errors: props.errors,
      live: live(),
    };
    const frozenNow = frozenSrc();
    return collectRows({
      ...(frozenNow ? frozenSources(frozenNow, current) : current),
      unfold: unfold(),
      range: range(),
      pinned: selected(),
    });
  });

  const shown = createMemo(() => {
    const rows: ActivityRow[] = [];
    const kind = filter();
    const name = owner();
    const range = timeRange();
    for (const row of collected().rows) {
      if (!matchesFilter(row, kind)) continue;
      if (!matchesOwner(row, name)) continue;
      if (!inWindow(row, range)) continue;
      rows.push(row);
    }
    return rows;
  });

  const buckets = createMemo(() => bucketRows(shown(), now()));
  const lanes = createMemo(() => layoutLanes(collected().rows, now()));
  const selection = createMemo(() => resolveSelection(collected().rows, selected()));

  // Each detail reads its own memo, which holds the same object while the list
  // redraws. A detail that read the selection itself would be told of every new
  // list and rebuild its body, and a body that suspends would never settle.
  const actionPick = createMemo(() => selection()?.entry);
  const actionCount = createMemo(() => selection()?.row.count ?? 1);
  const serverPick = createMemo(
    () => {
      const source = selection()?.row.source;
      return source?.type === 'server' ? source : undefined;
    },
    { equals: (a, b) => a?.instance === b?.instance && a?.value === b?.value },
  );
  const asyncPick = createMemo(() => {
    const source = selection()?.row.source;
    return source?.type === 'async' ? source.record : undefined;
  });
  const livePick = createMemo(
    () => {
      const source = selection()?.row.source;
      return source?.type === 'live' ? source.load : undefined;
    },
    { equals: (a, b) => a?.raw === b?.raw },
  );
  const errorPick = createMemo(
    () => {
      const source = selection()?.row.source;
      return source?.type === 'error' ? source : undefined;
    },
    { equals: (a, b) => a?.record === b?.record && a?.entry === b?.entry },
  );

  /** The action a server call ran for. */
  function callerOf(instance: string): TimelineEntry | undefined {
    for (const entry of props.entries) {
      for (const call of entry.calls) if (call.instance === instance) return entry;
    }
    return undefined;
  }

  function clear(): void {
    setSelected(undefined);
    setTimeRange(undefined);
    props.onClear?.();
  }

  return (
    <Show when={props.show}>
      <div data-solid-dev-toolbar-panel>
        <div data-solid-activity>
          <Show
            when={isTimelineAvailable() || isAsyncAvailable()}
            fallback={
              <Placeholder>
                <Text options={{ size: 'xs' }}>
                  Activity needs a development build of solid-js.
                </Text>
              </Placeholder>
            }
          >
            <Scrub
              lanes={lanes()}
              window={timeRange()}
              selected={selected()}
              onWindow={setTimeRange}
            />
            <div data-solid-activity-split>
              <div data-solid-activity-list>
                <div data-solid-activity-filters>
                  <For each={FILTERS}>
                    {(item) => (
                      <button
                        type="button"
                        data-solid-activity-chip
                        data-filter={item.value}
                        data-on={filter() === item.value ? '' : undefined}
                        aria-pressed={filter() === item.value ? 'true' : 'false'}
                        onClick={() => setFilter(item.value)}
                      >
                        {item.label}
                      </button>
                    )}
                  </For>
                  <Show when={owner()}>
                    {(name) => (
                      <button
                        type="button"
                        data-solid-activity-chip
                        data-owner
                        data-on=""
                        title="Show everything again"
                        onClick={() => setOwner(undefined)}
                      >
                        {`${name()} ×`}
                      </button>
                    )}
                  </Show>
                  <Show when={collected().folded || unfold()}>
                    <button
                      type="button"
                      data-solid-activity-chip
                      data-ghost
                      data-on={unfold() ? '' : undefined}
                      aria-pressed={unfold() ? 'true' : 'false'}
                      title="Repeats and unnamed updates are folded"
                      onClick={() => setUnfold((current) => !current)}
                    >
                      {`${collected().folded} ${unfold() ? 'unfolded' : 'folded'}`}
                    </button>
                  </Show>
                  <Show when={props.onClear}>
                    <button
                      type="button"
                      data-solid-activity-chip
                      data-clear
                      disabled={!props.entries.length && !props.records.length}
                      title="Clear the timeline and the async history"
                      onClick={clear}
                    >
                      Clear
                    </button>
                  </Show>
                  <button
                    type="button"
                    data-solid-activity-pause
                    aria-pressed={paused() ? 'true' : 'false'}
                    aria-label={paused() ? 'Resume live updates' : 'Pause live updates'}
                    title={paused() ? 'Resume live updates' : 'Pause live updates'}
                    onClick={togglePause}
                  >
                    <Show
                      when={paused()}
                      fallback={<PauseIcon title="Pause live updates" />}
                      children={<PlayIcon title="Resume live updates" />}
                    />
                  </button>
                </div>

                <Show
                  when={shown().length}
                  fallback={
                    <div data-solid-activity-empty>
                      {collected().rows.length
                        ? 'Nothing matches this filter.'
                        : 'Nothing happened in the last 30 seconds.'}
                    </div>
                  }
                >
                  <For each={buckets()} keyed={(bucket) => bucket.label}>
                    {(bucket) => (
                      <>
                        <div data-solid-activity-group>{bucket().label}</div>
                        <For each={bucket().rows} keyed={(row) => row.key}>
                          {(row) => (
                            <Row
                              row={row()}
                              selected={row().members.includes(selected() ?? '')}
                              onSelect={() => setSelected(row().members[0])}
                            />
                          )}
                        </For>
                      </>
                    )}
                  </For>
                </Show>
              </div>

              <aside data-solid-activity-detail style={{ width: `${detail.width()}px` }}>
                <ResizeHandle detail={detail} />
                <Show
                  when={selection()}
                  fallback={<div data-solid-activity-empty>Select an item to see what it did.</div>}
                >
                  <Show when={actionPick()}>
                    {(entry) => (
                      <ActionDetail
                        entry={entry()}
                        count={actionCount()}
                        memory={memory}
                        observed={observed}
                        onSelect={setSelected}
                        onShowInStructure={props.onShowInStructure}
                        onViewInGraph={props.onViewInGraph}
                      />
                    )}
                  </Show>
                  <Show when={serverPick()}>
                    {(pick) => (
                      <ServerDetail
                        value={pick().value}
                        from={callerOf(pick().instance)}
                        onSelect={setSelected}
                        onDelete={() => {
                          const instance = pick().instance;
                          setSelected(undefined);
                          props.onDeleteInstance(instance);
                        }}
                      />
                    )}
                  </Show>
                  <Show when={asyncPick()}>
                    {(record) => (
                      <AsyncDetail
                        record={record()}
                        onViewInGraph={props.onViewInGraph}
                        onViewOwner={props.onViewOwner}
                      />
                    )}
                  </Show>
                  <Show when={livePick()}>
                    {(load) => (
                      <LiveDetail
                        load={load()}
                        now={now()}
                        onViewInGraph={props.onViewInGraph}
                        onViewOwner={props.onViewOwner}
                      />
                    )}
                  </Show>
                  <Show when={errorPick()}>
                    {(pick) => (
                      <ErrorDetail
                        record={pick().record}
                        entry={pick().entry}
                        onSelect={setSelected}
                        onShowError={
                          props.onShowError ? () => props.onShowError?.(pick().index) : undefined
                        }
                      />
                    )}
                  </Show>
                </Show>
              </aside>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
