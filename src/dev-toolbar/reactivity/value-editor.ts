import { createRoot, createSignal, DEV, flush, getOwner, OBSERVE, runWithOwner } from 'solid-js';
import { excludeOwner } from '../ownership/registry.js';
import { excludeReactiveOwner } from './registry.js';

/**
 * Whether a value is an array or an object made by `{}` or
 * `Object.create(null)`. Only these can be copied with a spread without losing
 * what they are, so only these are edited in place.
 */
export function isPlainContainer(value: unknown): value is Record<string | number, unknown> {
  if (Array.isArray(value)) return true;
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Whether `JSON.stringify` and `JSON.parse` give back an equal value: plain
 * objects and arrays holding only strings, finite numbers, booleans and null.
 */
export function isJsonValue(value: unknown, seen: object[] = []): boolean {
  if (value === null) return true;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'object':
      break;
    default:
      return false;
  }
  if (!isPlainContainer(value) || seen.includes(value)) return false;
  const nested = [...seen, value];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return false;
    if (Array.isArray(value) && key === 'length') continue;
    if (!isJsonValue(descriptor.value, nested)) return false;
  }
  return true;
}

/**
 * Whether every container `path` passes through is plain, so `updatePath` can
 * copy it.
 */
export function canUpdatePath(target: unknown, path: readonly (string | number)[]): boolean {
  let current = target;
  for (const key of path) {
    if (!isPlainContainer(current)) return false;
    current = current[key];
  }
  return true;
}

/**
 * Updates a nested property along `path` immutably. Every container on the
 * path has to be plain, which `canUpdatePath` checks.
 */
export function updatePath<T>(target: T, path: readonly (string | number)[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...tail] = path;
  const isArr = Array.isArray(target);
  const next = isArr ? ([...target] as unknown as T) : ({ ...target } as T);
  (next as Record<string | number, unknown>)[head] = updatePath(
    (target as Record<string | number, unknown>)?.[head],
    tail,
    value,
  );
  return next;
}

/**
 * Whether a value can be edited as text: a primitive other than a symbol, or
 * a value that survives a JSON round trip.
 */
export function isTextEditable(value: unknown): boolean {
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'undefined':
      return true;
    case 'object':
      return isJsonValue(value);
    default:
      return false;
  }
}

/**
 * Formats a value for editing in an input field.
 */
export function formatDraftValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return `${value}`;
}

/**
 * Parses user string input into an appropriately typed value.
 */
export function parseValueInput(raw: string, currentValue?: unknown): unknown {
  const trimmed = raw.trim();

  // Guard against accidental [object Object] serialization corrupting objects.
  if (trimmed === '[object Object]' && typeof currentValue === 'object') {
    return currentValue;
  }

  if (typeof currentValue === 'number') {
    const num = Number(trimmed);
    if (!Number.isNaN(num) && trimmed !== '') return num;
  }
  if (typeof currentValue === 'boolean') {
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    return currentValue;
  }
  if (typeof currentValue === 'bigint') {
    const digits = trimmed.endsWith('n') ? trimmed.slice(0, -1) : trimmed;
    if (/^-?\d+$/.test(digits)) return BigInt(digits);
    return currentValue;
  }
  if (currentValue === null && trimmed === 'null') {
    return null;
  }
  if (typeof currentValue === 'undefined' && trimmed === 'undefined') {
    return undefined;
  }
  if (typeof currentValue === 'string') {
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return raw;
  }

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Non-parseable JSON falls through as literal string.
    }
  }

  if (!Number.isNaN(Number(trimmed)) && trimmed !== '') {
    return Number(trimmed);
  }

  return raw;
}

/**
 * A write hook a solid-js dev build may offer on `DEV`: set a signal node, or
 * the slot node of a store property, to a value and notify its subscribers.
 * Proposed in solidjs/solid#4679 and not in any release yet.
 */
type SetSignalHook = (node: object, value: unknown) => void;

function runtimeSetSignal(): SetSignalHook | undefined {
  const hook = (DEV as { setSignal?: unknown } | undefined)?.setSignal;
  return typeof hook === 'function' ? (hook as SetSignalHook) : undefined;
}

/**
 * The value to write to `target` so that `path` inside it holds `nextValue`.
 * For a store slot this is the new value of the slot's key. Undefined when
 * the path passes through a container that is not plain.
 */
function resolveWrite(
  target: Record<string, any>,
  path: readonly (string | number)[],
  nextValue: unknown,
): { value: unknown } | undefined {
  if (path.length === 0) return { value: nextValue };
  const isStoreSlot = '_host' in target && target._host;
  const current = isStoreSlot && target._host.v ? target._host.v[target._key] : target._value;
  if (!canUpdatePath(current, path)) return undefined;
  return { value: updatePath(current, path, nextValue) };
}

/**
 * Bridges external writes into Solid's internal reactivity scheduler, for
 * runtimes without the `DEV.setSignal` hook.
 *
 * In Solid 2.0, signal writes trigger subscriber notification and queue flush
 * via the internal `setSignal` function bound during `createSignal`. Devtools
 * receives the raw reactive node without its user-space setter. By binding a
 * bridge signal node whose properties are forwarded to the inspected target node,
 * writes route through Solid's native setter and subscriber propagation without
 * requiring private module deep imports or reimplementing the internal heap.
 *
 * This depends on the private field names of the runtime's nodes, so a rename
 * in solid-js breaks it. The tests in `value-editor.dev.test.ts` run it against
 * the dev build to catch that when solid-js is updated.
 */
class ReactiveWriter {
  private setter?: (value: unknown) => unknown;
  private bridgeNode?: Record<string, unknown>;
  /** The node the bridge forwards to now. */
  private forwarded?: Record<string, any>;

  private ensureBridge(): void {
    if (this.setter && this.bridgeNode) return;
    createRoot(() => {
      const [_, set] = createSignal(0);
      this.setter = set as (value: unknown) => unknown;
      const owner = getOwner();
      // The bridge is the toolbar's, so the graph, the tree and the runtime's
      // records leave it out. Listed as app code, the graph could hand it back
      // as the node to edit.
      excludeReactiveOwner(owner);
      excludeOwner(owner);
      if (owner) OBSERVE?.exclude(owner);
      const signals = DEV?.getSignals
        ? (DEV.getSignals(owner as never) as Record<string, unknown>[])
        : [];
      this.bridgeNode = signals[0];
    });
  }

  public write(target: Record<string, any>, nextValue: unknown): boolean {
    // The bridge has to exist before anything is written, or a failed setup
    // would leave the backing data changed with no subscriber told.
    this.ensureBridge();
    if (!this.setter || !this.bridgeNode) return false;

    // A panel that still holds the bridge means the node it forwards to.
    // Forwarding the bridge to itself would recurse in every getter.
    if (target === this.bridgeNode) {
      if (!this.forwarded) return false;
      target = this.forwarded;
    }
    this.forwarded = target;

    if ('_host' in target && target._host) {
      const key = target._key;
      if (target._host.v) target._host.v[key] = nextValue;
      if (target._host.pb) target._host.pb[key] = nextValue;
    }

    const keys = new Set<string>([
      ...Object.getOwnPropertyNames(this.bridgeNode),
      ...Object.getOwnPropertyNames(target),
      '_config',
      '_firewall',
      '_transition',
      '_x',
      '_pendingValue',
      '_value',
      '_statusFlags',
      '_equals',
      '_name',
      '_fn',
      '_time',
      '_notifiedAt',
      '_subs',
      '_subsTail',
      '_owner',
      '_internal',
      '_host',
      '_key',
    ]);

    for (const key of keys) {
      Object.defineProperty(this.bridgeNode, key, {
        get: () => target[key],
        set: (val: unknown) => {
          target[key] = val;
        },
        configurable: true,
        enumerable: true,
      });
    }

    // External devtools writes run without an owner to bypass owned-scope checks.
    runWithOwner(null, () => {
      this.setter!(nextValue);
    });
    return true;
  }
}

const writer = new ReactiveWriter();

/**
 * Writes a new value to a reactive signal or store node at the specified path.
 * Returns false when the write did not reach the runtime: the bridge could not
 * be set up, or the path passes through a container that is not plain.
 */
export function writeReactiveValue(
  target: object,
  path: readonly (string | number)[],
  nextValue: unknown,
): boolean {
  if (!target || typeof target !== 'object') return false;
  const node = target as Record<string, any>;
  const write = resolveWrite(node, path, nextValue);
  if (!write) return false;

  // Prefer the runtime's own write hook; fall back to the bridge without it.
  const setSignal = runtimeSetSignal();
  if (setSignal) {
    runWithOwner(null, () => setSignal(node, write.value));
  } else if (!writer.write(node, write.value)) {
    return false;
  }

  try {
    flush();
  } catch {
    // In browser microtask environments flush may already be pending.
  }
  return true;
}
