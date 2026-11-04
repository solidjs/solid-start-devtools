import { describe, expect, it } from 'vitest';
import { matchLabel, searchPalette, type PaletteItem } from './search.js';

function item(label: string, group: PaletteItem['group'] = 'Memos'): PaletteItem {
  return { group, label, detail: '', target: { kind: 'call', instance: label } };
}

describe('matchLabel', () => {
  it('matches a substring and returns its positions', () => {
    expect(matchLabel('revenueUsd', 'rev')).toEqual({ positions: [0, 1, 2], score: 150 });
  });

  it('matches a subsequence in order', () => {
    expect(matchLabel('refundOrder', 'rfo')?.positions).toEqual([0, 2, 6]);
  });

  it('rejects letters out of order', () => {
    expect(matchLabel('revenue', 'vnu')).toBeDefined();
    expect(matchLabel('revenue', 'ver')).toBeUndefined();
  });

  it('ignores case', () => {
    expect(matchLabel('OrderRow', 'orderrow')?.positions).toHaveLength(8);
  });
});

describe('searchPalette', () => {
  it('ranks a match at the start above one in the middle', () => {
    const result = searchPalette([item('totalRevenue'), item('revenue')], 'rev');
    expect(result.map((match) => match.item.label)).toEqual(['revenue', 'totalRevenue']);
  });

  it('lists groups in a fixed order and caps each group', () => {
    const items = [
      item('refund', 'Actions'),
      item('revenue', 'Memos'),
      item('r1', 'Signals'),
      item('r2', 'Signals'),
      item('r3', 'Signals'),
    ];
    const result = searchPalette(items, 'r', 2);
    expect(result.map((match) => match.item.group)).toEqual([
      'Memos',
      'Signals',
      'Signals',
      'Actions',
    ]);
  });

  it('returns everything for an empty query', () => {
    expect(searchPalette([item('a'), item('b')], '')).toHaveLength(2);
  });
});
