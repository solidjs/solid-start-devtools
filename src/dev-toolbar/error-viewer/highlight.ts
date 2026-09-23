import { err, focus } from '@twinkleplop/annotation';
import { language as tsxLanguage } from '@twinkleplop/tsx';
import { language as typescriptLanguage } from '@twinkleplop/typescript';
import { buildSnippet, type SnippetInput } from './marker.js';

const options = {
  annotation: {
    plugins: [focus, err],
    // The markers are written by the panel, not by the reader, so a bad one is
    // a bug here rather than something the app's console should carry.
    on_error: () => {},
  },
};

const highlighters = {
  ts: typescriptLanguage(options),
  tsx: tsxLanguage(options),
};

/** The grammar for a file. The TSX grammar also covers plain JavaScript and JSX. */
function highlighterFor(fileName: string) {
  const extension = fileName.split(/[#?]/)[0]!.split('.').pop()?.trim();
  return extension === 'ts' || extension === 'mts' || extension === 'cts'
    ? highlighters.ts
    : highlighters.tsx;
}

const OUTSIDE = 'data-outside';

/**
 * Removes the lines the window leaves out.
 *
 * The highlighter writes one row per line and joins them with newlines, and a
 * row never holds a newline of its own, so the rows split cleanly. The wrapper
 * around them is kept whatever the first shown line is.
 */
function dropOutsideRows(html: string): string {
  const open = html.indexOf('<code>');
  const close = html.lastIndexOf('</code>');
  if (open < 0 || close < 0) return html;

  const start = open + '<code>'.length;
  const rows = html
    .slice(start, close)
    .split('\n')
    .filter((row) => !row.includes(OUTSIDE));

  return html.slice(0, start) + rows.join('\n') + html.slice(close);
}

export interface CodeHtmlInput extends SnippetInput {
  fileName: string;
}

/** The window around a frame, highlighted as part of the whole file. */
export function codeToHtml(input: CodeHtmlInput): string {
  const { source, offset, first, last } = buildSnippet(input);

  const html = highlighterFor(input.fileName)(source, {
    line_numbers: { start: 1 },
    line: (_rendered: number, sourceLine: number) => {
      const line = sourceLine - offset;
      return line < first || line > last ? { attrs: { [OUTSIDE]: '' } } : undefined;
    },
  });

  return dropOutsideRows(html);
}
