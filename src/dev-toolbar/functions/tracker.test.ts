import type { CallEvent, CallLive, CallRequestEvent } from '@solidjs/web';
import { describe, expect, it } from 'vitest';
import { connectCallRecords, type CallRecordsChannel } from './records.js';
import {
  callRecordToEvents,
  captureServerFunctionCall,
  pushServerFunctionCall,
  requestRecordToEvent,
  settleRecordToEvents,
  type ServerFunctionCall,
} from './tracker.js';

function liveOf(overrides: Partial<CallLive> = {}): CallLive {
  return {
    args: [1],
    request: new Request('https://example.com/_server/data/get-user', {
      method: 'POST',
      body: '[1]',
    }),
    ...overrides,
  };
}

function requestEvent(overrides: Partial<CallRequestEvent> = {}): CallRequestEvent {
  return { side: 'client', id: 'get-user', at: 110, method: 'POST', ...overrides };
}

function callEvent(overrides: Partial<CallEvent> = {}): CallEvent {
  return {
    id: 'get-user',
    at: 100,
    durationMs: 25,
    method: 'POST',
    outcome: 'ok',
    status: 200,
    ...overrides,
  };
}

describe('requestRecordToEvent', () => {
  it('shows the call as its request is handed to fetch', () => {
    const live = liveOf();
    const shown = requestRecordToEvent(requestEvent({ name: 'getUser' }), live, 'get-user#1');
    expect(shown).toMatchObject({
      type: 'request',
      id: 'get-user',
      instance: 'get-user#1',
      time: 110,
      meta: { name: 'getUser' },
    });
    expect(shown!.source).toBe(live.request);
    expect(requestRecordToEvent(requestEvent(), live, 'x')!.meta).toBeUndefined();
  });

  it('shows nothing when the runtime could not reconstruct the request', () => {
    expect(requestRecordToEvent(requestEvent(), liveOf({ request: undefined }), 'x')).toBe(
      undefined,
    );
  });
});

describe('settleRecordToEvents', () => {
  it('completes a shown call with its response', () => {
    const live = liveOf({ response: new Response('{"n":1}'), result: { n: 1 } });
    const events = settleRecordToEvents(callEvent({ name: 'getUser' }), live, 'get-user#1');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'response',
      instance: 'get-user#1',
      time: 125,
      meta: { name: 'getUser' },
    });
    expect(events[0]!.source).toBe(live.response);
  });

  it('re-shows the request as failed when the fetch itself rejected', () => {
    const offline = new TypeError('network down');
    const live = liveOf({ error: offline });
    const events = settleRecordToEvents(
      callEvent({ name: 'getUser', outcome: 'error', status: undefined }),
      live,
      'get-user#1',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'request',
      instance: 'get-user#1',
      meta: { name: 'getUser', error: offline },
    });
    expect(events[0]!.source).toBe(live.request);
  });
});

describe('connectCallRecords', () => {
  type Listeners = {
    request?: (event: CallRequestEvent, live: CallLive) => void;
    call?: (event: CallEvent, live: CallLive) => void;
  };

  function channel() {
    const listeners: Listeners = {};
    const options: Record<string, { bodies?: boolean } | undefined> = {};
    const pushed: ServerFunctionCall[] = [];
    const records = {
      subscribe(type: 'request' | 'call', listener: any, opts?: { bodies?: boolean }) {
        (listeners as any)[type] = listener;
        options[type] = opts;
        return () => {
          delete (listeners as any)[type];
        };
      },
    } as CallRecordsChannel;
    const off = connectCallRecords(records, (event) => pushed.push(event));
    return { listeners, options, pushed, off };
  }

  it('asks both records for their bodies', () => {
    const { options } = channel();
    expect(options.request).toEqual({ bodies: true });
    expect(options.call).toEqual({ bodies: true });
  });

  it('shows a call at its request and completes it at settle, joined by the live object', () => {
    const { listeners, pushed } = channel();
    const live = liveOf();
    listeners.request!(requestEvent(), live);
    expect(pushed.map((e) => e.type)).toEqual(['request']);
    live.response = new Response('1');
    live.result = 1;
    listeners.call!(callEvent(), live);
    expect(pushed.map((e) => e.type)).toEqual(['request', 'response']);
    expect(pushed[0]!.instance).toBe(pushed[1]!.instance);
  });

  it('marks a shown call failed when its fetch rejected', () => {
    const { listeners, pushed } = channel();
    const live = liveOf();
    listeners.request!(requestEvent(), live);
    live.error = new TypeError('network down');
    listeners.call!(callEvent({ outcome: 'error', status: undefined }), live);
    expect(pushed.map((e) => e.type)).toEqual(['request', 'request']);
    expect(pushed[1]!.instance).toBe(pushed[0]!.instance);
    expect(pushed[1]!.meta).toEqual({ error: live.error });
  });

  it('shows a call whole from its settle when the request was never seen', () => {
    const { listeners, pushed } = channel();
    const live = liveOf({ response: new Response('1'), result: 1 });
    listeners.call!(callEvent(), live);
    expect(pushed.map((e) => e.type)).toEqual(['request', 'response']);
    expect(pushed[0]!.instance).toBe(pushed[1]!.instance);
  });

  it('gives every call its own instance and forgets it once settled', () => {
    const { listeners, pushed } = channel();
    const a = liveOf();
    const b = liveOf();
    listeners.request!(requestEvent(), a);
    listeners.request!(requestEvent(), b);
    expect(pushed[0]!.instance).not.toBe(pushed[1]!.instance);
    a.response = new Response('1');
    listeners.call!(callEvent(), a);
    expect(pushed[2]!.instance).toBe(pushed[0]!.instance);
    // Settling the same live again is a call the panel never saw: shown whole.
    listeners.call!(callEvent(), a);
    expect(pushed.slice(3).map((e) => e.type)).toEqual(['request', 'response']);
    expect(pushed[3]!.instance).not.toBe(pushed[0]!.instance);
  });

  it('unsubscribes both records', () => {
    const { listeners, off } = channel();
    off();
    expect(listeners.request).toBeUndefined();
    expect(listeners.call).toBeUndefined();
  });
});

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
