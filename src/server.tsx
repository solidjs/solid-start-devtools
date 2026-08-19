import { pushServerFunctionCall } from './dev-toolbar/functions/tracker.js';
import { DevToolbar } from './dev-toolbar/index.js';

export { DevToolbar, pushServerFunctionCall };

export function mountDevToolbar(): () => void {
  return () => {};
}
