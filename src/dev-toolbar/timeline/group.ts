import type { TimelineEntry } from './tracker.js';

/** Fewest consecutive entries with one label that fold into one row. */
export const MIN_FOLD = 2;

/** The total time of the entry: the interaction's settle time, else its flushes. */
export function entryDuration(entry: TimelineEntry): number {
  return entry.interaction?.settledMs ?? entry.flushMs;
}

export function entryRunCount(entry: TimelineEntry): number {
  return entry.interaction?.runs ?? entry.runs.length + entry.droppedRuns;
}

export interface TimelineGroup {
  /**
   * The id of the group's oldest entry. The list is newest first, so new
   * entries join at the front and this id stays the same while the run grows.
   */
  key: number;
  label: string;
  /** In list order. A group of one is a plain row. */
  entries: TimelineEntry[];
  folded: boolean;
  writes: number;
  runs: number;
  calls: number;
  /** The sum of the entries' durations. */
  totalMs: number;
}

/** Folds runs of consecutive entries that share a label into one group each. */
export function groupEntries(entries: readonly TimelineEntry[]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  let run: TimelineEntry[] = [];

  function closeRun(): void {
    if (!run.length) return;
    const folded = run.length >= MIN_FOLD;
    // A run that is too short stays as one group per entry.
    if (folded) groups.push(summarize(run, true));
    else for (const entry of run) groups.push(summarize([entry], false));
    run = [];
  }

  for (const entry of entries) {
    // A different label ends the run.
    if (run.length && run[0].label !== entry.label) closeRun();
    run.push(entry);
  }
  closeRun();
  return groups;
}

function summarize(entries: TimelineEntry[], folded: boolean): TimelineGroup {
  let writes = 0;
  let runs = 0;
  let calls = 0;
  let totalMs = 0;
  for (const entry of entries) {
    writes += entry.writes.length;
    runs += entryRunCount(entry);
    calls += entry.calls.length;
    totalMs += entryDuration(entry);
  }
  return {
    key: entries[entries.length - 1].id,
    label: entries[0].label,
    entries,
    folded,
    writes,
    runs,
    calls,
    totalMs,
  };
}
