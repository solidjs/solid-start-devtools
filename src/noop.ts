import type { ServerFunctionCall } from './dev-toolbar/functions/tracker.js';
import type { DevToolbarProps } from './dev-toolbar/index.js';

export type { DevToolbarProps, ServerFunctionCall };

export function DevToolbar(props: DevToolbarProps) {
  return props.children;
}

export function mountDevToolbar(): () => void {
  return () => {};
}

export function pushServerFunctionCall(_event: ServerFunctionCall): void {}
