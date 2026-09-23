import { describe, expect, it } from 'vitest';
import { codeToHtml } from './highlight.js';
import { buildSnippet, wordAt } from './marker.js';

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

const FILE = [
  '/**',
  ' * A block comment the window would cut in half.',
  ' * More of it.',
  ' */',
  'export function boom() {',
  '  throw new Error("bang");',
  '}',
  '',
  'const tail = 1;',
].join('\n');

describe('buildSnippet', () => {
  // Both markers are dropped from the output, and `:N` counts dropped lines.
  it('marks the line and the word the column points at', () => {
    const { source } = buildSnippet({ content: FILE, line: 6, column: 3, range: 1 });
    expect(source.split('\n').slice(0, 2)).toEqual(['// [!focus :8]', '// [!err =throw :8]']);
  });

  it('marks the line alone without a column', () => {
    const { source } = buildSnippet({ content: FILE, line: 6, range: 1 });
    expect(source.split('\n')[0]).toBe('// [!focus :7]');
  });

  it('keeps the whole file and names the window around the frame', () => {
    const { source, first, last, offset } = buildSnippet({
      content: FILE,
      line: 6,
      column: 3,
      range: 1,
    });

    expect(source).toContain('A block comment the window would cut in half.');
    expect({ first, last, offset }).toEqual({ first: 5, last: 7, offset: 2 });
  });

  it('stops the window at the ends of the file', () => {
    const { first, last } = buildSnippet({ content: FILE, line: 5, range: 50 });
    expect({ first, last }).toEqual({ first: 1, last: 9 });
  });
});

describe('codeToHtml', () => {
  // Cutting the file at the window would leave the highlighter inside a block
  // comment it never saw open, and every line after it would read as comment.
  it('highlights a window under an unclosed-looking comment', () => {
    const html = codeToHtml({
      fileName: 'boom.ts',
      content: FILE,
      line: 6,
      column: 3,
      range: 1,
    });

    expect(html).toContain('<span class="tok keyword">throw</span>');
    expect(html).not.toContain('A block comment');
  });

  // The numbers are the file's own, and only the window's lines are kept.
  it('keeps the window and numbers it by the file', () => {
    const html = codeToHtml({ fileName: 'boom.ts', content: FILE, line: 6, column: 3, range: 1 });
    const numbers = [...html.matchAll(/<span class="ln">(\d+)<\/span>/g)].map((match) =>
      Number(match[1]),
    );

    expect(numbers).toEqual([5, 6, 7]);
  });

  it('puts the frame in focus and marks its word', () => {
    const html = codeToHtml({ fileName: 'boom.ts', content: FILE, line: 6, column: 3, range: 1 });

    expect(html).toContain('class="l focus"');
    expect(html).toContain('<span class="tok error">');
  });
});
