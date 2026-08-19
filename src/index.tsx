import { render } from '@solidjs/web';
import * as serverFunctions from '@solidjs/web/server-functions';
import {
  pushServerFunctionCall,
  type ServerFunctionCall,
} from './dev-toolbar/functions/tracker.js';
import { DevToolbar, type DevToolbarProps } from './dev-toolbar/index.js';

let dispose: (() => void) | undefined;
let frame: number | undefined;

export { DevToolbar, type DevToolbarProps, pushServerFunctionCall, type ServerFunctionCall };

const observe = Reflect.get(serverFunctions, 'observeServerFunctionCalls');
if (typeof observe === 'function') observe(pushServerFunctionCall);

export function mountDevToolbar(): () => void {
  if (dispose) return dispose;

  let unmount: (() => void) | undefined;
  let host: HTMLDivElement | undefined;

  dispose = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    unmount?.();
    host?.remove();
    frame = undefined;
    dispose = undefined;
  };

  frame = requestAnimationFrame(() => {
    frame = undefined;
    if (document.querySelector('[data-solid-dev-toolbar]')) return;
    host = document.createElement('div');
    host.dataset.solidDevToolbarRoot = '';
    document.body.append(host);
    unmount = render(() => <DevToolbar />, host);
  });

  return dispose;
}
