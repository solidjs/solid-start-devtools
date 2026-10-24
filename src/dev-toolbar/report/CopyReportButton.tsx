import type { JSX } from '@solidjs/web';
import { createSignal, onCleanup, Show } from 'solid-js';
import IconButton from '../../ui/IconButton.js';
import { CheckIcon, CopyIcon } from '../icons.js';
import './styles.css';

/** How long the button shows that the report was copied. */
const COPIED_MS = 1500;

/**
 * Writes text to the clipboard. The Clipboard API needs a secure context, and
 * a dev server opened by its network address is not one, so a selected
 * textarea and `execCommand` take over there.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  try {
    area.select();
    if (!document.execCommand('copy')) throw new Error('The browser refused to copy.');
  } finally {
    area.remove();
  }
}

export interface CopyReportButtonProps {
  /** Builds the report when the button is pressed. */
  report: () => string | Promise<string>;
  /** What the button copies, such as "this error". */
  label: string;
}

/** Copies a Markdown report for an agent, such as Claude Code, to read. */
export function CopyReportButton(props: CopyReportButtonProps): JSX.Element {
  const [state, setState] = createSignal<'idle' | 'busy' | 'copied' | 'failed'>('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  async function copy() {
    if (state() === 'busy') return;
    setState('busy');
    try {
      await copyText(await props.report());
      setState('copied');
    } catch (error) {
      console.warn('[solid dev toolbar] failed to copy the report', error);
      setState('failed');
    }
    clearTimeout(timer);
    timer = setTimeout(() => setState('idle'), COPIED_MS);
  }

  const title = () => {
    switch (state()) {
      case 'copied':
        return 'Copied';
      case 'failed':
        return 'Could not copy, see the console';
      default:
        return `Copy ${props.label} for an agent`;
    }
  };

  return (
    <IconButton
      data-solid-copy-report={state()}
      aria-label={title()}
      disabled={state() === 'busy'}
      onClick={copy}
    >
      <Show when={state() === 'copied'} fallback={<CopyIcon title={title()} />}>
        <CheckIcon title={title()} />
      </Show>
    </IconButton>
  );
}
