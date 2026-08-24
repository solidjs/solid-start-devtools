import { createMemo, For, Loading, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Section } from '../../ui/Section.js';
import { Text } from '../../ui/Text.js';
import { BlobViewer } from './BlobViewer.js';

interface FormDataViewerInnerProps {
  source: FormData;
}

function FormDataViewerInner(props: FormDataViewerInnerProps): JSX.Element {
  return (
    <Section title="FormData" options={{ size: 'sm' }}>
      <div data-solid-form-data-viewer data-solid-kv-table>
        <For each={Array.from(props.source.entries())}>
          {([key, value]) => (
            <div data-solid-property data-solid-kv-row>
              <Text
                data-solid-kv-key
                options={{ size: 'xs', weight: 'semibold', font: 'mono', wrap: 'nowrap' }}
              >
                {key}
              </Text>
              {typeof value === 'string' ? (
                <Text data-solid-kv-value options={{ size: 'xs', font: 'mono', wrap: 'wrap' }}>
                  {JSON.stringify(value)}
                </Text>
              ) : (
                <BlobViewer source={value} />
              )}
            </div>
          )}
        </For>
      </div>
    </Section>
  );
}

export interface FormDataViewerProps {
  source: FormData | Promise<FormData>;
}

export function FormDataViewer(props: FormDataViewerProps) {
  const data = createMemo(async () => await props.source);

  return (
    <Loading>
      <Show when={data()} keyed>
        {(current) => <FormDataViewerInner source={current} />}
      </Show>
    </Loading>
  );
}
