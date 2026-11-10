/** A sibling row the run finder looks at. */
export interface RunItem {
  id: string;
  name: string;
  /**
   * False for a row that must stay on screen: one that is open with children
   * below it, or one that is selected.
   */
  foldable: boolean;
}

export type RunSegment = { kind: 'item'; id: string } | { kind: 'run'; ids: string[] };

/** The fewest rows a collapsed run may hold. */
export const MIN_RUN = 2;

/**
 * Groups consecutive siblings that share a name. The first row of a group
 * stays, and the rest fold into one run when at least `MIN_RUN` rows remain.
 */
export function groupRuns(items: RunItem[]): RunSegment[] {
  const out: RunSegment[] = [];
  let index = 0;
  while (index < items.length) {
    const first = items[index]!;
    // Step 1: find how far the group goes.
    let end = index + 1;
    if (first.foldable) {
      while (end < items.length && items[end]!.foldable && items[end]!.name === first.name) end++;
    }

    // Step 2: keep the first row, and fold the rest when there are enough.
    out.push({ kind: 'item', id: first.id });
    if (end - index - 1 >= MIN_RUN) {
      const ids: string[] = [];
      for (let at = index + 1; at < end; at++) ids.push(items[at]!.id);
      out.push({ kind: 'run', ids });
    } else {
      for (let at = index + 1; at < end; at++) out.push({ kind: 'item', id: items[at]!.id });
    }
    index = end;
  }
  return out;
}
