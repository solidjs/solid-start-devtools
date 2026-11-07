/** What a palette result points at, so the dock can open it in the right view. */
export type PaletteTarget =
  | { kind: 'memo' | 'signal'; node: object }
  | { kind: 'component'; owner: object }
  | { kind: 'action'; origin: object | undefined; id: number }
  | { kind: 'call'; instance: string };

export interface PaletteItem {
  /** The group heading the item is listed under. */
  group: 'Components' | 'Signals' | 'Memos' | 'Actions' | 'Server functions';
  label: string;
  /** Muted text on the right: a value, an owner, a time. */
  detail: string;
  target: PaletteTarget;
}

export interface PaletteMatch {
  item: PaletteItem;
  /** Indexes of the label's characters that matched, for highlighting. */
  positions: number[];
  score: number;
}

/** The order groups are listed in. */
export const GROUP_ORDER: PaletteItem['group'][] = [
  'Components',
  'Memos',
  'Signals',
  'Actions',
  'Server functions',
];

/**
 * Matches `query` against `label` as a subsequence, ignoring case. A run of
 * adjacent characters and a match at the start or after a separator score
 * higher, so `rev` ranks `revenue` above `refundOrderView`.
 */
export function matchLabel(
  label: string,
  query: string,
): { positions: number[]; score: number } | undefined {
  const text = label.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return { positions: [], score: 0 };

  // A plain substring is the strongest match.
  const at = text.indexOf(needle);
  if (at !== -1) {
    const positions: number[] = [];
    for (let i = 0; i < needle.length; i++) positions.push(at + i);
    const boundary = at === 0 || !/[a-z0-9]/.test(text[at - 1]!);
    return { positions, score: 100 + (boundary ? 50 : 0) - at };
  }

  // Otherwise every character must appear in order.
  const positions: number[] = [];
  let score = 0;
  let from = 0;
  for (const char of needle) {
    const index = text.indexOf(char, from);
    if (index === -1) return undefined;
    if (positions.length && index === positions[positions.length - 1]! + 1) score += 5;
    positions.push(index);
    from = index + 1;
  }
  return { positions, score: score - positions[0]! };
}

/** The items that match `query`, best first within each group, groups in `GROUP_ORDER`. */
export function searchPalette(items: PaletteItem[], query: string, limit = 6): PaletteMatch[] {
  // Each group keeps its own best matches, so one large group cannot crowd out the rest.
  const byGroup = new Map<PaletteItem['group'], PaletteMatch[]>();
  for (const item of items) {
    const match = matchLabel(item.label, query);
    if (!match) continue;
    let list = byGroup.get(item.group);
    if (!list) {
      list = [];
      byGroup.set(item.group, list);
    }
    list.push({ item, positions: match.positions, score: match.score });
  }

  const result: PaletteMatch[] = [];
  for (const group of GROUP_ORDER) {
    const list = byGroup.get(group);
    if (!list) continue;
    list.sort(compareMatches);
    for (const match of list.slice(0, limit)) result.push(match);
  }
  return result;
}

function compareMatches(a: PaletteMatch, b: PaletteMatch): number {
  return b.score - a.score || a.item.label.length - b.item.label.length;
}
