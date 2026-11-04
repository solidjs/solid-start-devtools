import type { DevServerChannel } from './protocol.js';
import {
  pushServerFunctionCall,
  type ServerFunctionCall,
} from './dev-toolbar/functions/tracker.js';
import { DevToolbar, type DevToolbarProps } from './dev-toolbar/index.js';

export { DevToolbar, type DevToolbarProps, pushServerFunctionCall, type ServerFunctionCall };

/** The dev server channel reaches the toolbar in the browser only. */
export function connectDevServer(_channel: DevServerChannel): void {}

export function mountDevToolbar(): () => void {
  return () => {};
}
