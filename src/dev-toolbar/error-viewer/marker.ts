/**
 * Prepares the source the code view highlights.
 *
 * The panel shows a window around a stack frame, but it highlights the whole
 * file and hides the rest. A window is a blunt cut: starting it inside a block
 * comment or a template literal leaves the highlighter reading an opening it
 * never saw, and the colours fall apart from there. Hiding instead of cutting
 * keeps the file whole for the tokenizer and shows the reader the same lines.
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

/** A range of the source the renderer leaves out. */
export interface HiddenRange {
  start: number;
  end: number;
  hide: true;
}

export interface SnippetInput {
  content: string;
  /** 1-based line of the frame inside the file. */
  line: number;
  /** Column of the frame, when it carries one. */
  column?: number;
  /** How many lines to show on each side of the frame. */
  range: number;
}

export interface Snippet {
  /** The whole file, with the markers above it. */
  source: string;
  /** The parts outside the window, which the renderer leaves out. */
  hidden: HiddenRange[];
  /** The number the first shown line carries. */
  firstLine: number;
}

/** Byte offset of the start of every line. */
function lineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

export function buildSnippet(input: SnippetInput): Snippet {
  const { content, line, column, range } = input;
  const lines = content.split('\n');

  const first = Math.max(line - range, 1);
  const last = Math.min(line + range, lines.length);

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

  const source = [...markers, content].join('\n');
  const starts = lineStarts(source);
  const offset = markers.length;

  // The marker lines are dropped on their own, so only the file's own lines
  // outside the window are hidden.
  const hidden: HiddenRange[] = [];
  if (first > 1) hidden.push({ start: 0, end: starts[offset + first - 1]!, hide: true });
  if (last < lines.length) {
    const tail = starts[offset + last];
    if (tail !== undefined && tail < source.length) {
      hidden.push({ start: tail, end: source.length, hide: true });
    }
  }

  return { source, hidden, firstLine: first };
}
