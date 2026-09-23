// @refresh skip
import { createEffect, createMemo, createSignal } from 'solid-js';
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

/**
 * Lines kept on each side of the frame.
 *
 * The view scrolls about this far, so the snippet holds what the reader can
 * scroll to and nothing beyond it.
 */
const RANGE = 25;

export function CodeView(props: CodeViewProps): JSX.Element | null {
  const [element, setElement] = createSignal<HTMLDivElement>();

  const html = createMemo(() =>
    codeToHtml({
      fileName: props.fileName,
      content: props.content,
      line: props.line,
      column: props.column,
      range: RANGE,
    }),
  );

  // The frame can sit anywhere in the file, so the view opens on it. Scrolling
  // the box itself leaves the page where it is.
  createEffect(
    () => ({ view: element(), code: html() }),
    ({ view }) => {
      if (!view) return;
      const focused = view.querySelector('.focus') as HTMLElement | null;
      if (!focused) return;
      view.scrollTop = Math.max(focused.offsetTop - view.clientHeight / 2, 0);
    },
  );

  return <div ref={setElement} data-solid-error-viewer-code-view innerHTML={html()} />;
}
