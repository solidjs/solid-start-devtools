import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import type { ChangeRecord } from 'solid-js/attribution';
import { RecordRows } from '../async/index.js';
import { concernOf, type AsyncRecord } from '../async/tracker.js';
import { Badge } from '../../ui/Badge.js';
import type { ErrorRecord } from '../error-record.js';
import { copyCallReport, ServerFunctionContent } from '../functions/index.js';
import type { ServerFunctionInstance } from '../functions/index.js';
import { openInEditor } from '../open-in-editor.js';
import { Text } from '../../ui/Text.js';
import { asyncDuration, asyncOrigin, asyncReport, asyncTitle } from '../report/async-report.js';
import { copyText } from '../report/CopyReportButton.js';
import { pageRoute } from '../report/markdown.js';
import { ms, plural, timelineReport } from '../report/timeline-report.js';
import { entryDuration } from '../timeline/group.js';
import type { TimelineEntry, TimelineRun } from '../timeline/tracker.js';
import {
  actionKey,
  barMs,
  callBars,
  callDuration,
  callName,
  callStatus,
  clockTime,
  describeThrown,
  entryLocation,
  eventName,
  firstMemoDelta,
  GLYPHS,
  runBars,
  serverKey,
  summarizeChain,
  type LiveLoad,
  type ValueMemory,
  type WaterfallBar,
} from './model.js';

/** How long a button shows that it copied. */
const COPIED_MS = 1500;

function OpenIcon(): JSX.Element {
  return (
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
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

/** A text button that copies a report for an agent to read. */
export function CopyReport(props: {
  label: string;
  report: () => string | Promise<string>;
}): JSX.Element {
  const [state, setState] = createSignal<'idle' | 'busy' | 'copied' | 'failed'>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  async function copy(): Promise<void> {
    if (state() === 'busy') return;
    setState('busy');
    try {
      await copyText(await props.report());
      setState('copied');
    } catch (error) {
      console.warn('[solid dev toolbar] failed to copy the report', error);
      setState('failed');
    }
    clearTimeout(timer);
    timer = setTimeout(() => setState('idle'), COPIED_MS);
  }

  return (
    <button
      type="button"
      data-solid-activity-btn
      data-solid-copy-report={state()}
      aria-label={`Copy ${props.label} for an agent`}
      disabled={state() === 'busy'}
      onClick={copy}
    >
      {state() === 'copied' ? 'Copied' : state() === 'failed' ? 'Could not copy' : 'Copy report'}
    </button>
  );
}

function Glyph(props: { kind: 'act' | 'srv' | 'wait' | 'err' }): JSX.Element {
  return (
    <span data-solid-activity-glyph={props.kind} aria-hidden="true">
      {GLYPHS[props.kind]}
    </span>
  );
}

function Section(props: { title: string; aside?: string; children: JSX.Element }): JSX.Element {
  return (
    <>
      <div data-solid-activity-sect>
        <span>{props.title}</span>
        <Show when={props.aside}>
          <span>{props.aside}</span>
        </Show>
      </div>
      {props.children}
    </>
  );
}

// ---------------------------------------------------------------- action

/** `0 → 1` with the old value red and the new one green. */
function Delta(props: { prev: string | undefined; value: string | undefined }): JSX.Element {
  return (
    <Show when={props.value !== undefined}>
      <Show
        when={props.prev !== undefined}
        fallback={<span data-solid-activity-ins>{props.value}</span>}
      >
        <span data-solid-activity-del>{props.prev}</span>
        {' → '}
        <span data-solid-activity-ins>{props.value}</span>
      </Show>
    </Show>
  );
}

function causeText(cause: ChangeRecord): string {
  if (cause.kind === 'derived') return `${cause.name} changed`;
  const values =
    cause.value === undefined
      ? ''
      : cause.prev === undefined
        ? ` ${cause.value}`
        : ` ${cause.prev} → ${cause.value}`;
  return `${cause.kind} ${cause.name}${values}`;
}

/** The changes behind a run, each with the changes behind it. */
function CauseList(props: { causes: ChangeRecord[] }): JSX.Element {
  return (
    <ul data-solid-activity-causes>
      <For each={props.causes}>
        {(cause) => (
          <li>
            <span>{`← ${causeText(cause)}`}</span>
            <Show when={cause.causes?.length}>
              <CauseList causes={cause.causes!} />
            </Show>
          </li>
        )}
      </For>
    </ul>
  );
}

function RunCauses(props: {
  runs: TimelineRun[];
  onViewInGraph?: (node: object) => void;
}): JSX.Element {
  return (
    <div data-solid-activity-why>
      <For each={props.runs}>
        {(run) => (
          <>
            <Show
              when={run.event.causes.length}
              fallback={
                <Text options={{ size: 'xs' }}>
                  No tracked change caused this run, such as a retry after an error.
                </Text>
              }
            >
              <CauseList causes={run.event.causes} />
            </Show>
            <Show when={props.onViewInGraph && run.node?.deref()}>
              {(node) => (
                <button
                  type="button"
                  data-solid-activity-btn
                  onClick={() => props.onViewInGraph?.(node())}
                >
                  View in graph
                </button>
              )}
            </Show>
          </>
        )}
      </For>
    </div>
  );
}

function RunRows(props: {
  bars: WaterfallBar[];
  onViewInGraph?: (node: object) => void;
}): JSX.Element {
  const [open, setOpen] = createSignal<string[]>([]);

  function toggle(key: string): void {
    // Step 1: close the row if it is open.
    const next: string[] = [];
    let wasOpen = false;
    for (const item of open()) {
      if (item === key) wasOpen = true;
      else next.push(item);
    }
    // Step 2: otherwise open it.
    if (!wasOpen) next.push(key);
    setOpen(next);
  }

  return (
    <For each={props.bars} keyed={(bar) => bar.key}>
      {(bar) => (
        <>
          <div
            data-solid-activity-wf
            data-kind={bar().kind}
            role="button"
            tabindex="0"
            aria-expanded={open().includes(bar().key) ? 'true' : 'false'}
            title="Show what caused this re-run"
            onClick={() => toggle(bar().key)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle(bar().key);
              }
            }}
          >
            <span>{bar().name}</span>
            <div data-solid-activity-track>
              <i style={{ left: `${bar().left}%`, width: `${bar().width}%` }} />
            </div>
            <span data-solid-activity-ms>{barMs(bar().ms)}</span>
          </div>
          <Show when={open().includes(bar().key)}>
            <RunCauses runs={bar().runs} onViewInGraph={props.onViewInGraph} />
          </Show>
        </>
      )}
    </For>
  );
}

function OutcomePill(props: { entry: TimelineEntry }): JSX.Element {
  const outcome = () => props.entry.interaction?.outcome;
  return (
    <Show when={props.entry.origin}>
      <span
        data-solid-activity-pill={
          outcome() === 'held' ? 'held' : outcome() === 'committed' ? 'committed' : 'idle'
        }
        data-solid-timeline-outcome
      >
        {outcome() ?? (props.entry.interaction ? 'idle' : 'pending')}
      </span>
    </Show>
  );
}

function KvRow(props: { label: string; value: string }): JSX.Element {
  return (
    <div data-solid-kv-row>
      <Text data-solid-kv-key options={{ size: 'xs', font: 'mono' }}>
        {props.label}
      </Text>
      <Text data-solid-kv-value options={{ size: 'xs', font: 'mono' }}>
        {props.value}
      </Text>
    </div>
  );
}

export interface ActionDetailProps {
  entry: TimelineEntry;
  /** How many entries the row folded. */
  count: number;
  memory: ValueMemory;
  /** Read to re-draw when the memory learned of new values. */
  observed: () => number;
  onSelect: (key: string) => void;
  onShowInStructure?: (node: object) => void;
  onViewInGraph?: (node: object) => void;
}

export function ActionDetail(props: ActionDetailProps): JSX.Element {
  const chain = createMemo(() => summarizeChain(props.entry));
  const location = createMemo(() => entryLocation(props.entry));
  const rerun = createMemo(() => {
    props.observed();
    return firstMemoDelta(props.entry, props.memory);
  });
  const runs = createMemo(() => runBars(props.entry));
  const calls = createMemo(() => callBars(props.entry));
  const node = createMemo(() => {
    for (const run of props.entry.runs) {
      const live = run.node?.deref();
      if (live) return live;
    }
    return undefined;
  });
  const sub = createMemo(() => {
    const parts: string[] = [];
    const found = location();
    if (found) parts.push(found.label);
    const event = eventName(props.entry);
    if (event) parts.push(event);
    parts.push(ms(entryDuration(props.entry)));
    parts.push(clockTime(props.entry.at));
    return parts.join(' · ');
  });

  return (
    <div data-solid-activity-detail-body data-kind="action">
      <h2>
        <Glyph kind="act" />
        <span data-solid-activity-title>{props.entry.label}</span>
        <OutcomePill entry={props.entry} />
        <Show when={props.count > 1}>
          <span data-solid-activity-count>{`×${props.count}`}</span>
        </Show>
      </h2>
      <div data-solid-activity-sub>
        {sub()}
        <Show when={props.count > 1}>{` · latest of ${props.count}`}</Show>
      </div>

      <div data-solid-activity-chain>
        <div data-solid-activity-node>
          <small>Wrote</small>
          <Show when={chain().wrote} fallback={<code data-solid-activity-none>nothing</code>}>
            {(wrote) => (
              <>
                <code>{wrote().name}</code>
                <div data-solid-activity-delta>
                  <Delta prev={wrote().prev} value={wrote().value} />
                  <Show when={wrote().more}>{` +${wrote().more} more`}</Show>
                </div>
              </>
            )}
          </Show>
        </div>
        <div data-solid-activity-arrow aria-hidden="true">
          →
        </div>
        <div data-solid-activity-node>
          <small>Re-ran</small>
          <code data-solid-activity-none={chain().reran ? undefined : ''}>
            {chain().reran || 'nothing'}
          </code>
          <Show when={rerun()}>
            {(item) => (
              <div data-solid-activity-delta>
                {`${item().name} `}
                <Delta prev={item().delta.before} value={item().delta.after} />
              </div>
            )}
          </Show>
        </div>
        <div data-solid-activity-arrow aria-hidden="true">
          →
        </div>
        <div data-solid-activity-node>
          <small>Effects</small>
          <code data-solid-activity-none={chain().effects ? undefined : ''}>
            {chain().effects || 'none'}
          </code>
        </div>
      </div>

      <Show when={props.entry.interaction}>
        {(interaction) => (
          <Section title="Interaction">
            <div data-solid-activity-kv data-solid-kv-table>
              <Show when={interaction().inputDelayMs !== undefined}>
                <KvRow label="Input delay" value={ms(interaction().inputDelayMs)} />
              </Show>
              <KvRow label="Handler" value={ms(interaction().handlerMs)} />
              <KvRow label="Re-runs" value={`${interaction().runs}, ${ms(interaction().runMs)}`} />
              <Show when={interaction().settledMs !== undefined}>
                <KvRow label="Settled" value={`${ms(interaction().settledMs)} after the event`} />
              </Show>
            </div>
          </Section>
        )}
      </Show>

      <Show when={runs().bars.length}>
        <Section title="Re-runs" aside={ms(runs().totalMs)}>
          <RunRows bars={runs().bars} onViewInGraph={props.onViewInGraph} />
          <Show when={props.entry.droppedRuns}>
            <div data-solid-activity-note>
              {`${plural(props.entry.droppedRuns, 're-run')} not listed.`}
            </div>
          </Show>
        </Section>
      </Show>

      <Show when={calls().bars.length}>
        <Section title="Server" aside={ms(calls().totalMs)}>
          <For each={calls().bars} keyed={(bar) => bar.key}>
            {(bar) => (
              <button
                type="button"
                data-solid-activity-wf
                data-kind="server"
                disabled={!bar().instance}
                title={bar().instance ? 'Open this call' : undefined}
                onClick={() => {
                  const instance = bar().instance;
                  if (instance) props.onSelect(serverKey(instance));
                }}
              >
                <span>{`ƒ ${bar().name}`}</span>
                <div data-solid-activity-track>
                  <i style={{ left: `${bar().left}%`, width: `${bar().width}%` }} />
                </div>
                <span data-solid-activity-ms>{barMs(bar().ms)}</span>
              </button>
            )}
          </For>
        </Section>
      </Show>

      <Show when={props.entry.holds.length}>
        <Section title="Holds">
          <For each={props.entry.holds}>
            {(hold) => (
              <div data-solid-activity-hold data-solid-timeline-hold>
                {`${ms(hold.holdMs)}${hold.blockers.length ? `, waiting on ${hold.blockers.join(', ')}` : ''}`}
              </div>
            )}
          </For>
        </Section>
      </Show>

      <div data-solid-activity-btnrow>
        <Show when={location()}>
          {(found) => (
            <button
              type="button"
              data-solid-activity-btn
              data-primary
              onClick={() => openInEditor(found().location)}
            >
              <OpenIcon />
              {`Open ${found().label}`}
            </button>
          )}
        </Show>
        <Show when={props.onShowInStructure && node()}>
          {(live) => (
            <button
              type="button"
              data-solid-activity-btn
              onClick={() => props.onShowInStructure?.(live())}
            >
              Show in Structure
            </button>
          )}
        </Show>
        <CopyReport
          label="this update"
          report={() => timelineReport({ entry: props.entry, route: pageRoute() })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- server call

export interface ServerDetailProps {
  value: ServerFunctionInstance;
  /** The action the call ran for. */
  from: TimelineEntry | undefined;
  onSelect: (key: string) => void;
  onDelete: () => void;
}

export function ServerDetail(props: ServerDetailProps): JSX.Element {
  const sub = createMemo(() => {
    const parts: string[] = [callStatus(props.value), props.value.request.source.method];
    const duration = callDuration(props.value);
    if (duration !== undefined) parts.push(ms(duration));
    parts.push(clockTime(props.value.request.time));
    return parts.join(' · ');
  });

  return (
    <div data-solid-activity-detail-body data-kind="server">
      <h2>
        <Glyph kind="srv" />
        <span data-solid-activity-title>{callName(props.value)}</span>
        <Show when={props.value.response}>
          {(response) => (
            <Badge type={response().source.ok ? 'success' : 'failure'}>
              {response().source.status}
            </Badge>
          )}
        </Show>
      </h2>
      <div data-solid-activity-sub>{sub()}</div>

      <Show when={props.from}>
        {(entry) => (
          <Section title="Called by">
            <button
              type="button"
              data-solid-activity-link
              onClick={() => props.onSelect(actionKey(entry().id))}
            >
              <Glyph kind="act" />
              {entry().label}
            </button>
          </Section>
        )}
      </Show>

      <Section title="Request and response">
        <ServerFunctionContent instance={props.value} />
      </Section>

      <div data-solid-activity-btnrow>
        <CopyReport label="this call" report={() => copyCallReport(props.value)} />
        <button type="button" data-solid-activity-btn onClick={props.onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- async

export interface AsyncDetailProps {
  record: AsyncRecord;
  onViewInGraph?: (node: object) => void;
  onViewOwner?: (owner: object) => void;
}

export function AsyncDetail(props: AsyncDetailProps): JSX.Element {
  const node = createMemo(() => {
    const current = props.record;
    return current.type === 'load' || current.type === 'fallback'
      ? current.node?.deref()
      : undefined;
  });
  const sub = createMemo(() =>
    [props.record.type, ms(asyncDuration(props.record)), clockTime(props.record.at)].join(' · '),
  );

  return (
    <div data-solid-activity-detail-body data-kind="async">
      <h2>
        <Glyph kind="wait" />
        <span data-solid-activity-title>{asyncTitle(props.record)}</span>
      </h2>
      <div data-solid-activity-sub>{sub()}</div>

      <Show when={concernOf(props.record)}>
        {(concern) => (
          <Section title="Worth a look">
            <div data-solid-activity-concern>{concern()}</div>
          </Section>
        )}
      </Show>

      <Section title="Details">
        <div data-solid-kv-table>
          <Show when={asyncOrigin(props.record)}>
            {(origin) => (
              <div data-solid-kv-row>
                <Text data-solid-kv-key options={{ size: 'xs', font: 'mono' }}>
                  Started by
                </Text>
                <Text data-solid-kv-value options={{ size: 'xs', font: 'mono' }}>
                  {origin()}
                </Text>
              </div>
            )}
          </Show>
          <RecordRows record={props.record} />
        </div>
      </Section>

      <div data-solid-activity-btnrow>
        <Show when={node()}>
          {(current) => (
            <>
              <Show when={props.onViewInGraph && props.record.type === 'load'}>
                <button
                  type="button"
                  data-solid-activity-btn
                  data-primary
                  onClick={() => props.onViewInGraph?.(current())}
                >
                  Show in the reactivity graph
                </button>
              </Show>
              <Show when={props.onViewOwner}>
                <button
                  type="button"
                  data-solid-activity-btn
                  onClick={() => props.onViewOwner?.(current())}
                >
                  Show in the ownership tree
                </button>
              </Show>
            </>
          )}
        </Show>
        <CopyReport
          label={`this ${props.record.type}`}
          report={() => asyncReport({ record: props.record, route: pageRoute() })}
        />
      </div>
    </div>
  );
}

/** A load in flight: the live list of the async panel. */
export function LiveDetail(props: {
  load: LiveLoad;
  now: number;
  onViewInGraph?: (node: object) => void;
  onViewOwner?: (owner: object) => void;
}): JSX.Element {
  return (
    <div data-solid-activity-detail-body data-kind="async">
      <h2>
        <Glyph kind="wait" />
        <span data-solid-activity-title>{`${props.load.name} loading`}</span>
      </h2>
      <div data-solid-activity-sub>{`live · ${ms(props.now - props.load.since)}`}</div>
      <Show when={props.load.ownerPath.length}>
        <Section title="Owner">
          <div data-solid-activity-concern data-plain>
            {props.load.ownerPath.join(' › ')}
          </div>
        </Section>
      </Show>
      <div data-solid-activity-btnrow>
        <Show when={props.onViewInGraph}>
          <button
            type="button"
            data-solid-activity-btn
            data-primary
            onClick={() => props.onViewInGraph?.(props.load.raw)}
          >
            Show in the reactivity graph
          </button>
        </Show>
        <Show when={props.onViewOwner}>
          <button
            type="button"
            data-solid-activity-btn
            onClick={() => props.onViewOwner?.(props.load.raw)}
          >
            Show in the ownership tree
          </button>
        </Show>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- error

export interface ErrorDetailProps {
  record: ErrorRecord;
  entry: TimelineEntry | undefined;
  onSelect: (key: string) => void;
  onShowError?: () => void;
}

export function ErrorDetail(props: ErrorDetailProps): JSX.Element {
  const thrown = createMemo(() => describeThrown(props.record.error));

  return (
    <div data-solid-activity-detail-body data-kind="error">
      <h2>
        <Glyph kind="err" />
        <span data-solid-activity-title>{thrown().name}</span>
      </h2>
      <div data-solid-activity-sub>{clockTime(props.record.at)}</div>

      <Section title="Message">
        <div data-solid-activity-concern data-plain>
          {thrown().message}
        </div>
      </Section>

      <Show when={props.entry}>
        {(entry) => (
          <Section title="Thrown in">
            <button
              type="button"
              data-solid-activity-link
              onClick={() => props.onSelect(actionKey(entry().id))}
            >
              <Glyph kind="act" />
              {entry().label}
            </button>
          </Section>
        )}
      </Show>

      <div data-solid-activity-btnrow>
        <Show when={props.onShowError}>
          <button
            type="button"
            data-solid-activity-btn
            data-primary
            onClick={() => props.onShowError?.()}
          >
            Show error
          </button>
        </Show>
      </div>
    </div>
  );
}
