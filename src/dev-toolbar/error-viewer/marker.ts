/**
 * Prepares the source the code view highlights.
 *
 * The panel shows a window around a stack frame, but it highlights the whole
 * file and drops the lines outside the window afterwards. A window is a blunt
 * cut: starting it inside a block comment or a template literal leaves the
 * highlighter reading an opening it never saw, and the colours fall apart from
 * there.
 *
 * Twinkleplop reads directives out of comments in the source it highlights and
 * drops a line that holds nothing else, so the markers sit on their own lines
 * above the file and the code is never edited to carry them.
 */
const WORD = /[\p{L}\p{N}_$]/u;

/**
 * The word at a column.
 *
 * A column is 1-based in a stack frame and 0-based in a source map, and a
 * frame arrives from either, so both readings are tried.
 */
export function wordAt(line: string | undefined, column: number | undefined): string | undefined {
  if (!line || column === undefined) return undefined;
  for (const candidate of [column - 1, column]) {
    if (candidate < 0 || candidate >= line.length) continue;
    if (!WORD.test(line[candidate]!)) continue;
    let start = candidate;
    while (start > 0 && WORD.test(line[start - 1]!)) start--;
    let end = candidate;
    while (end < line.length && WORD.test(line[end]!)) end++;
    const word = line.slice(start, end);
    // A word that starts with a digit is part of a number, which reads worse
    // marked than the whole line does.
    if (!/^\p{N}/u.test(word)) return word;
  }
  return undefined;
}

export interface SnippetInput {
  content: string;
  /** 1-based line of the frame inside the file. */
  line: number;
  /** Column of the frame, when it carries one. */
  column?: number;
  /** How many lines to keep on each side of the frame. */
  range: number;
}

export interface Snippet {
  /** The whole file, with the markers above it. */
  source: string;
  /** Lines the markers take up, which sit above the file's first line. */
  offset: number;
  /** First line of the file to show. */
  first: number;
  /** Last line of the file to show. */
  last: number;
}

export function buildSnippet(input: SnippetInput): Snippet {
  const { content, line, column, range } = input;
  const lines = content.split('\n');

  const markers: string[] = [];
  if (line >= 1 && line <= lines.length) {
    // A line reference counts the lines that are dropped, so the frame's line
    // sits below the markers by however many there are.
    const word = wordAt(lines[line - 1], column);
    const target = line + (word ? 2 : 1);
    markers.push(`// [!focus :${target}]`);
    // The frame points at one word, which the error mark sits under while the
    // line around it stays in focus.
    if (word) markers.push(`// [!err =${word} :${target}]`);
  }

  return {
    source: [...markers, content].join('\n'),
    offset: markers.length,
    first: Math.max(line - range, 1),
    last: Math.min(line + range, lines.length),
  };
}
