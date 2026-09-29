import type { CallEvent, CallLive } from '@solidjs/web';

export type ServerFunctionRequest = {
  type: 'request';
  id: string;
  instance: string;
  source: Request;
  meta?: { readonly name?: string; readonly [key: string]: unknown };
  time: number;
};
export type ServerFunctionResponse = {
  type: 'response';
  id: string;
  instance: string;
  source: Response;
  meta?: { readonly name?: string; readonly [key: string]: unknown };
  time: number;
};

export type ServerFunctionCall = ServerFunctionRequest | ServerFunctionResponse;

export type ServerFunctionCallListener = (event: ServerFunctionCall) => void;

const LISTENERS = new Set<ServerFunctionCallListener>();

export function captureServerFunctionCall(listener: ServerFunctionCallListener): () => void {
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}

export function pushServerFunctionCall(event: ServerFunctionCall): void {
  for (const listener of new Set(LISTENERS)) {
    listener(event);
  }
}

/**
 * The panel's events for one settled `"call"` record
 * (`OBSERVE.records.subscribe("call", …, { bodies: true })`): the request
 * event, then the response event when a response arrived. The record is
 * delivered once, at settle, so both land together; `instance` is the
 * caller's per-call key (the function id repeats across calls).
 *
 * Nothing when `live.request` is absent: the call failed before a request
 * was built (argument serialization threw), or the runtime could not
 * reconstruct what it sent — either way there is no request to show.
 * Without a response (the fetch itself rejected) only the request event is
 * pushed, carrying the thrown value as `meta.error` so the panel can say
 * why nothing came back.
 */
export function callRecordToEvents(
  event: CallEvent,
  live: CallLive,
  instance: string,
): ServerFunctionCall[] {
  if (!live.request) return [];
  let meta: ServerFunctionRequest['meta'];
  if (event.name !== undefined) meta = { name: event.name };
  if (event.outcome === 'error' && !live.response) meta = { ...meta, error: live.error };
  const events: ServerFunctionCall[] = [
    {
      type: 'request',
      id: event.id,
      instance,
      source: live.request,
      meta,
      time: event.at,
    },
  ];
  if (live.response) {
    events.push({
      type: 'response',
      id: event.id,
      instance,
      source: live.response,
      meta,
      time: event.at + event.durationMs,
    });
  }
  return events;
}
