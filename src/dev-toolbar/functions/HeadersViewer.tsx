import { For } from 'solid-js';
import { Text } from '../../ui/Text.js';

import './HeadersViewer.css';

interface HeadersViewerProps {
  headers: Headers;
}

export function HeadersViewer(props: HeadersViewerProps) {
  return (
    <div data-solid-headers-viewer data-solid-kv-table>
      <For each={Array.from(props.headers.entries())}>
        {([key, value]) => (
          <div data-solid-property data-solid-kv-row>
            <Text
              data-solid-kv-key
              options={{ size: 'xs', weight: 'semibold', font: 'mono', wrap: 'nowrap' }}
            >
              {key}
            </Text>
            <Text data-solid-kv-value options={{ size: 'xs', font: 'mono', wrap: 'wrap' }}>
              {value}
            </Text>
          </div>
        )}
      </For>
    </div>
  );
}
