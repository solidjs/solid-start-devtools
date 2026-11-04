import { describe, expect, it } from 'vitest';
import type { AsyncRecord } from '../async/tracker.js';
import type { ErrorRecord } from '../error-record.js';
import type { ServerFunctionInstance } from '../functions/index.js';
import type { TimelineEntry, TimelineRun } from '../timeline/tracker.js';
import {
  axisMarks,
  bucketLabel,
  bucketRows,
  callBars,
  collectRows,
  countNames,
  entryLocation,
  firstMemoDelta,
  frozenSources,
  handlerLocation,
  inWindow,
  layoutLanes,
  makeWindow,
  matchesFilter,
  matchesOwner,
  parseStackFrame,
  previewValue,
  resolveSelection,
  runBars,
  shiftWindow,
  summarizeChain,
  ValueMemory,
  viewRange,
  WINDOW_MS,
  type ActivityRow,
} from './model.js';

const ORIGIN = { kind: 'interaction', name: 'click' } as const;

function run(
  id: number,
  name: string,
  kind: 'memo' | 'effect',
  at: number,
  selfMs: number,
  value?: unknown,
): TimelineRun {
  return {
    event: { run: id, at, nodeId: id, nodeKind: kind, nodeName: name, selfMs, causes: [] } as never,
    node: value === undefined ? undefined : new WeakRef({ _value: value }),
    effectMs: undefined,
  };
}

function entry(id: number, label: string, at: number, extra: Partial<TimelineEntry> = {}) {
  return {
    id,
    // An update with no origin and no named write counts as unnamed, so an entry has an origin by default.
    origin: { kind: 'interaction', name: 'click' },
    label,
    at,
    interaction: undefined,
    // An entry with no write and no run is idle and never listed.
    writes: [{ name: 'w' } as never],
    runs: [],
    droppedRuns: 0,
    flushes: 1,
    flushMs: 2,
    holds: [],
    navigations: [],
    calls: [],
    ...extra,
  } as TimelineEntry;
}

function server(at: number, durationMs?: number, name = 'refundOrder'): ServerFunctionInstance {
  const request = {
    type: 'request',
    id: 'fn',
    instance: 'fn#1',
    source: { method: 'POST' },
    meta: { name },
    time: at,
  };
  if (durationMs === undefined) return { request } as never;
  return {
    request,
    response: { type: 'response', time: at + durationMs, source: { status: 200, ok: true } },
  } as never;
}

function collect(overrides: Partial<Parameters<typeof collectRows>[0]> = {}) {
  return collectRows({
    entries: [],
    instances: {},
    records: [],
    errors: [],
    live: [],
    unfold: false,
    ...overrides,
  });
}

describe('collectRows', () => {
  it('merges every source into one stream, newest first', () => {
    const wait = {
      type: 'wait',
      id: 1,
      at: 300,
      event: { blockers: ['user'], holdMs: 40, silent: false, long: false },
    } as unknown as AsyncRecord;
    const error: ErrorRecord = { error: new RangeError('bad'), at: 250, origin: undefined };
    const { rows } = collect({
      entries: [entry(2, 'click on b', 200), entry(1, 'click on a', 100)],
      instances: { 'fn#1': server(150, 38) },
      records: [wait],
      errors: [error],
    });
    expect(rows.map((row) => row.kind)).toEqual(['async', 'error', 'action', 'server', 'action']);
  });

  it('names a thrown error by the action it happened in, joined by origin identity', () => {
    const inAction = entry(1, 'click on button#a', 100, { origin: ORIGIN as never });
    const { rows } = collect({
      entries: [inAction],
      errors: [
        { error: new RangeError('bad'), at: 120, origin: ORIGIN as never },
        { error: new TypeError('oops'), at: 130, origin: undefined },
      ],
    });
    const errors = rows.filter((row) => row.kind === 'error');
    expect(errors.map((row) => row.title)).toEqual(['TypeError', 'click on button#a']);
    expect(errors[1]!.subtitle).toBe('RangeError: bad');
  });

  it('folds consecutive actions with one label and sums their stats', () => {
    const writes = [{ name: 'x' } as never];
    const { rows, folded } = collect({
      entries: [
        entry(3, 'tick', 300, { writes }),
        entry(2, 'tick', 200, { writes }),
        entry(1, 'tick', 100, { writes }),
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('tick');
    expect(rows[0]!.count).toBe(3);
    expect(rows[0]!.subtitle).toBe('3 writes · every 100ms');
    expect(rows[0]!.members).toEqual(['a:3', 'a:2', 'a:1']);
    expect(folded).toBe(2);
  });

  it('shows every entry and the unnamed updates once unfolded', () => {
    const unnamed = entry(4, 'update', 400, {
      origin: undefined,
      writes: [{ name: 'signal' } as never],
    });
    const entries = [unnamed, entry(3, 'tick', 300), entry(2, 'tick', 200)];
    expect(collect({ entries }).rows).toHaveLength(1);
    const unfolded = collect({ entries, unfold: true });
    expect(unfolded.rows).toHaveLength(3);
    expect(unfolded.folded).toBe(2);
  });

  it('writes the subtitle of an action from its counts', () => {
    const { rows } = collect({
      entries: [
        entry(1, 'click', 0, {
          writes: [{ name: 'a' } as never],
          runs: [run(1, 'm', 'memo', 0, 1), run(2, 'e', 'effect', 0, 1)],
          calls: [{ event: {} as never, instance: 'fn#1' }],
        }),
      ],
    });
    expect(rows[0]!.subtitle).toBe('1 write · 2 re-runs · 1 server call');
  });

  it('says where a server call came from', () => {
    const { rows } = collect({
      entries: [entry(1, 'click on b', 100, { calls: [{ event: {} as never, instance: 'fn#1' }] })],
      instances: { 'fn#1': server(110, 38) },
    });
    const call = rows.find((row) => row.kind === 'server')!;
    expect(call.subtitle).toBe('200 · from click on b');
    expect(call.time).toBe('38.0ms');
  });

  it('keeps a pending call and skips a response that has no request', () => {
    const { rows } = collect({
      instances: { 'fn#1': server(10), 'fn#2': { response: {} } as never },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.time).toBe('live');
  });
});

describe('idle entries', () => {
  it('never lists an entry that changed nothing', () => {
    const idle = entry(1, 'click on the pull tab', 0, { writes: [] });
    expect(collect({ entries: [idle] }).rows).toEqual([]);
  });
});

describe('filters', () => {
  const rows = collect({
    entries: [entry(1, 'click', 100)],
    instances: { 'fn#1': server(150, 5) },
    errors: [{ error: new Error('x'), at: 120, origin: undefined }],
    live: [{ id: 'n', name: 'user', ownerPath: ['<App>'], since: 90, raw: {} }],
  }).rows;

  it('keeps errors with the actions', () => {
    const kinds = (filter: 'all' | 'actions' | 'server' | 'async') =>
      rows.filter((row) => matchesFilter(row, filter)).map((row) => row.kind);
    expect(kinds('all')).toHaveLength(4);
    expect(kinds('actions').sort()).toEqual(['action', 'error']);
    expect(kinds('server')).toEqual(['server']);
    expect(kinds('async')).toEqual(['async']);
  });

  it('keeps what overlaps the window, and everything with no window', () => {
    const [call] = rows.filter((row) => row.kind === 'server') as ActivityRow[];
    expect(inWindow(call!, undefined)).toBe(true);
    expect(inWindow(call!, { from: 0, to: 149 })).toBe(false);
    expect(inWindow(call!, { from: 154, to: 200 })).toBe(true);
    expect(inWindow(call!, { from: 156, to: 200 })).toBe(false);
  });

  it('matches an owner by the names the row involves', () => {
    const action = collect({
      entries: [entry(1, 'click', 0, { runs: [run(1, 'OrderRow total', 'memo', 0, 1)] })],
    }).rows[0]!;
    expect(matchesOwner(action, undefined)).toBe(true);
    expect(matchesOwner(action, '<OrderRow>')).toBe(true);
    expect(matchesOwner(action, '<Footer>')).toBe(false);
    const load = rows.find((row) => row.source.type === 'live')!;
    expect(matchesOwner(load, '<App>')).toBe(true);
  });
});

describe('resolveSelection', () => {
  it('finds the row and the entry of a key, folded or not', () => {
    const { rows } = collect({
      entries: [entry(2, 'tick', 200), entry(1, 'tick', 100), entry(3, 'other', 300)].sort(
        (a, b) => b.at - a.at,
      ),
    });
    const found = resolveSelection(rows, 'a:1');
    expect(found?.row.count).toBe(2);
    expect(found?.entry?.id).toBe(1);
    expect(resolveSelection(rows, 'a:99')).toBeUndefined();
    expect(resolveSelection(rows, undefined)).toBeUndefined();
  });
});

describe('time groups', () => {
  it('labels the age of a row', () => {
    expect(bucketLabel(0)).toBe('just now');
    expect(bucketLabel(4_999)).toBe('just now');
    expect(bucketLabel(5_000)).toBe('5s ago');
    expect(bucketLabel(12_000)).toBe('10s ago');
    expect(bucketLabel(59_000)).toBe('50s ago');
    expect(bucketLabel(60_000)).toBe('1m ago');
    expect(bucketLabel(125_000)).toBe('2m ago');
    expect(bucketLabel(3_600_000)).toBe('1h ago');
    expect(bucketLabel(-10)).toBe('just now');
  });

  it('splits a newest-first list into runs with one label', () => {
    const { rows } = collect({
      entries: [entry(3, 'c', 99_000), entry(2, 'b', 98_000), entry(1, 'a', 20_000)],
    });
    const buckets = bucketRows(rows, 100_000);
    expect(buckets.map((bucket) => [bucket.label, bucket.rows.length])).toEqual([
      ['just now', 2],
      ['1m ago', 1],
    ]);
  });
});

describe('lanes', () => {
  const NOW = 100_000;

  it('places ticks and bars along the last 30 seconds', () => {
    const many = Array.from({ length: 9 }, (_, i) => run(i, 'm', 'memo', 0, 1));
    const { rows } = collect({
      entries: [
        entry(2, 'big', NOW - 15_000, { runs: many, flushMs: 0 }),
        entry(1, 'small', NOW, { flushMs: 0 }),
      ],
      instances: { 'fn#1': server(NOW - 24_000, 3000) },
      records: [
        {
          type: 'wait',
          id: 1,
          at: NOW - 15_000,
          event: { blockers: [], holdMs: 6000 },
        } as unknown as AsyncRecord,
      ],
    });
    const lanes = layoutLanes(rows, NOW);
    expect(lanes.start).toBe(NOW - WINDOW_MS);
    expect(lanes.end).toBe(NOW);
    expect(lanes.actions.map((tick) => [tick.left, tick.big])).toEqual([
      [100, false],
      [50, true],
    ]);
    expect(lanes.server).toEqual([{ left: 20, width: 10, big: false, member: 's:fn#1' }]);
    expect(lanes.async).toEqual([{ left: 50, width: 20, big: false, member: 'w:1' }]);
  });

  it('drops ticks before the start and clips bars that cross it', () => {
    const { rows } = collect({
      entries: [entry(1, 'old', NOW - 40_000, { flushMs: 0 })],
      instances: {
        'fn#1': server(NOW - 35_000, 10_000),
        'fn#2': server(NOW - 50_000, 5000),
      },
    });
    const lanes = layoutLanes(rows, NOW);
    expect(lanes.actions).toEqual([]);
    expect(lanes.server).toHaveLength(1);
    expect(lanes.server[0]).toMatchObject({ left: 0 });
    expect(lanes.server[0]!.width).toBeCloseTo((5000 / WINDOW_MS) * 100);
  });

  it('runs a pending call and a load in flight up to now', () => {
    const { rows } = collect({
      instances: { 'fn#1': server(NOW - 3000) },
      live: [{ id: 'n', name: 'user', ownerPath: [], since: NOW - 6000, raw: {} }],
    });
    const lanes = layoutLanes(rows, NOW);
    expect(lanes.server[0]).toMatchObject({ left: 90, width: 10 });
    expect(lanes.async[0]).toMatchObject({ left: 80, width: 20 });
  });

  it('gives an empty session an empty strip', () => {
    const lanes = layoutLanes([], NOW);
    expect(lanes.end - lanes.start).toBe(WINDOW_MS);
    expect(lanes.actions).toEqual([]);
  });

  it('draws a close fold as one bar of all its entries', () => {
    const { rows } = collect({
      entries: [entry(2, 'tick', NOW - 100), entry(1, 'tick', NOW - 200)],
    });
    // Two entries 100ms apart read as one bar standing for both.
    expect(layoutLanes(rows, NOW).actions[0]!.members).toHaveLength(2);
  });
});

describe('run bars', () => {
  const NOW = 100_000;

  it('joins entries of a folded action less than 250ms apart into one bar', () => {
    const entries = [];
    for (let i = 0; i < 60; i++)
      entries.push(entry(60 - i, 'frame', NOW - 5000 + (59 - i) * 16, { flushMs: 1 }));
    const { rows } = collect({ entries });
    const lanes = layoutLanes(rows, NOW);
    expect(lanes.actions).toHaveLength(1);
    const bar = lanes.actions[0]!;
    expect(bar.members).toHaveLength(60);
    const span = (59 * 16 + 1) / WINDOW_MS;
    expect(bar.width).toBeCloseTo(span * 100);
    expect(bar.left).toBeCloseTo(((WINDOW_MS - 5000) / WINDOW_MS) * 100);
  });

  it('keeps sparse entries as ticks and splits runs at a long gap', () => {
    const at = [NOW - 20_000, NOW - 19_900, NOW - 19_800, NOW - 10_000];
    const entries = [];
    for (let i = 0; i < at.length; i++)
      entries.push(entry(at.length - i, 'tick', at[at.length - 1 - i]!));
    const lanes = layoutLanes(collect({ entries }).rows, NOW);
    expect(lanes.actions).toHaveLength(2);
    expect(lanes.actions.map((tick) => tick.members?.length ?? 1).sort()).toEqual([1, 3]);
  });

  it('keeps single actions as ticks and unfolded entries apart', () => {
    const entries = [entry(2, 'x', NOW - 100), entry(1, 'x', NOW - 150)];
    const unfolded = layoutLanes(collect({ entries, unfold: true }).rows, NOW);
    expect(unfolded.actions.every((tick) => tick.width === 0)).toBe(true);
  });
});

describe('axis', () => {
  it('labels every 10 seconds and ends with now', () => {
    expect(axisMarks()).toEqual([
      { label: '\u221230s', left: 0 },
      { label: '\u221220s', left: (10 / 30) * 100 },
      { label: '\u221210s', left: (20 / 30) * 100 },
      { label: 'now', left: 100 },
    ]);
  });
});

describe('a paused view', () => {
  const NOW = 100_000;
  const range = { since: NOW - WINDOW_MS, until: NOW };

  it('keeps the rows the stores evicted and the pending call that answered', () => {
    const empty = { entries: [], instances: {}, records: [], errors: [], live: [] };
    const frozen = {
      ...empty,
      entries: [entry(2, 'tick', NOW - 100), entry(1, 'tick', NOW - 200)],
      instances: { 'fn#1': server(NOW - 1000) },
    };
    // The store evicted both entries and a response arrived for the call.
    const current = {
      ...empty,
      entries: [entry(9, 'new', NOW + 500)],
      instances: { 'fn#1': server(NOW - 1000, 40) },
    };
    const sources = frozenSources(frozen, current);
    const { rows, folded } = collectRows({ ...sources, unfold: false, range });
    expect(rows.map((row) => row.title).sort()).toEqual(['refundOrder', 'tick']);
    expect(rows.find((row) => row.kind === 'server')?.time).toBe('40.0ms');
    expect(rows.find((row) => row.kind === 'action')?.count).toBe(2);
    expect(folded).toBe(1);
  });
});

describe('the last 30 seconds', () => {
  const NOW = 100_000;
  const range = viewRange(NOW);
  const entries = [
    entry(3, 'new', NOW - 1000),
    entry(2, 'edge', NOW - 29_000),
    entry(1, 'old', NOW - 60_000),
  ];

  it('lists only what ended within the window', () => {
    const { rows } = collect({ entries, range });
    expect(rows.map((row) => row.title)).toEqual(['new', 'edge']);
  });

  it('keeps a thing that began earlier but ended inside', () => {
    const { rows } = collect({
      entries: [entry(1, 'long', NOW - 40_000, { flushMs: 20_000 })],
      range,
    });
    expect(rows).toHaveLength(1);
  });

  it('keeps the pinned row however old it is', () => {
    const { rows } = collect({ entries, range, pinned: 'a:1' });
    expect(rows.map((row) => row.title)).toEqual(['new', 'edge', 'old']);
    const call = collect({
      instances: { 'fn#1': server(NOW - 90_000, 5) },
      range,
      pinned: 's:fn#1',
    });
    expect(call.rows).toHaveLength(1);
  });

  it('counts only the folded rows in the window', () => {
    const repeats = [
      entry(4, 'tick', NOW - 100),
      entry(3, 'tick', NOW - 200),
      entry(2, 'tick', NOW - 50_000),
      entry(1, 'tick', NOW - 60_000),
    ];
    expect(collect({ entries: repeats, range }).folded).toBe(1);
    expect(collect({ entries: repeats }).folded).toBe(3);
  });

  it('counts a running call as now', () => {
    const { rows } = collect({ instances: { 'fn#1': server(NOW - 90_000) }, range });
    expect(rows).toHaveLength(1);
  });

  it('shows nothing newer than the pause', () => {
    const paused = { since: NOW - WINDOW_MS, until: NOW - 5000 };
    const { rows } = collect({ entries, range: paused });
    expect(rows.map((row) => row.title)).toEqual(['edge']);
  });
});

describe('time window', () => {
  const lanes = { start: 0, end: 1000 };

  it('orders its ends and keeps inside the range', () => {
    expect(makeWindow(lanes, 600, 200)).toEqual({ from: 200, to: 600 });
    expect(makeWindow(lanes, -50, 2000)).toEqual({ from: 0, to: 1000 });
  });

  it('keeps a minimum width', () => {
    expect(makeWindow(lanes, 500, 500, 10)).toEqual({ from: 500, to: 510 });
    expect(makeWindow(lanes, 995, 995, 10)).toEqual({ from: 990, to: 1000 });
  });

  it('moves with its width and stops at the edges', () => {
    const window = { from: 100, to: 300 };
    expect(shiftWindow(lanes, window, 50)).toEqual({ from: 150, to: 350 });
    expect(shiftWindow(lanes, window, -500)).toEqual({ from: 0, to: 200 });
    expect(shiftWindow(lanes, window, 5000)).toEqual({ from: 800, to: 1000 });
  });
});

describe('handler location', () => {
  it('reads the frame formats of the browsers', () => {
    expect(parseStackFrame('at onClick (http://localhost:5173/src/Order.tsx?t=17:58:12)')).toEqual({
      file: 'http://localhost:5173/src/Order.tsx?t=17',
      line: 58,
      column: 12,
    });
    expect(parseStackFrame('at http://localhost:5173/src/Order.tsx:58:12')).toMatchObject({
      line: 58,
      column: 12,
    });
    expect(parseStackFrame('onClick@http://localhost:5173/src/Order.tsx:58:12')).toMatchObject({
      line: 58,
    });
    expect(parseStackFrame('nothing here')).toBeUndefined();
  });

  it('takes the first frame in the app and shows it as a file and line', () => {
    const found = handlerLocation([
      'at set (http://localhost:5173/node_modules/.vite/deps/solid-js.js?v=1:10:5)',
      'at onClick (http://localhost:5173/src/components/OrderTable.tsx?t=1:58:12)',
      'at other (http://localhost:5173/src/other.tsx:1:1)',
    ]);
    expect(found).toEqual({
      location: 'src/components/OrderTable.tsx:58:12',
      label: 'OrderTable.tsx:58',
    });
    expect(handlerLocation(undefined)).toBeUndefined();
    expect(handlerLocation(['at x (http://localhost:5173/node_modules/a.js:1:1)'])).toBeUndefined();
  });

  it('uses the first write that has a stack', () => {
    const found = entryLocation(
      entry(1, 'click', 0, {
        writes: [
          { name: 'a' } as never,
          { name: 'b', stack: ['at f (http://x/src/App.tsx:3:4)'] } as never,
        ],
      }),
    );
    expect(found?.label).toBe('App.tsx:3');
  });
});

describe('action detail', () => {
  const memoRun = (id: number, name: string, at: number, ms: number, value?: unknown) =>
    run(id, name, 'memo', at, ms, value);

  it('summarizes the chain', () => {
    const chain = summarizeChain(
      entry(1, 'click', 0, {
        writes: [
          { name: 'status', prev: '"paid"', value: '"refunded"' } as never,
          { name: 'other' } as never,
        ],
        runs: [
          memoRun(1, 'matching', 0, 1),
          run(2, 'render', 'effect', 1, 1),
          run(3, 'render', 'effect', 2, 1),
          run(4, 'title', 'effect', 3, 1),
        ],
      }),
    );
    expect(chain.wrote).toEqual({ name: 'status', prev: '"paid"', value: '"refunded"', more: 1 });
    expect(chain.reran).toBe('matching');
    expect(chain.effects).toBe('render ×2, title');
  });

  it('counts repeated names and caps the list', () => {
    expect(countNames(['a', 'a', 'b'])).toBe('a ×2, b');
    expect(countNames(['a', 'b', 'c', 'd', 'e', 'f'], 3)).toBe('a, b, c +3');
  });

  it('places the re-runs by their start and size', () => {
    const { bars, totalMs } = runBars(
      entry(1, 'click', 100, {
        flushMs: 10,
        runs: [
          memoRun(1, 'a', 100, 2),
          run(2, 'e', 'effect', 105, 4),
          run(3, 'e', 'effect', 106, 1),
        ],
      }),
    );
    expect(totalMs).toBe(10);
    expect(bars.map((bar) => [bar.name, bar.kind])).toEqual([
      ['a', 'memo'],
      ['e ×2', 'effect'],
    ]);
    expect(bars[0]).toMatchObject({ left: 0, width: 20, ms: 2 });
    expect(bars[1]).toMatchObject({ left: 50, width: 40, ms: 5 });
  });

  it('puts the server calls on their own scale', () => {
    const { bars, totalMs } = callBars(
      entry(1, 'click', 100, {
        calls: [
          {
            event: { at: 104, durationMs: 90, id: 'fn', name: 'refundOrder' } as never,
            instance: 'fn#1',
          },
        ],
      }),
    );
    expect(totalMs).toBe(94);
    expect(bars[0]).toMatchObject({ name: 'refundOrder', instance: 'fn#1', ms: 90 });
    expect(bars[0]!.left).toBeCloseTo((4 / 94) * 100);
  });
});

describe('ValueMemory', () => {
  it('remembers the value a memo had at its previous run', () => {
    const memory = new ValueMemory();
    const first = run(1, 'revenue', 'memo', 0, 1, 164.25);
    const earlier = entry(1, 'click', 0, { runs: [first] });
    memory.observe([earlier]);
    expect(memory.deltaOf(first)).toEqual({ before: undefined, after: '164.25' });

    const second = run(2, 'revenue', 'memo', 10, 1, 139.75);
    second.event = { ...second.event, nodeId: first.event.nodeId };
    const later = entry(2, 'click', 10, { runs: [second] });
    memory.observe([later, earlier]);
    expect(memory.deltaOf(second)).toEqual({ before: '164.25', after: '139.75' });
    expect(firstMemoDelta(later, memory)).toMatchObject({ name: 'revenue' });
  });

  it('skips a run whose value did not move', () => {
    const memory = new ValueMemory();
    const a = run(1, 'm', 'memo', 0, 1, 5);
    const b = run(1, 'm', 'memo', 1, 1, 5);
    memory.observe([entry(1, 'x', 0, { runs: [a, b] })]);
    expect(memory.deltaOf(b)).toBeUndefined();
  });

  it('writes a short preview', () => {
    expect(previewValue('hi')).toBe('"hi"');
    expect(previewValue([1, 2])).toBe('Array(2)');
    expect(previewValue(null)).toBe('null');
  });
});
