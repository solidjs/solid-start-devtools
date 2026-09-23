// @refresh skip
import { createMemo } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { codeToHtml } from './highlight.js';
import '@twinkleplop/theme-github/dark';

export interface CodeViewProps {
  fileName: string;
  content: string;
  line: number;
  /** Column of the error, so the marker can point at one word instead of the line. */
  column?: number;
}

const RANGE = 15;

export function CodeView(props: CodeViewProps): JSX.Element | null {
  const html = createMemo(() =>
    codeToHtml({
      fileName: props.fileName,
      content: props.content,
      line: props.line,
      column: props.column,
      range: RANGE,
    }),
  );

  return <div data-solid-error-viewer-code-view innerHTML={html()} />;
}
