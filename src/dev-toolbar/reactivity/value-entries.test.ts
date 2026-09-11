import { describe, expect, it } from 'vitest';
import { containerEntries, entryCount, ownEntries } from './value-entries.js';

describe('ownEntries', () => {
  it('lists enumerable own properties', () => {
    expect(ownEntries({ a: 1, b: 'two' })).toEqual([
      { key: 'a', value: 1 },
      { key: 'b', value: 'two' },
    ]);
  });

  it('never calls a getter', () => {
    let calls = 0;
    const value = {
      get slow() {
        calls++;
        return 1;
      },
    };

    expect(ownEntries(value)).toEqual([{ key: 'slow', value: undefined, accessor: true }]);
    expect(calls).toBe(0);
  });

  it('skips non-enumerable properties and symbols', () => {
    const value: Record<string, unknown> = { shown: 1 };
    Object.defineProperty(value, 'hidden', { value: 2, enumerable: false });
    value[Symbol('tag') as unknown as string] = 3;

    expect(ownEntries(value).map((entry) => entry.key)).toEqual(['shown']);
  });

  it('stops at the entry limit', () => {
    const value = Object.fromEntries(
      Array.from({ length: 150 }, (_, index) => [`k${index}`, index]),
    );

    expect(ownEntries(value)).toHaveLength(100);
  });
});

describe('containerEntries', () => {
  it('indexes arrays', () => {
    expect(containerEntries(['a', 'b'])).toEqual([
      { key: 0, keyKind: 'number', value: 'a' },
      { key: 1, keyKind: 'number', value: 'b' },
    ]);
  });

  it('formats map keys', () => {
    const entries = containerEntries(new Map<unknown, unknown>([['id', 7]]));

    expect(entries).toEqual([{ key: '"id"', keyKind: 'key', value: 7 }]);
  });

  it('indexes sets', () => {
    expect(containerEntries(new Set(['x']))).toEqual([{ key: 0, keyKind: 'number', value: 'x' }]);
  });

  it('reads typed arrays by index', () => {
    expect(containerEntries(new Uint8Array([1, 2]))).toEqual([
      { key: 0, keyKind: 'number', value: 1 },
      { key: 1, keyKind: 'number', value: 2 },
    ]);
  });

  it('breaks errors into their parts', () => {
    const entries = containerEntries(new Error('boom'));

    expect(entries?.map((entry) => entry.key)).toEqual(['name', 'message', 'stack']);
    expect(entries?.[1]?.value).toBe('boom');
  });

  it('leaves plain objects to ownEntries', () => {
    expect(containerEntries({ a: 1 })).toBeUndefined();
  });
});

describe('entryCount', () => {
  it('counts what a container holds', () => {
    expect(entryCount([1, 2, 3])).toBe(3);
    expect(entryCount(new Set([1]))).toBe(1);
    expect(entryCount(new Map())).toBe(0);
    expect(entryCount(new Uint8Array(4))).toBe(4);
  });

  it('has no count for a plain object', () => {
    expect(entryCount({ a: 1 })).toBeUndefined();
  });
});
