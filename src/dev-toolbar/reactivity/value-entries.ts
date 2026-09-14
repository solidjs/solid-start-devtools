import { formatValue } from './format.js';

/** Entries listed per container. Anything past this is summarised. */
const ENTRY_LIMIT = 100;

export interface Entry {
  key: string | number;
  keyKind?: 'key' | 'number' | 'keyword';
  value: unknown;
  /** Set when the property is an accessor, which the inspector never calls. */
  accessor?: boolean;
}

export function ownEntries(value: object): Entry[] {
  const entries: Entry[] = [];
  let keys: (string | symbol)[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return entries;
  }
  for (const key of keys) {
    if (typeof key === 'symbol') continue;
    if (entries.length >= ENTRY_LIMIT) break;
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      continue;
    }
    if (!descriptor || descriptor.enumerable === false) continue;
    // Getters can run app code and can throw, so the inspector reports them
    // instead of reading them.
    if (!('value' in descriptor)) {
      entries.push({ key, value: undefined, accessor: true });
      continue;
    }
    entries.push({ key, value: descriptor.value });
  }
  return entries;
}

export function containerEntries(value: object): Entry[] | undefined {
  if (Array.isArray(value)) {
    return value
      .slice(0, ENTRY_LIMIT)
      .map((item, index) => ({ key: index, keyKind: 'number' as const, value: item }));
  }
  if (value instanceof Map) {
    const entries: Entry[] = [];
    for (const [key, item] of value) {
      if (entries.length >= ENTRY_LIMIT) break;
      entries.push({ key: formatValue(key, 1), keyKind: 'key', value: item });
    }
    return entries;
  }
  if (value instanceof Set) {
    const entries: Entry[] = [];
    let index = 0;
    for (const item of value) {
      if (entries.length >= ENTRY_LIMIT) break;
      entries.push({ key: index++, keyKind: 'number', value: item });
    }
    return entries;
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const view = value as unknown as ArrayLike<number>;
    const entries: Entry[] = [];
    for (let index = 0; index < view.length && index < ENTRY_LIMIT; index++) {
      entries.push({ key: index, keyKind: 'number', value: view[index] });
    }
    return entries;
  }
  if (value instanceof Error) {
    return [
      { key: 'name', value: value.name },
      { key: 'message', value: value.message },
      { key: 'stack', value: value.stack },
    ];
  }
  return undefined;
}

export function entryCount(value: object): number | undefined {
  if (Array.isArray(value)) return value.length;
  if (value instanceof Map || value instanceof Set) return value.size;
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return (value as unknown as ArrayLike<number>).length;
  }
  return undefined;
}
