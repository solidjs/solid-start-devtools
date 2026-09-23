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

export interface CodeHtmlInput extends SnippetInput {
  fileName: string;
}

/** The window around a frame, highlighted as part of the whole file. */
export function codeToHtml(input: CodeHtmlInput): string {
  const { source, hidden, firstLine } = buildSnippet(input);
  return highlighterFor(input.fileName)(source, {
    line_numbers: { start: firstLine },
    overlays: hidden,
  });
}
