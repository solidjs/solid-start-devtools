const MAX_STRING = 48;
const MAX_ENTRIES = 6;

/** Short name for the type of a value, used as a badge in the node card. */
export function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (value instanceof Map) return 'map';
  if (value instanceof Set) return 'set';
  if (value instanceof Promise) return 'promise';
  if (typeof value === 'object') {
    if (typeof Node === 'function' && value instanceof Node) return 'node';
    const name = (value as object).constructor?.name;
    return name && name !== 'Object' ? name.toLowerCase() : 'object';
  }
  return typeof value;
}

function quote(value: string): string {
  const text = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  return `"${text}"`;
}

/**
 * One line preview of a value. Nested values are only expanded one level, so
 * the result stays short enough for a graph node or a hover card.
 */
export function formatValue(value: unknown, depth = 0): string {
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

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value instanceof Promise) return 'Promise';
  if (typeof Node === 'function' && value instanceof Node) {
    const element = value as unknown as Element;
    return element.tagName ? `<${element.tagName.toLowerCase()}>` : value.nodeName;
  }
  if (value instanceof Map) return `Map(${value.size})`;
  if (value instanceof Set) return `Set(${value.size})`;

  if (Array.isArray(value)) {
    if (depth > 0) return `Array(${value.length})`;
    const items = value.slice(0, MAX_ENTRIES).map((item) => formatValue(item, depth + 1));
    if (value.length > MAX_ENTRIES) items.push(`…${value.length - MAX_ENTRIES} more`);
    return `[${items.join(', ')}]`;
  }

  const name = (value as object).constructor?.name;
  const prefix = name && name !== 'Object' ? `${name} ` : '';
  if (depth > 0) return `${prefix}{…}`;

  let keys: string[];
  try {
    keys = Object.keys(value as object);
  } catch {
    return `${prefix}{…}`;
  }
  if (keys.length === 0) return `${prefix}{}`;
  const entries = keys.slice(0, MAX_ENTRIES).map((key) => {
    let inner: unknown;
    try {
      inner = (value as Record<string, unknown>)[key];
    } catch {
      return `${key}: …`;
    }
    return `${key}: ${formatValue(inner, depth + 1)}`;
  });
  if (keys.length > MAX_ENTRIES) entries.push(`…${keys.length - MAX_ENTRIES} more`);
  return `${prefix}{ ${entries.join(', ')} }`;
}

/** Multi line view of a value for the details pane. Falls back to the preview. */
export function formatValueDetail(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return formatValue(value);
  }
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value !== 'object' || value === null) return formatValue(value);
  try {
    const seen = new WeakSet<object>();
    const text = JSON.stringify(
      value,
      (_key, inner) => {
        if (typeof inner === 'bigint') return `${inner}n`;
        if (typeof inner === 'function') return formatValue(inner);
        if (inner && typeof inner === 'object') {
          if (seen.has(inner)) return '[circular]';
          seen.add(inner);
          if (typeof Node === 'function' && inner instanceof Node) return formatValue(inner);
        }
        return inner;
      },
      2,
    );
    return text ?? formatValue(value);
  } catch {
    return formatValue(value);
  }
}
