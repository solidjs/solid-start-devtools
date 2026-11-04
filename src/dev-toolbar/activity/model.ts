import type { AsyncRecord } from '../async/tracker.js';
import type { ErrorRecord } from '../error-record.js';
import { editorLocation, isLibraryFile } from '../error-viewer/frames.js';
import type { ServerFunctionInstance } from '../functions/index.js';
import { asyncDuration, asyncTitle } from '../report/async-report.js';
import { concernOf } from '../async/tracker.js';
import { ms, plural } from '../report/timeline-report.js';
import {
  entryDuration,
  entryRunCount,
  groupEntries,
  type TimelineGroup,
} from '../timeline/group.js';
import {
  isIdleEntry,
  isUnnamedUpdate,
  type TimelineEntry,
  type TimelineRun,
} from '../timeline/tracker.js';

/** A thing the list shows. */
export type ActivityKind = 'action' | 'server' | 'async' | 'error';

/** What a filter chip keeps. */
export type ActivityFilter = 'all' | 'actions' | 'server' | 'async';

/** An async node that is loading right now. */
export interface LiveLoad {
  id: string;
  name: string;
  ownerPath: string[];
  /** When the panel first saw it pending, on the `performance.now()` clock. */
  since: number;
  raw: object;
}

export type ActivitySource =
  | { type: 'action'; entry: TimelineEntry; entries: TimelineEntry[] }
  | { type: 'server'; instance: string; value: ServerFunctionInstance }
  | { type: 'async'; record: AsyncRecord }
  | { type: 'error'; record: ErrorRecord; index: number; entry: TimelineEntry | undefined }
  | { type: 'live'; load: LiveLoad };

export interface ActivityRow {
  /** One key per row, stable while the row's data grows. */
  key: string;
  kind: ActivityKind;
  /** The glyph's class: `act`, `srv`, `wait` or `err`. */
  glyph: 'act' | 'srv' | 'wait' | 'err';
  /** Start time on the `performance.now()` clock. */
  at: number;
  /** End time. Equal to `at` for a thing with no duration. */
  end: number;
  /** The selection keys this row stands for. A folded row holds all of its entries. */
  members: string[];
  title: string;
  subtitle: string;
  /** The right-aligned time or duration. */
  time: string;
  /** How many entries the row folds. `1` for a plain row. */
  count: number;
  source: ActivitySource;
}

export const GLYPHS = { act: 'A', srv: 'ƒ', wait: '⧗', err: '✕' } as const;

export function actionKey(id: number): string {
  return `a:${id}`;
}

export function serverKey(instance: string): string {
  return `s:${instance}`;
}

export function asyncKey(id: number): string {
  return `w:${id}`;
}

export function errorKey(record: ErrorRecord): string {
  return `e:${record.at}`;
}

export function liveKey(id: string): string {
  return `l:${id}`;
}

/** The name and message of a thrown value. */
export function describeThrown(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name || 'Error', message: error.message };
  if (typeof ErrorEvent !== 'undefined' && error instanceof ErrorEvent) {
    return { name: 'Error', message: error.message };
  }
  return { name: 'Thrown value', message: String(error) };
}

/** The status a server-function call shows: its HTTP status, `ERR` when the fetch failed, `…` while pending. */
export function callStatus(value: ServerFunctionInstance): string {
  if (value.response) return String(value.response.source.status);
  if (value.request?.meta?.error !== undefined) return 'ERR';
  return '…';
}

export function callName(value: ServerFunctionInstance): string {
  return value.request?.meta?.name ?? value.request?.id ?? 'server function';
}

/** How long a call took, or `undefined` while it is pending or failed. */
export function callDuration(value: ServerFunctionInstance): number | undefined {
  if (!value.request || !value.response) return undefined;
  return Math.max(0, value.response.time - value.request.time);
}

function actionSubtitle(parts: { writes: number; runs: number; calls: number }): string {
  const out: string[] = [];
  if (parts.writes) out.push(plural(parts.writes, 'write'));
  if (parts.runs) out.push(plural(parts.runs, 're-run'));
  if (parts.calls) out.push(plural(parts.calls, 'server call'));
  return out.length ? out.join(' · ') : 'nothing re-ran';
}

/** The mean gap between the entries of a fold, newest first, as `every 16ms`. */
export function foldInterval(entries: readonly TimelineEntry[]): string | undefined {
  if (entries.length < 2) return undefined;
  const span = entries[0]!.at - entries[entries.length - 1]!.at;
  const gap = span / (entries.length - 1);
  if (!(gap > 0)) return undefined;
  return `every ${gap < 10 ? gap.toFixed(1) : Math.round(gap)}ms`;
}

function actionRow(group: TimelineGroup): ActivityRow {
  const newest = group.entries[0]!;
  const oldest = group.entries[group.entries.length - 1]!;
  const interval = group.folded ? foldInterval(group.entries) : undefined;
  const subtitle = actionSubtitle(group);
  const members: string[] = [];
  for (const entry of group.entries) members.push(actionKey(entry.id));
  return {
    key: group.folded ? `g:${group.key}` : actionKey(newest.id),
    kind: 'action',
    glyph: 'act',
    at: oldest.at,
    end: newest.at + entryDuration(newest),
    members,
    title: group.label,
    subtitle: interval ? `${subtitle} · ${interval}` : subtitle,
    time: ms(group.totalMs),
    count: group.folded ? group.entries.length : 1,
    source: { type: 'action', entry: newest, entries: group.entries },
  };
}

function singleGroup(entry: TimelineEntry): TimelineGroup {
  return {
    key: entry.id,
    label: entry.label,
    entries: [entry],
    folded: false,
    writes: entry.writes.length,
    runs: entryRunCount(entry),
    calls: entry.calls.length,
    totalMs: entryDuration(entry),
  };
}

export interface CollectInput {
  entries: readonly TimelineEntry[];
  instances: Record<string, ServerFunctionInstance | undefined>;
  records: readonly AsyncRecord[];
  errors: readonly ErrorRecord[];
  live: readonly LiveLoad[];
  /** Show every entry as its own row, unnamed updates included. */
  unfold: boolean;
}

export interface Collected {
  /** Newest first. */
  rows: ActivityRow[];
  /** How many entries the fold hides: the repeats and the unnamed updates. */
  folded: number;
}

/** The entry whose interaction or frame a thrown error happened in, joined by identity. */
export function entryOfError(
  record: ErrorRecord,
  entries: readonly TimelineEntry[],
): TimelineEntry | undefined {
  if (!record.origin) return undefined;
  for (const entry of entries) {
    if (entry.origin === record.origin) return entry;
  }
  return undefined;
}

/** The label of the action each call ran for, by the call's key. */
function callOwners(entries: readonly TimelineEntry[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const entry of entries) {
    for (const call of entry.calls) {
      if (call.instance) owners.set(call.instance, entry.label);
    }
  }
  return owners;
}

function serverRow(
  instance: string,
  value: ServerFunctionInstance,
  owners: Map<string, string>,
): ActivityRow | undefined {
  // A response that arrived with no request has nothing to place on the clock.
  if (!value.request) return undefined;
  const at = value.request.time;
  const duration = callDuration(value);
  const owner = owners.get(instance);
  const status = callStatus(value);
  return {
    key: serverKey(instance),
    kind: 'server',
    glyph: 'srv',
    at,
    end: at + (duration ?? 0),
    members: [serverKey(instance)],
    title: callName(value),
    subtitle: owner ? `${status} · from ${owner}` : `${status} · ${value.request.source.method}`,
    time: duration === undefined ? (status === '…' ? 'live' : '') : ms(duration),
    count: 1,
    source: { type: 'server', instance, value },
  };
}

function asyncRow(record: AsyncRecord): ActivityRow {
  const duration = asyncDuration(record);
  const concern = concernOf(record);
  return {
    key: asyncKey(record.id),
    kind: 'async',
    glyph: 'wait',
    at: record.at,
    end: record.at + duration,
    members: [asyncKey(record.id)],
    title: asyncTitle(record),
    subtitle: concern ? `${record.type} · ${concern}` : record.type,
    time: ms(duration),
    count: 1,
    source: { type: 'async', record },
  };
}

function errorRow(
  record: ErrorRecord,
  index: number,
  entries: readonly TimelineEntry[],
): ActivityRow {
  const { name, message } = describeThrown(record.error);
  const entry = entryOfError(record, entries);
  return {
    key: errorKey(record),
    kind: 'error',
    glyph: 'err',
    at: record.at,
    end: record.at,
    members: [errorKey(record)],
    title: entry ? entry.label : name,
    subtitle: entry ? `${name}: ${message}` : message,
    time: entry ? ms(entryDuration(entry)) : '',
    count: 1,
    source: { type: 'error', record, index, entry },
  };
}

function liveRow(load: LiveLoad): ActivityRow {
  return {
    key: liveKey(load.id),
    kind: 'async',
    glyph: 'wait',
    at: load.since,
    end: load.since,
    members: [liveKey(load.id)],
    title: `${load.name} loading`,
    subtitle: load.ownerPath.length ? load.ownerPath.join(' › ') : 'loading now',
    time: 'live',
    count: 1,
    source: { type: 'live', load },
  };
}

/** Merges every source into one stream, newest first. */
export function collectRows(input: CollectInput): Collected {
  const rows: ActivityRow[] = [];
  let folded = 0;

  // Actions: unnamed updates and repeats fold unless the list is unfolded.
  const named: TimelineEntry[] = [];
  for (const entry of input.entries) {
    // A click that changed nothing, such as one on the toolbar itself, is never listed.
    if (isIdleEntry(entry)) continue;
    if (isUnnamedUpdate(entry)) {
      folded++;
      if (input.unfold) named.push(entry);
    } else {
      named.push(entry);
    }
  }
  const groups = groupEntries(named);
  for (const group of groups) {
    if (!group.folded) {
      rows.push(actionRow(group));
      continue;
    }
    folded += group.entries.length - 1;
    if (!input.unfold) {
      rows.push(actionRow(group));
      continue;
    }
    for (const entry of group.entries) rows.push(actionRow(singleGroup(entry)));
  }

  // Server-function calls.
  const owners = callOwners(input.entries);
  for (const instance of Object.keys(input.instances)) {
    const value = input.instances[instance];
    if (!value) continue;
    const row = serverRow(instance, value, owners);
    if (row) rows.push(row);
  }

  // Async records and the loads in flight.
  for (const record of input.records) rows.push(asyncRow(record));
  for (const load of input.live) rows.push(liveRow(load));

  // Thrown errors.
  for (let index = 0; index < input.errors.length; index++) {
    rows.push(errorRow(input.errors[index]!, index, input.entries));
  }

  // Newest first. The sort is stable, so ties keep their source order.
  rows.sort((a, b) => b.at - a.at);
  return { rows, folded };
}

export interface TimeWindow {
  from: number;
  to: number;
}

/** Whether a row starts or runs inside the window. No window keeps everything. */
export function inWindow(row: ActivityRow, window: TimeWindow | undefined): boolean {
  if (!window) return true;
  return row.at <= window.to && row.end >= window.from;
}

export function matchesFilter(row: ActivityRow, filter: ActivityFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'actions':
      // An error happened inside an action, so it travels with them.
      return row.kind === 'action' || row.kind === 'error';
    case 'server':
      return row.kind === 'server';
    case 'async':
      return row.kind === 'async';
  }
}

/** The names of the owners above a live runtime node, outermost first. */
export function ownerNamesOf(node: object | undefined): string[] {
  const names: string[] = [];
  let owner = (node as { _parent?: unknown } | undefined)?._parent as
    | { _parent?: unknown; _name?: unknown; _component?: { name?: unknown } }
    | undefined;
  for (let depth = 0; owner && depth < 64; depth++) {
    const component = owner._component?.name;
    if (typeof component === 'string') names.push(component);
    else if (typeof owner._name === 'string') names.push(owner._name);
    owner = owner._parent as typeof owner | undefined;
  }
  return names.reverse();
}

function stripBrackets(name: string): string {
  return name.replace(/^<|>$/g, '');
}

/** Whether anything the row involves belongs to the named owner, such as `<OrderRow>`. */
export function matchesOwner(row: ActivityRow, ownerName: string | undefined): boolean {
  if (!ownerName) return true;
  const wanted = stripBrackets(ownerName).toLowerCase();
  const hit = (text: string | undefined) => !!text && text.toLowerCase().includes(wanted);
  const { source } = row;
  switch (source.type) {
    case 'action':
      for (const entry of source.entries) {
        if (hit(entry.label)) return true;
        for (const write of entry.writes) if (hit(write.name)) return true;
        for (const run of entry.runs) {
          if (hit(run.event.nodeName)) return true;
          for (const owner of ownerNamesOf(run.node?.deref())) if (hit(owner)) return true;
        }
      }
      return false;
    case 'async': {
      const record = source.record;
      if (hit(asyncTitle(record))) return true;
      const path = 'ownerPath' in record.event ? record.event.ownerPath : undefined;
      for (const owner of path ?? []) if (hit(owner)) return true;
      return false;
    }
    case 'live':
      for (const owner of source.load.ownerPath) if (hit(owner)) return true;
      return hit(source.load.name);
    case 'server':
      return hit(row.title) || hit(row.subtitle);
    case 'error':
      return hit(row.title) || hit(row.subtitle);
  }
}

/** The row a selection key belongs to, and for an action the entry the key names. */
export function resolveSelection(
  rows: readonly ActivityRow[],
  key: string | undefined,
): { row: ActivityRow; entry: TimelineEntry | undefined } | undefined {
  if (!key) return undefined;
  for (const row of rows) {
    if (!row.members.includes(key)) continue;
    if (row.source.type !== 'action') return { row, entry: undefined };
    for (const entry of row.source.entries) {
      if (actionKey(entry.id) === key) return { row, entry };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- time groups

export interface RowBucket {
  label: string;
  rows: ActivityRow[];
}

/** The label of the group a row of the given age falls in. */
export function bucketLabel(ageMs: number): string {
  const age = Math.max(0, ageMs);
  if (age < 5_000) return 'just now';
  if (age < 60_000) return `${Math.floor(age / 10_000) * 10 || 5}s ago`;
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`;
  return `${Math.floor(age / 3_600_000)}h ago`;
}

/** Splits a newest-first list into runs of rows with the same age label. */
export function bucketRows(rows: readonly ActivityRow[], now: number): RowBucket[] {
  const buckets: RowBucket[] = [];
  for (const row of rows) {
    const label = bucketLabel(now - row.at);
    const last = buckets[buckets.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else buckets.push({ label, rows: [row] });
  }
  return buckets;
}

// ---------------------------------------------------------------- lanes

/** An action with at least this many re-runs gets a big tick. */
export const BIG_RUNS = 8;

export interface LaneTick {
  /** Percent of the strip. */
  left: number;
  width: number;
  big: boolean;
  /** The row the tick stands for, so a click can select it. */
  member: string;
}

export interface Lanes {
  start: number;
  end: number;
  actions: LaneTick[];
  server: LaneTick[];
  async: LaneTick[];
}

/** The shortest span the strip covers, so one early entry does not fill it. */
export const MIN_SPAN_MS = 1000;

function percent(value: number, start: number, span: number): number {
  return ((value - start) / span) * 100;
}

/** Positions every item of the three lanes along the time range they cover. */
export function layoutLanes(rows: readonly ActivityRow[]): Lanes {
  const lanes: Lanes = { start: 0, end: MIN_SPAN_MS, actions: [], server: [], async: [] };
  if (!rows.length) return lanes;

  // The range runs from the oldest start to the latest end.
  let start = Infinity;
  let end = -Infinity;
  for (const row of rows) {
    if (row.kind === 'error') continue;
    start = Math.min(start, row.at);
    end = Math.max(end, row.end);
  }
  if (!Number.isFinite(start)) return lanes;
  end = Math.max(end, start + MIN_SPAN_MS);
  const span = end - start;
  lanes.start = start;
  lanes.end = end;

  for (const row of rows) {
    const { source } = row;
    if (source.type === 'action') {
      // Every entry of a fold is its own tick.
      for (const entry of source.entries) {
        lanes.actions.push({
          left: percent(entry.at, start, span),
          width: 0,
          big: entryRunCount(entry) >= BIG_RUNS,
          member: actionKey(entry.id),
        });
      }
    } else if (row.kind === 'server') {
      lanes.server.push({
        left: percent(row.at, start, span),
        width: ((row.end - row.at) / span) * 100,
        big: false,
        member: row.members[0]!,
      });
    } else if (row.kind === 'async') {
      lanes.async.push({
        left: percent(row.at, start, span),
        width: ((row.end - row.at) / span) * 100,
        big: false,
        member: row.members[0]!,
      });
    }
  }
  return lanes;
}

/** Percent of the strip to a time. */
export function timeAt(lanes: Pick<Lanes, 'start' | 'end'>, fraction: number): number {
  return lanes.start + Math.min(1, Math.max(0, fraction)) * (lanes.end - lanes.start);
}

/** A window from two times in any order, kept inside the range and at least `minMs` wide. */
export function makeWindow(
  lanes: Pick<Lanes, 'start' | 'end'>,
  a: number,
  b: number,
  minMs = 0,
): TimeWindow {
  let from = Math.max(lanes.start, Math.min(a, b));
  let to = Math.min(lanes.end, Math.max(a, b));
  if (to - from < minMs) to = Math.min(lanes.end, from + minMs);
  if (to - from < minMs) from = Math.max(lanes.start, to - minMs);
  return { from, to };
}

/** The window moved by `deltaMs`, kept inside the range with its width. */
export function shiftWindow(
  lanes: Pick<Lanes, 'start' | 'end'>,
  window: TimeWindow,
  deltaMs: number,
): TimeWindow {
  const width = window.to - window.from;
  const from = Math.min(lanes.end - width, Math.max(lanes.start, window.from + deltaMs));
  return { from, to: from + width };
}

// ---------------------------------------------------------------- stacks

export interface HandlerLocation {
  /** `src/OrderTable.tsx:58:12`, as the dev server's open-in-editor endpoint wants it. */
  location: string;
  /** `OrderTable.tsx:58`, as the panel shows it. */
  label: string;
}

/** Splits `at fn (url:line:col)`, `at url:line:col` and `fn@url:line:col` into the file, line and column. */
export function parseStackFrame(
  line: string,
): { file: string; line: number; column: number | undefined } | undefined {
  const match =
    /\(?((?:https?:\/\/|file:\/\/|\/|[A-Za-z]:[\\/])[^()\s]*?):(\d+)(?::(\d+))?\)?\s*$/.exec(
      line.trim(),
    ) ?? /@(.+?):(\d+)(?::(\d+))?\s*$/.exec(line.trim());
  if (!match) return undefined;
  return {
    file: match[1]!,
    line: Number(match[2]),
    column: match[3] === undefined ? undefined : Number(match[3]),
  };
}

/** The first frame in the app's own files, from a write's stack. */
export function handlerLocation(stack: readonly string[] | undefined): HandlerLocation | undefined {
  if (!stack) return undefined;
  for (const text of stack) {
    const frame = parseStackFrame(text);
    if (!frame || isLibraryFile(frame.file)) continue;
    const location = editorLocation({ source: frame.file, line: frame.line, column: frame.column });
    if (!location) continue;
    const path = location.split(':')[0]!;
    const base = path.split('/').pop() ?? path;
    return { location, label: `${base}:${frame.line}` };
  }
  return undefined;
}

/** The location of the action's handler, from the first write that has a stack. */
export function entryLocation(entry: TimelineEntry): HandlerLocation | undefined {
  for (const write of entry.writes) {
    const found = handlerLocation(write.stack);
    if (found) return found;
  }
  return undefined;
}

// ---------------------------------------------------------------- action detail

/** `click` as `onClick`. */
export function eventName(entry: TimelineEntry): string | undefined {
  const name =
    entry.interaction?.name ??
    (entry.origin?.kind === 'interaction' ? entry.origin.name : undefined);
  if (name) return `on${name[0]!.toUpperCase()}${name.slice(1)}`;
  const kind = entry.origin?.kind;
  if (kind && kind !== 'external') return kind;
  return undefined;
}

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

/** The wall-clock time of a `performance.now()` value, as `hh:mm:ss.mmm`. */
export function clockTime(at: number, origin = performance.timeOrigin): string {
  const date = new Date(origin + at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Names with a count when one repeats: `render ×2, title`. Shows at most `limit` names. */
export function countNames(names: readonly string[], limit = 4): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const parts: string[] = [];
  for (const [name, count] of counts) parts.push(count > 1 ? `${name} ×${count}` : name);
  if (parts.length <= limit) return parts.join(', ');
  return `${parts.slice(0, limit).join(', ')} +${parts.length - limit}`;
}

export interface ChainSummary {
  wrote:
    | { name: string; prev: string | undefined; value: string | undefined; more: number }
    | undefined;
  reran: string;
  effects: string;
}

/** The three boxes of the chain: the first write, the memos that re-ran and the effects that ran. */
export function summarizeChain(entry: TimelineEntry): ChainSummary {
  const first = entry.writes[0];
  const memos: string[] = [];
  const effects: string[] = [];
  for (const run of entry.runs) {
    if (run.event.nodeKind === 'memo') memos.push(run.event.nodeName);
    else effects.push(run.event.nodeName);
  }
  return {
    wrote: first
      ? {
          name: first.name,
          prev: first.prev,
          value: first.value,
          more: entry.writes.length - 1,
        }
      : undefined,
    reran: countNames(memos),
    effects: countNames(effects),
  };
}

/** A short text for a value read off a live node. */
export function previewValue(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value.length > 24 ? `${value.slice(0, 24)}…` : value);
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'undefined':
      return String(value);
    case 'function':
      return '[function]';
    case 'symbol':
      return value.toString();
    default:
      if (value === null) return 'null';
      return Array.isArray(value)
        ? `Array(${value.length})`
        : `[${(value as object).constructor?.name ?? 'object'}]`;
  }
}

export interface ValueDelta {
  before: string | undefined;
  after: string;
}

/**
 * Remembers the value of each memo the last time a re-run of it was seen, so
 * the next re-run can show what it changed from. A run's value is read off the
 * live node the first time the run is seen, which is just after it happened.
 */
export class ValueMemory {
  private lastByNode = new Map<number, string>();
  private deltas = new WeakMap<TimelineRun, ValueDelta>();
  private seen = new WeakSet<TimelineRun>();

  /** Takes the entries newest first, as the builder keeps them. */
  observe(entries: readonly TimelineEntry[]): void {
    for (let i = entries.length - 1; i >= 0; i--) {
      for (const run of entries[i]!.runs) {
        if (this.seen.has(run)) continue;
        this.seen.add(run);
        if (run.event.nodeKind !== 'memo') continue;
        const node = run.node?.deref() as { _value?: unknown } | undefined;
        if (!node) continue;
        const after = previewValue(node._value);
        const before = this.lastByNode.get(run.event.nodeId);
        this.lastByNode.set(run.event.nodeId, after);
        // A memo that re-ran twice in one batch reads the same live value both times.
        if (before !== after) this.deltas.set(run, { before, after });
      }
    }
  }

  deltaOf(run: TimelineRun): ValueDelta | undefined {
    return this.deltas.get(run);
  }
}

/** The first memo that re-ran with a value that moved, for the Re-ran box. */
export function firstMemoDelta(
  entry: TimelineEntry,
  memory: ValueMemory,
): { name: string; delta: ValueDelta } | undefined {
  for (const run of entry.runs) {
    if (run.event.nodeKind !== 'memo') continue;
    const delta = memory.deltaOf(run);
    if (delta) return { name: run.event.nodeName, delta };
  }
  return undefined;
}

export interface WaterfallBar {
  key: string;
  name: string;
  kind: 'memo' | 'effect' | 'server';
  /** Percent of the track. */
  left: number;
  width: number;
  ms: number;
  /** The runs the bar stands for, so a click can show why they ran. */
  runs: TimelineRun[];
  /** The server-function panel's key for a call bar. */
  instance?: string;
}

/** Most bars one waterfall draws. */
export const MAX_BARS = 40;

/** Smallest bar width, in percent, so a very short run still shows. */
const MIN_BAR = 1.5;

function place(offset: number, duration: number, span: number): { left: number; width: number } {
  const left = Math.min(100 - MIN_BAR, Math.max(0, (offset / span) * 100));
  const width = Math.min(100 - left, Math.max(MIN_BAR, (duration / span) * 100));
  return { left, width };
}

/**
 * One bar per memo or effect that re-ran, placed by when it started after the
 * action began and sized by how long it took. Runs of one node share a bar.
 */
export function runBars(entry: TimelineEntry): { bars: WaterfallBar[]; totalMs: number } {
  type Group = {
    kind: 'memo' | 'effect';
    name: string;
    runs: TimelineRun[];
    start: number;
    end: number;
    ms: number;
  };
  const groups = new Map<string, Group>();
  let latest = 0;
  for (const run of entry.runs) {
    const { event } = run;
    const start = Math.max(0, event.at - entry.at);
    const duration = event.selfMs + (run.effectMs ?? 0);
    const key = `${event.nodeKind}:${event.nodeName}`;
    let group = groups.get(key);
    if (!group) {
      group = { kind: event.nodeKind, name: event.nodeName, runs: [], start, end: start, ms: 0 };
      groups.set(key, group);
    }
    group.runs.push(run);
    group.start = Math.min(group.start, start);
    group.end = Math.max(group.end, start + duration);
    group.ms += duration;
    latest = Math.max(latest, start + duration);
  }
  const totalMs = Math.max(entryDuration(entry), latest, 0.01);
  const bars: WaterfallBar[] = [];
  for (const [key, group] of groups) {
    if (bars.length >= MAX_BARS) break;
    bars.push({
      key,
      name: group.runs.length > 1 ? `${group.name} ×${group.runs.length}` : group.name,
      kind: group.kind,
      ...place(group.start, group.end - group.start, totalMs),
      ms: group.ms,
      runs: group.runs,
    });
  }
  bars.sort((a, b) => a.left - b.left);
  return { bars, totalMs };
}

/** One bar per server call of the action, on its own scale. */
export function callBars(entry: TimelineEntry): { bars: WaterfallBar[]; totalMs: number } {
  let span = 0;
  for (const call of entry.calls) {
    span = Math.max(span, Math.max(0, call.event.at - entry.at) + call.event.durationMs);
  }
  span = Math.max(span, 0.01);
  const bars: WaterfallBar[] = [];
  for (const call of entry.calls) {
    if (bars.length >= MAX_BARS) break;
    bars.push({
      key: call.instance ?? String(call.event.at),
      name: call.event.name ?? call.event.id,
      kind: 'server',
      ...place(Math.max(0, call.event.at - entry.at), call.event.durationMs, span),
      ms: call.event.durationMs,
      runs: [],
      instance: call.instance,
    });
  }
  return { bars, totalMs: span };
}

/** A millisecond figure for a waterfall row: two decimals under 1ms, none from 10ms. */
export function barMs(value: number): string {
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return String(Math.round(value));
}
