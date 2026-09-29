import type { CallEvent, CallLive } from '@solidjs/web';
import { describe, expect, it } from 'vitest';
import {
  callRecordToEvents,
  captureServerFunctionCall,
  pushServerFunctionCall,
} from './tracker.js';

function call(event: Partial<CallEvent> = {}, live: Partial<CallLive> = {}) {
  const request = new Request('https://example.com/_server/data/get-user', {
    method: 'POST',
    body: '[1]',
  });
  return callRecordToEvents(
    {
      id: 'get-user',
      at: 100,
      durationMs: 25,
      method: 'POST',
      outcome: 'ok',
      status: 200,
      ...event,
    },
    { args: [1], request, response: new Response('{"n":1}'), result: { n: 1 }, ...live },
    'get-user#1',
  );
}

describe('callRecordToEvents', () => {
  it('maps a settled call to a request event then a response event', () => {
    const events = call();
    expect(events.map((e) => e.type)).toEqual(['request', 'response']);
    const [request, response] = events;
    expect(request).toMatchObject({ id: 'get-user', instance: 'get-user#1', time: 100 });
    expect(request!.source).toBeInstanceOf(Request);
    expect(response).toMatchObject({ id: 'get-user', instance: 'get-user#1', time: 125 });
    expect(response!.source).toBeInstanceOf(Response);
    expect(request!.meta).toBeUndefined();
  });

  it('carries the source name as meta.name when the record has one', () => {
    const [request, response] = call({ name: 'getUser' });
    expect(request!.meta).toEqual({ name: 'getUser' });
    expect(response!.meta).toEqual({ name: 'getUser' });
  });

  it('keeps the response event when the server answered with an error', () => {
    const boom = new Error('nope');
    const events = call({ outcome: 'error', status: 500 }, { result: undefined, error: boom });
    expect(events.map((e) => e.type)).toEqual(['request', 'response']);
    expect(events[0]!.meta).toBeUndefined();
  });

  it('pushes only the request, with the failure beside it, when the fetch itself rejected', () => {
    const offline = new TypeError('network down');
    const events = call(
      { outcome: 'error', status: undefined },
      { response: undefined, result: undefined, error: offline },
    );
    expect(events.map((e) => e.type)).toEqual(['request']);
    expect(events[0]!.meta).toEqual({ error: offline });
  });

  it('maps a deferred (streaming) result like any other settled call', () => {
    const events = call({ deferred: true });
    expect(events.map((e) => e.type)).toEqual(['request', 'response']);
  });

  it('produces nothing when no request was built', () => {
    expect(call({ outcome: 'error' }, { request: undefined, response: undefined })).toEqual([]);
  });
});

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
