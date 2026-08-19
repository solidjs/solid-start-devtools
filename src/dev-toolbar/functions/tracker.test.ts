import { describe, expect, it } from 'vitest';
import { captureServerFunctionCall, pushServerFunctionCall } from './tracker.js';

describe('server-function tracker', () => {
  it('notifies active listeners', () => {
    const calls: string[] = [];
    const stop = captureServerFunctionCall((call) => calls.push(call.instance));

    pushServerFunctionCall({
      type: 'request',
      id: 'get-user',
      instance: 'get-user-1',
      source: new Request('https://example.com/_server'),
      time: 1,
    });
    stop();
    pushServerFunctionCall({
      type: 'request',
      id: 'get-user',
      instance: 'get-user-2',
      source: new Request('https://example.com/_server'),
      time: 2,
    });

    expect(calls).toEqual(['get-user-1']);
  });
});
