import { describe, expect, it } from 'vitest';
import { withMarkers, wordAt } from './marker.js';

describe('wordAt', () => {
  const line = '  throw new Error("boom");';

  it('reads a 1-based column', () => {
    expect(wordAt(line, 3)).toBe('throw');
  });

  it('reads a 0-based column', () => {
    expect(wordAt(line, 8)).toBe('new');
  });

  it('keeps the whole word from any position inside it', () => {
    expect(wordAt(line, 13)).toBe('Error');
  });

  it('has no word for punctuation', () => {
    expect(wordAt(line, 26)).toBeUndefined();
  });

  // A digit is part of a number, and a number reads worse marked than its line.
  it('has no word for a number', () => {
    expect(wordAt('const total = 42;', 15)).toBeUndefined();
  });

  it('has no word without a column', () => {
    expect(wordAt(line, undefined)).toBeUndefined();
  });
});

describe('withMarkers', () => {
  const snippet = ['function boom() {', '  throw new Error("boom");', '}'];

  // Both markers are dropped from the output, and `:N` counts dropped lines.
  it('marks the line and the word the column points at', () => {
    expect(withMarkers({ snippet, line: 2, column: 3 }).split('\n').slice(0, 2)).toEqual([
      '// [!hl :4]',
      '// [!err =throw :4]',
    ]);
  });

  it('marks the line alone without a column', () => {
    expect(withMarkers({ snippet, line: 2 }).split('\n')[0]).toBe('// [!hl :3]');
  });

  it('leaves the snippet alone when the line is outside it', () => {
    expect(withMarkers({ snippet, line: 9, column: 1 })).toBe(snippet.join('\n'));
  });
});
