import type { TreeNode } from './tree.js';

/** What the reactive graph says about the computations created under one tree row. */
export interface OwnerActivity {
  /** Updates of every computation under the row, added up. */
  updates: number;
  /** Timestamp of the latest update under the row. Zero when nothing ran. */
  updatedAt: number;
  /** A computation under the row waits on async work. */
  pending: boolean;
}

/** The graph fields the heat needs. */
export interface ActivityNode {
  kind: string;
  updates: number;
  updatedAt: number;
  pending: boolean;
  raw: object;
  owner: object | undefined;
}

/** Updates in the window above this many per second make a row hot. */
export const HOT_RATE = 3;
/** An update this recent is red. */
export const RED_MS = 5_000;
/** An update this recent is amber. */
export const AMBER_MS = 30_000;
/** The row tells how long ago it updated for this long, then shows its counts again. */
export const AGO_MS = 60_000;
/** The span the update rate is measured over. */
export const RATE_WINDOW_MS = 2_000;

interface Parented {
  _parent?: Parented | null;
}

/**
 * Adds the graph's nodes up under the nearest tree row above each of them.
 * A signal belongs to its owner, a memo or effect to its own place in the owner chain.
 */
export function collectActivity(
  treeNodes: TreeNode[],
  graphNodes: ActivityNode[],
): Map<string, OwnerActivity> {
  const rowOf = new Map<object, string>();
  for (const node of treeNodes) rowOf.set(node.owner, node.id);

  const out = new Map<string, OwnerActivity>();
  for (const node of graphNodes) {
    // A node nobody ran has nothing to tell.
    if (node.updates === 0 && !node.pending) continue;

    // Step 1: find the row, climbing the owner chain from the node.
    const start = node.kind === 'signal' || node.kind === 'store' ? node.owner : node.raw;
    let id: string | undefined;
    for (let cursor = start as Parented | null | undefined; cursor; cursor = cursor._parent) {
      id = rowOf.get(cursor);
      if (id) break;
    }
    if (!id) continue;

    // Step 2: add it to the row.
    const entry = out.get(id) ?? { updates: 0, updatedAt: 0, pending: false };
    entry.updates += node.updates;
    entry.updatedAt = Math.max(entry.updatedAt, node.updatedAt);
    entry.pending = entry.pending || node.pending;
    out.set(id, entry);
  }
  return out;
}

export interface RateSample {
  at: number;
  updates: number;
}

/**
 * Adds a reading to a row's samples and returns the updates per second over
 * the window. The list is trimmed in place.
 */
export function pushRateSample(
  samples: RateSample[],
  now: number,
  updates: number,
  windowMs = RATE_WINDOW_MS,
): number {
  // Step 1: a total that went down means the row was rebuilt, so start over.
  const last = samples[samples.length - 1];
  if (last && updates < last.updates) samples.length = 0;
  samples.push({ at: now, updates });

  // Step 2: drop readings older than the window, but keep one at its edge.
  while (samples.length > 2 && samples[1]!.at <= now - windowMs) samples.shift();

  // Step 3: the rate between the oldest reading and this one.
  const first = samples[0]!;
  const seconds = (now - first.at) / 1000;
  if (seconds < 0.25) return 0;
  return (updates - first.updates) / seconds;
}

/** `4s`, `2m` or `1h`, for how long ago something happened. */
export function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

export interface RowHeat {
  dot: 'red' | 'amber' | undefined;
  /** Replaces the row's counts. Undefined keeps the counts. */
  text: string | undefined;
  tone: 'amber' | undefined;
}

/** The dot and the text a tree row shows for its activity. */
export function describeHeat(
  activity: OwnerActivity | undefined,
  rate: number,
  now: number,
): RowHeat {
  if (!activity) return { dot: undefined, text: undefined, tone: undefined };
  if (activity.pending) return { dot: undefined, text: 'waiting', tone: 'amber' };

  const age = activity.updatedAt > 0 ? now - activity.updatedAt : Infinity;
  const hot = rate >= HOT_RATE && age < RED_MS;
  if (hot) return { dot: 'red', text: `${Math.round(rate)}/s`, tone: undefined };

  let dot: RowHeat['dot'];
  if (age < RED_MS) dot = 'red';
  else if (age < AMBER_MS) dot = 'amber';
  const text = age < AGO_MS ? `updated ${formatAgo(age)} ago` : undefined;
  return { dot, text, tone: undefined };
}
