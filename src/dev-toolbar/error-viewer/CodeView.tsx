// @refresh skip
import { err, hl } from '@twinkleplop/annotation';
import { language as tsxLanguage } from '@twinkleplop/tsx';
import { language as typescriptLanguage } from '@twinkleplop/typescript';
import { createMemo } from 'solid-js';
import { withMarkers } from './marker.js';
import type { JSX } from '@solidjs/web';
import '@twinkleplop/theme-github/dark';

const options = {
  annotation: {
    plugins: [hl, err],
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
function highlighterFor(fileName: string): (input: string, render?: object) => string {
  const extension = fileName.split(/[#?]/)[0]!.split('.').pop()?.trim();
  return extension === 'ts' || extension === 'mts' || extension === 'cts'
    ? highlighters.ts
    : highlighters.tsx;
}

export interface CodeViewProps {
  fileName: string;
  content: string;
  line: number;
  /** Column of the error, so the marker can point at one word instead of the line. */
  column?: number;
}

const RANGE = 15;

export function CodeView(props: CodeViewProps): JSX.Element | null {
  const lines = () => props.content.split('\n');

  const minLine = () => Math.max(props.line - (1 + RANGE), 0);
  const maxLine = () => Math.min(props.line + RANGE, lines().length - 1);

  const html = createMemo(() => {
    const snippet = lines().slice(minLine(), maxLine());
    const source = withMarkers({
      snippet,
      // 1-based line of the error inside the snippet.
      line: props.line - minLine(),
      column: props.column,
    });

    return highlighterFor(props.fileName)(source, {
      line_numbers: { start: minLine() + 1 },
    });
  });

  return <div data-solid-error-viewer-code-view innerHTML={html()} />;
}
