import { render } from '@solidjs/web';
import { pushServerFunctionCall } from './dev-toolbar/functions/tracker.js';
import { DevToolbar } from './dev-toolbar/index.js';

let dispose: (() => void) | undefined;
let frame: number | undefined;

export { DevToolbar, pushServerFunctionCall };

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
