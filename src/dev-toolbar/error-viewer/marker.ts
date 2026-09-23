/**
 * Builds the directive markers the code view puts above a snippet.
 *
 * Twinkleplop reads directives out of comments in the source it highlights,
 * and drops a line that holds nothing else. Keeping the markers on their own
 * lines means the code itself is never edited to carry them, which matters for
 * a snippet the reader compares against their own file.
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

export interface MarkerInput {
  /** The lines of the snippet, without any markers. */
  snippet: string[];
  /** 1-based line of the error inside the snippet. */
  line: number;
  /** Column of the error, when the frame carries one. */
  column?: number;
}

/**
 * The source to highlight: the markers, then the snippet.
 *
 * A line reference counts the lines that are dropped, so the error line moves
 * down by however many markers sit above it.
 */
export function withMarkers(input: MarkerInput): string {
  const { snippet, line, column } = input;
  if (line < 1 || line > snippet.length) return snippet.join('\n');

  const word = wordAt(snippet[line - 1], column);
  const target = line + (word ? 2 : 1);
  const markers = [`// [!hl :${target}]`];
  // The frame points at one word, which the error mark sits under while the
  // line stays highlighted around it.
  if (word) markers.push(`// [!err =${word} :${target}]`);

  return [...markers, ...snippet].join('\n');
}
