import { DEV } from 'solid-js';
import { buildOwnershipTree, EMPTY_TREE, type OwnershipTree, type RawNode } from './tree.js';

let nextId = 1;
const ids = new WeakMap<object, string>();
const excluded = new WeakSet<object>();
const included = new WeakSet<object>();

/** Owners the runtime told us about, weak so the app can still collect them. */
const tracked = new Set<WeakRef<RawNode>>();
const trackedRefs = new WeakMap<object, WeakRef<RawNode>>();
const collected =
  typeof FinalizationRegistry === 'function'
    ? new FinalizationRegistry<WeakRef<RawNode>>((ref) => tracked.delete(ref))
    : undefined;

const listeners = new Set<() => void>();
let uninstall: (() => void) | undefined;
let watchers = 0;
let frame: number | undefined;
/** An owner inside the toolbar. The walk climbs from here to the app root. */
let seedOwner: RawNode | undefined;

/** True when the app runs a development build of solid-js. */
export function isOwnershipAvailable(): boolean {
  return !!DEV && typeof DEV.getChildren === 'function';
}

function identify(node: object): string {
  let id = ids.get(node);
  if (!id) {
    id = `o${nextId++}`;
    ids.set(node, id);
  }
  return id;
}

function track(owner: RawNode | null | undefined): void {
  if (!owner || typeof owner !== 'object' || trackedRefs.has(owner)) return;
  const ref = new WeakRef(owner);
  trackedRefs.set(owner, ref);
  tracked.add(ref);
  collected?.register(owner, ref);
}

function notify(): void {
  if (frame !== undefined || listeners.size === 0) return;
  frame = requestAnimationFrame(() => {
    frame = undefined;
    for (const listener of listeners) listener();
  });
}

/**
 * Installs the devtools hooks on the reactive runtime. Existing hooks are kept
 * and still called, so other tools sharing the slot keep working.
 */
export function startOwnershipTracking(): () => void {
  if (!isOwnershipAvailable()) return () => {};
  watchers++;
  if (uninstall) return release;

  const hooks = DEV!.hooks;
  const previousOwner = hooks.onOwner;
  const previousGraph = hooks.onGraph;
  const previousUpdate = hooks.onUpdate;

  hooks.onOwner = (owner) => {
    previousOwner?.(owner);
    track(owner as RawNode);
    notify();
  };
  hooks.onGraph = (value, owner) => {
    previousGraph?.(value, owner);
    if (owner) track(owner as RawNode);
    notify();
  };
  hooks.onUpdate = () => {
    previousUpdate?.();
    notify();
  };

  uninstall = () => {
    hooks.onOwner = previousOwner;
    hooks.onGraph = previousGraph;
    hooks.onUpdate = previousUpdate;
    uninstall = undefined;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
  return release;
}

/** Drops one watcher. The hooks come off once nothing watches any more. */
function release(): void {
  watchers = Math.max(0, watchers - 1);
  if (watchers === 0) uninstall?.();
}

/** Calls `listener` after the tree changed, at most once per frame. */
export function subscribeOwnershipTree(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Marks an owner as belonging to the toolbar itself. Its subtree never shows up
 * in the tree, so the panel does not list its own components.
 */
export function excludeOwner(owner: unknown): void {
  if (!owner || typeof owner !== 'object') return;
  excluded.add(owner);
  seedOwner ??= owner as RawNode;
}

/**
 * Marks an owner as app code again. The toolbar wraps the app, so the scope
 * holding `props.children` carries this marker and stays in the tree.
 */
export function includeOwner(owner: unknown): void {
  if (owner && typeof owner === 'object') included.add(owner);
}

function isExcluded(owner: RawNode): boolean {
  return excluded.has(owner);
}

function isIncluded(owner: RawNode): boolean {
  return included.has(owner);
}

function childrenOf(owner: RawNode): RawNode[] {
  try {
    // The runtime keeps the newest child first, so reversing puts the tree in
    // creation order, which is the order the app reads in.
    return (DEV!.getChildren(owner as never) as RawNode[]).reverse();
  } catch {
    return [];
  }
}

function signalsOf(owner: RawNode): RawNode[] {
  try {
    return DEV!.getSignals(owner as never) as RawNode[];
  } catch {
    return [];
  }
}

function rootOf(owner: RawNode): RawNode {
  let current = owner;
  while (current._parent) current = current._parent;
  return current;
}

export interface SnapshotOptions {
  componentsOnly?: boolean;
  includeDisposed?: boolean;
}

/**
 * Reads the current owner tree.
 *
 * The walk starts at every known root: the one above the toolbar, plus the root
 * of every owner the hooks reported. That covers owners created before the
 * panel opened and roots the toolbar does not sit under.
 */
export function snapshotOwnershipTree(options?: SnapshotOptions): OwnershipTree {
  if (!isOwnershipAvailable()) return EMPTY_TREE;

  const roots = new Set<RawNode>();
  if (seedOwner) roots.add(rootOf(seedOwner));
  for (const ref of tracked) {
    const owner = ref.deref();
    if (!owner) {
      tracked.delete(ref);
      continue;
    }
    roots.add(rootOf(owner));
  }

  return buildOwnershipTree([...roots], {
    children: childrenOf,
    signals: signalsOf,
    identify,
    isExcluded,
    isIncluded,
    componentsOnly: options?.componentsOnly ?? true,
    includeDisposed: options?.includeDisposed,
  });
}
