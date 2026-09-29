import { render } from '@solidjs/web';
import { OBSERVE } from 'solid-js';
import {
  callRecordToEvents,
  pushServerFunctionCall,
  type ServerFunctionCall,
} from './dev-toolbar/functions/tracker.js';
import { DevToolbar, type DevToolbarProps } from './dev-toolbar/index.js';

let dispose: (() => void) | undefined;
let frame: number | undefined;

export { DevToolbar, type DevToolbarProps, pushServerFunctionCall, type ServerFunctionCall };

// The server-function panel is fed by the runtime's `"call"` record: one
// per server-function call made from this page, delivered when the caller's
// await settles, with the request as sent and the response as it arrived
// beside it (`bodies: true` — without it the runtime clones nothing and
// there would be no body to show). `OBSERVE` exists in development builds
// only, which is the only place this module is loaded.
let calls = 0;
OBSERVE?.records.subscribe(
  'call',
  (event, live) => {
    for (const call of callRecordToEvents(event, live, `${event.id}#${++calls}`)) {
      pushServerFunctionCall(call);
    }
  },
  { bodies: true },
);

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
