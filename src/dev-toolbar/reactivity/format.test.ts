import { describe, expect, it } from 'vitest';
import { formatValue, typeName } from './format.js';

describe('formatValue', () => {
  it('formats primitives', () => {
    expect(formatValue(undefined)).toBe('undefined');
    expect(formatValue(null)).toBe('null');
    expect(formatValue(42)).toBe('42');
    expect(formatValue(true)).toBe('true');
    expect(formatValue('hi')).toBe('"hi"');
    expect(formatValue(10n)).toBe('10n');
  });

  it('truncates long strings', () => {
    expect(formatValue('x'.repeat(80))).toBe(`"${'x'.repeat(48)}…"`);
  });

  it('names functions', () => {
    expect(formatValue(function load() {})).toBe('ƒ load()');
  });

  it('previews arrays and objects one level deep', () => {
    expect(formatValue([1, 2])).toBe('[1, 2]');
    expect(formatValue({ a: 1, b: 'x' })).toBe('{ a: 1, b: "x" }');
    expect(formatValue({ nested: { deep: 1 } })).toBe('{ nested: {…} }');
  });

  it('counts the entries it leaves out', () => {
    expect(formatValue([1, 2, 3, 4, 5, 6, 7, 8])).toBe('[1, 2, 3, 4, 5, 6, …2 more]');
  });

  it('keeps class names', () => {
    class User {
      name = 'ada';
    }
    expect(formatValue(new User())).toBe('User { name: "ada" }');
  });

  it('reads collections by size', () => {
    expect(formatValue(new Map([['a', 1]]))).toBe('Map(1)');
    expect(formatValue(new Set([1, 2]))).toBe('Set(2)');
  });
});

describe('typeName', () => {
  it('names the kind of value', () => {
    expect(typeName(null)).toBe('null');
    expect(typeName([])).toBe('array');
    expect(typeName({})).toBe('object');
    expect(typeName(new Date())).toBe('date');
    expect(typeName(1)).toBe('number');
  });
});
