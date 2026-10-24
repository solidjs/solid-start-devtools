import { isSensitiveName, REDACTED } from './redact.js';

const MAX_DEPTH = 3;
const MAX_ENTRIES = 20;
const MAX_STRING = 200;

function quote(value: string): string {
  const text = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  return JSON.stringify(text);
}

function read(target: object, key: string): { value: unknown } | { failed: true } {
  try {
    return { value: (target as Record<string, unknown>)[key] };
  } catch {
    return { failed: true };
  }
}

/**
 * A value as one line of source-like text, a few levels deep. Deeper than
 * the previews in the panels, since an agent reads the whole line. Keys with
 * sensitive names have their values replaced, and a value seen above itself
 * prints as `[Circular]`.
 */
export function describeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return quote(value);
    case 'number':
    case 'boolean':
      return String(value);
    case 'bigint':
      return `${value}n`;
    case 'symbol':
      return value.toString();
    case 'function':
      return value.name ? `ƒ ${value.name}()` : 'ƒ ()';
  }

  const target = value as object;
  if (target instanceof Date) return `Date(${target.toISOString()})`;
  if (target instanceof RegExp) return target.toString();
  if (target instanceof Error) return `${target.name}: ${target.message}`;
  if (target instanceof Promise) return 'Promise';
  if (typeof Node === 'function' && target instanceof Node) {
    const element = target as unknown as Element;
    return element.tagName ? `<${element.tagName.toLowerCase()}>` : target.nodeName;
  }
  if (ArrayBuffer.isView(target)) return `${target.constructor.name}(${target.byteLength} bytes)`;

  if (seen.has(target)) return '[Circular]';
  if (depth >= MAX_DEPTH) {
    if (Array.isArray(target)) return `Array(${target.length})`;
    if (target instanceof Map) return `Map(${target.size})`;
    if (target instanceof Set) return `Set(${target.size})`;
    return '{…}';
  }
  seen.add(target);
  try {
    const inner = (item: unknown) => describeValue(item, depth + 1, seen);
    const more = (total: number) => (total > MAX_ENTRIES ? [`…${total - MAX_ENTRIES} more`] : []);

    if (Array.isArray(target)) {
      const items = target.slice(0, MAX_ENTRIES).map(inner);
      return `[${[...items, ...more(target.length)].join(', ')}]`;
    }
    if (target instanceof Map) {
      const entries = Array.from(target.entries())
        .slice(0, MAX_ENTRIES)
        .map(([key, item]) =>
          typeof key === 'string' && isSensitiveName(key)
            ? `${inner(key)} => ${REDACTED}`
            : `${inner(key)} => ${inner(item)}`,
        );
      return `Map(${target.size}) { ${[...entries, ...more(target.size)].join(', ')} }`;
    }
    if (target instanceof Set) {
      const items = Array.from(target).slice(0, MAX_ENTRIES).map(inner);
      return `Set(${target.size}) { ${[...items, ...more(target.size)].join(', ')} }`;
    }

    const name = target.constructor?.name;
    const prefix = name && name !== 'Object' ? `${name} ` : '';
    let keys: string[];
    try {
      keys = Object.keys(target);
    } catch {
      return `${prefix}{…}`;
    }
    if (keys.length === 0) return `${prefix}{}`;
    const entries = keys.slice(0, MAX_ENTRIES).map((key) => {
      if (isSensitiveName(key)) return `${key}: ${REDACTED}`;
      const result = read(target, key);
      return 'failed' in result ? `${key}: …` : `${key}: ${inner(result.value)}`;
    });
    return `${prefix}{ ${[...entries, ...more(keys.length)].join(', ')} }`;
  } finally {
    seen.delete(target);
  }
}
