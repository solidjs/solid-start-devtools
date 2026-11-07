import { describe, expect, it } from 'vitest';
import { groupRuns, type RunItem } from './runs.js';

function items(names: string, unfoldable: string[] = []): RunItem[] {
  return [...names].map((name, index) => ({
    id: `${index}`,
    name,
    foldable: !unfoldable.includes(`${index}`),
  }));
}

describe('groupRuns', () => {
  it('folds the rows after the first of a run of the same name', () => {
    expect(groupRuns(items('aaaa'))).toEqual([
      { kind: 'item', id: '0' },
      { kind: 'run', ids: ['1', '2', '3'] },
    ]);
  });

  it('leaves short runs and mixed names alone', () => {
    expect(groupRuns(items('aab'))).toEqual([
      { kind: 'item', id: '0' },
      { kind: 'item', id: '1' },
      { kind: 'item', id: '2' },
    ]);
  });

  it('never folds a row that must stay, and splits the run around it', () => {
    expect(groupRuns(items('aaaaaa', ['2']))).toEqual([
      { kind: 'item', id: '0' },
      { kind: 'item', id: '1' },
      { kind: 'item', id: '2' },
      { kind: 'item', id: '3' },
      { kind: 'run', ids: ['4', '5'] },
    ]);
  });

  it('starts a new group at each name', () => {
    expect(groupRuns(items('aaabbb'))).toEqual([
      { kind: 'item', id: '0' },
      { kind: 'run', ids: ['1', '2'] },
      { kind: 'item', id: '3' },
      { kind: 'run', ids: ['4', '5'] },
    ]);
  });
});
