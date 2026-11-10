import { formatValue } from '../reactivity/format.js';
import type { SignalChange } from '../ownership/index.js';

interface Seen {
  value: unknown;
  prev?: unknown;
  at?: number;
}

/**
 * Remembers each signal's value the last time the tree showed it, and the
 * value before that. The runtime does not hand out the id its write records
 * use, so the history is kept per node here.
 */
export class SignalHistory {
  #seen = new WeakMap<object, Seen>();

  /** Notes the node's current value, and returns its last change if it had one. */
  lastChange(node: object, now = performance.now()): SignalChange | undefined {
    const value = (node as { _value?: unknown })._value;
    const seen = this.#seen.get(node);
    if (!seen) {
      this.#seen.set(node, { value });
      return undefined;
    }
    // A new value moves the old one into `prev` and stamps the time.
    if (!Object.is(seen.value, value)) {
      seen.prev = seen.value;
      seen.at = now;
      seen.value = value;
    }
    if (seen.at === undefined) return undefined;
    return { prev: formatValue(seen.prev), at: seen.at };
  }
}
