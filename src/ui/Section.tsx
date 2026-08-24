import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';
import { Text, type TextProps } from './Text.js';

import './Section.css';

export interface SectionProps {
  title: string;
  options?: TextProps<'span'>['options'];
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: JSX.Element;
}

export function Section(props: SectionProps): JSX.Element {
  return (
    <Show
      when={props.collapsible}
      fallback={
        <div data-solid-section>
          <Text
            data-solid-section-title
            options={{ weight: 'bold', font: 'sans', ...props.options }}
          >
            {props.title}
          </Text>
          <div data-solid-section-content>{props.children}</div>
        </div>
      }
    >
      <details data-solid-section open={props.defaultOpen ?? true}>
        <summary data-solid-section-title>
          <Text options={{ weight: 'bold', font: 'sans', ...props.options }}>{props.title}</Text>
        </summary>
        <div data-solid-section-content>{props.children}</div>
      </details>
    </Show>
  );
}
