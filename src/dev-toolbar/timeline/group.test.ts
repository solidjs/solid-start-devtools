import { describe, expect, it } from 'vitest';
import { groupEntries } from './group.js';
import type { TimelineEntry } from './tracker.js';

function entry(id: number, label: string, writes = 1, flushMs = 2): TimelineEntry {
  return {
    id,
    origin: undefined,
    label,
    at: 0,
    interaction: undefined,
    writes: Array.from({ length: writes }, () => ({}) as never),
    runs: [],
    droppedRuns: 3,
    flushes: 1,
    flushMs,
    holds: [],
    navigations: [],
    calls: [],
  };
}

describe('groupEntries', () => {
  it('returns nothing for no entries', () => {
    expect(groupEntries([])).toEqual([]);
  });

  it('keeps a lone entry as a plain row', () => {
    const groups = groupEntries([entry(3, 'a'), entry(2, 'b'), entry(1, 'a')]);
    expect(groups.map((group) => group.folded)).toEqual([false, false, false]);
    expect(groups.map((group) => group.entries.length)).toEqual([1, 1, 1]);
  });

  it('folds consecutive entries with the same label', () => {
    const groups = groupEntries([
      entry(5, 'update: tick'),
      entry(4, 'update: tick'),
      entry(3, 'update: tick'),
      entry(2, 'click'),
      entry(1, 'update: tick'),
    ]);
    expect(groups.map((group) => [group.label, group.entries.length, group.folded])).toEqual([
      ['update: tick', 3, true],
      ['click', 1, false],
      ['update: tick', 1, false],
    ]);
  });

  it('sums the writes, re-runs and durations', () => {
    const [group] = groupEntries([entry(2, 'a', 2, 1.5), entry(1, 'a', 3, 2.5)]);
    expect(group.writes).toBe(5);
    expect(group.runs).toBe(6);
    expect(group.totalMs).toBe(4);
  });

  it('keys a group by its oldest entry so it survives new entries', () => {
    const [before] = groupEntries([entry(2, 'a'), entry(1, 'a')]);
    const [after] = groupEntries([entry(3, 'a'), entry(2, 'a'), entry(1, 'a')]);
    expect(before.key).toBe(1);
    expect(after.key).toBe(1);
  });
});
