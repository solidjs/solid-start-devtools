import { createMemo, For, Loading, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Section } from '../../ui/Section.js';
import { Text } from '../../ui/Text.js';

interface URLSearchParamsViewerInnerProps {
  source: URLSearchParams;
}

function URLSearchParamsViewerInner(props: URLSearchParamsViewerInnerProps): JSX.Element {
  return (
    <Section title="URLSearchParams" options={{ size: 'sm' }}>
      <div data-solid-properties data-solid-kv-table>
        <For each={Array.from(props.source.entries())}>
          {([key, value]) => (
            <div data-solid-property data-solid-kv-row>
              <Text
                data-solid-kv-key
                options={{ size: 'xs', weight: 'semibold', font: 'mono', wrap: 'nowrap' }}
              >
                {key}
              </Text>
              <Text data-solid-kv-value options={{ size: 'xs', font: 'mono', wrap: 'wrap' }}>
                {JSON.stringify(value)}
              </Text>
            </div>
          )}
        </For>
      </div>
    </Section>
  );
}

export interface URLSearchParamsViewerProps {
  source: URLSearchParams | Promise<URLSearchParams>;
}

export function URLSearchParamsViewer(props: URLSearchParamsViewerProps) {
  const data = createMemo(async () => await props.source);

  return (
    <Loading>
      <Show when={data()} keyed>
        {(current) => <URLSearchParamsViewerInner source={current} />}
      </Show>
    </Loading>
  );
}
