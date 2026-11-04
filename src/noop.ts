import type { DevServerChannel } from './protocol.js';
import type { ServerFunctionCall } from './dev-toolbar/functions/tracker.js';
import type { DevToolbarProps } from './dev-toolbar/index.js';

export type { DevToolbarProps, ServerFunctionCall };

export function DevToolbar(props: DevToolbarProps) {
  return props.children;
}

/** The dev server channel reaches the toolbar in the browser only. */
export function connectDevServer(_channel: DevServerChannel): void {}

export function mountDevToolbar(): () => void {
  return () => {};
}

export function pushServerFunctionCall(_event: ServerFunctionCall): void {}
