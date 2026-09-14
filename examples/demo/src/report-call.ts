import { pushServerFunctionCall } from '@solidjs/start-devtools';
import { isServer } from '@solidjs/web';

let counter = 0;

/**
 * Reports a server function call to the toolbar so the demo's server function
 * panel has something to show.
 *
 * `@solidjs/web` 2.0.0-rc.0 does not report calls to the toolbar on its own
 * yet. `pushServerFunctionCall` is the same public API an integration would
 * use to feed the panel.
 */
export async function reportCall<T>(
  name: string,
  args: unknown,
  run: () => Promise<T>,
): Promise<T> {
  if (isServer) return run();

  const instance = `${name}-${++counter}`;
  const json = { 'Content-Type': 'application/json' };

  pushServerFunctionCall({
    type: 'request',
    id: name,
    instance,
    time: performance.now(),
    meta: { name },
    source: new Request('/_server', {
      method: 'POST',
      headers: json,
      body: JSON.stringify(args),
    }),
  });

  try {
    const result = await run();
    pushServerFunctionCall({
      type: 'response',
      id: name,
      instance,
      time: performance.now(),
      meta: { name },
      source: new Response(JSON.stringify(result), { status: 200, headers: json }),
    });
    return result;
  } catch (error) {
    pushServerFunctionCall({
      type: 'response',
      id: name,
      instance,
      time: performance.now(),
      meta: { name },
      source: new Response(JSON.stringify({ message: String(error) }), {
        status: 500,
        headers: json,
      }),
    });
    throw error;
  }
}
