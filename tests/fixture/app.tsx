import { render } from '@solidjs/web';
import { DevToolbar, mountDevToolbar, pushServerFunctionCall } from '@solidjs/start-devtools';
import { createSignal, Show } from 'solid-js';

function Broken(): never {
  throw new Error('client boom');
}

const serverFunctionInstance = 'load-user-1';
let responseStatus = 201;

function emitServerFunctionRequest() {
  pushServerFunctionCall({
    type: 'request',
    id: 'load-user',
    instance: serverFunctionInstance,
    source: new Request('/_server', { method: 'POST', body: '{}' }),
    meta: { name: 'loadUser' },
    time: 10,
  });
}

function emitServerFunctionResponse() {
  pushServerFunctionCall({
    type: 'response',
    id: 'load-user',
    instance: serverFunctionInstance,
    source: new Response('{}', { status: responseStatus }),
    meta: { name: 'loadUser' },
    time: 20,
  });
  responseStatus = 500;
}

function App() {
  const [broken, setBroken] = createSignal(false);

  return (
    <main>
      <p id="fixture-content">app content</p>
      <button id="emit-server-function-request" onClick={emitServerFunctionRequest}>
        emit server function request
      </button>
      <button id="emit-server-function-response" onClick={emitServerFunctionResponse}>
        emit server function response
      </button>
      <button id="throw-client-error" onClick={() => setBroken(true)}>
        throw client error
      </button>
      <Show when={broken()}>
        <Broken />
      </Show>
    </main>
  );
}

if (new URLSearchParams(location.search).has('mount')) {
  const first = mountDevToolbar();
  const second = mountDevToolbar();
  Object.assign(window, {
    __disposeToolbar: first,
    __sameDispose: first === second,
  });
} else {
  render(
    () => (
      <DevToolbar>
        <App />
      </DevToolbar>
    ),
    document.getElementById('app')!,
  );
}
