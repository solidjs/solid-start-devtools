import type { CallEvent, CallLive, CallRequestEvent } from '@solidjs/web';

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

function metaOf(event: { name?: string }): ServerFunctionRequest['meta'] {
  return event.name !== undefined ? { name: event.name } : undefined;
}

/**
 * The panel's request event for one `"request"` record
 * (`OBSERVE.records.subscribe("request", …, { bodies: true })`) — the
 * request was handed to `fetch`, so the call shows up now, ahead of its
 * answer. `instance` is the caller's per-call key (the function id repeats
 * across calls). Nothing when `live.request` is absent: the runtime could
 * not reconstruct what it sent, so there is no request to show.
 */
export function requestRecordToEvent(
  event: CallRequestEvent,
  live: CallLive,
  instance: string,
): ServerFunctionRequest | undefined {
  if (!live.request) return undefined;
  return {
    type: 'request',
    id: event.id,
    instance,
    source: live.request,
    meta: metaOf(event),
    time: event.at,
  };
}

/**
 * The panel's events that complete a call whose request event is already
 * shown (`requestRecordToEvent`), from its settled `"call"` record: the
 * response event when a response arrived; otherwise (the fetch itself
 * rejected) the request event again, now carrying the thrown value as
 * `meta.error`, so the row it replaces reads as failed rather than pending.
 */
export function settleRecordToEvents(
  event: CallEvent,
  live: CallLive,
  instance: string,
): ServerFunctionCall[] {
  if (!live.request) return [];
  const meta = metaOf(event);
  if (live.response) {
    return [
      {
        type: 'response',
        id: event.id,
        instance,
        source: live.response,
        meta,
        time: event.at + event.durationMs,
      },
    ];
  }
  return [
    {
      type: 'request',
      id: event.id,
      instance,
      source: live.request,
      meta: { ...meta, error: live.error },
      time: event.at,
    },
  ];
}

/**
 * The panel's events for one settled `"call"` record whose `"request"` was
 * never seen — the listener joined mid-call, or the runtime sent nothing
 * (the record arrives without `live.request` then, and this returns
 * nothing). The request event, then the response event when a response
 * arrived; without one (the fetch itself rejected) only the request event,
 * carrying the thrown value as `meta.error`.
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
