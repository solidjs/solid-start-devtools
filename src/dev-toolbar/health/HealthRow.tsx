import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

export type Tone = 'error' | 'warn' | 'info';

const GLYPHS: Record<Tone, string> = { error: '✕', warn: '!', info: 'i' };

/** The glyph of a thrown error or an issue: red cross, amber bang or blue i. */
export function Glyph(props: { tone: Tone }): JSX.Element {
  return (
    <span data-solid-health-glyph={props.tone} aria-hidden="true">
      {GLYPHS[props.tone]}
    </span>
  );
}

export interface HealthRowProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  tone: Tone;
  title: string;
  subtitle: string;
  /** The age, or the count of a repeated issue. */
  time: string;
  selected: boolean;
}

/** One entry of the Health list: glyph, title and message, and when. */
export function HealthRow(props: HealthRowProps): JSX.Element {
  const rest = omit(props, 'tone', 'title', 'subtitle', 'time', 'selected');
  return (
    <button
      type="button"
      {...rest}
      data-solid-health-row
      data-selected={props.selected ? '' : undefined}
      aria-current={props.selected ? 'true' : undefined}
    >
      <Glyph tone={props.tone} />
      <span data-solid-health-row-what>
        <b>{props.title}</b>
        <span data-solid-health-row-sub>{props.subtitle}</span>
      </span>
      <span data-solid-health-row-time>{props.time}</span>
    </button>
  );
}
