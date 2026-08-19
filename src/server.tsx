import {
  pushServerFunctionCall,
  type ServerFunctionCall,
} from './dev-toolbar/functions/tracker.js';
import { DevToolbar, type DevToolbarProps } from './dev-toolbar/index.js';

export { DevToolbar, type DevToolbarProps, pushServerFunctionCall, type ServerFunctionCall };

export function mountDevToolbar(): () => void {
  return () => {};
}
