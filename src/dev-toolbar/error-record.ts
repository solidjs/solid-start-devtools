import { OBSERVE } from 'solid-js';
import type { ChangeOrigin } from 'solid-js/attribution';
import type { ServerErrorMessage } from '../protocol.js';
import { isServerErrorValue, serverErrorValue } from './dev-server.js';
import { addError } from './error-list.js';
import { describeError } from './health/describe-error.js';

/** A thrown value the toolbar caught, with when and during what. */
export interface ErrorRecord {
  error: unknown;
  /** When it was caught, on the `performance.now()` clock the timeline uses. */
  at: number;
  /**
   * The interaction or frame running when it was caught. It is the same
   * object a timeline entry keeps as its `origin`, so the two join by identity.
   */
  origin: ChangeOrigin | undefined;
  /** Set when the dev server sent the error, which the page never threw. */
  server?: ServerErrorMessage;
}

export function createErrorRecord(error: unknown): ErrorRecord {
  let origin: ChangeOrigin | undefined;
  try {
    // Only an observe or dev build of the runtime with attribution on knows it.
    origin = OBSERVE?.attribution?.currentOrigin?.() as ChangeOrigin | undefined;
  } catch {
    origin = undefined;
  }
  return { error, at: performance.now(), origin };
}

/** The record of an error the dev server sent. */
export function createServerErrorRecord(message: ServerErrorMessage): ErrorRecord {
  // The server stamps the epoch clock. Move it to the page's clock, so a server
  // error sorts and ages like the errors the page caught.
  const at = message.at - performance.timeOrigin;
  return { error: serverErrorValue(message), at, origin: undefined, server: message };
}

/**
 * Whether one record is the page's copy of a server render error the other
 * holds. An `<Errored>` that renders its fallback on the server sends the
 * error with the page, so hydration throws it again in the page.
 */
function isSameRenderError(server: ErrorRecord, page: ErrorRecord): boolean {
  if (!server.server || server.server.kind !== 'render' || page.server) return false;
  // A server record the page already merged into holds the page's error, and takes no other.
  if (!isServerErrorValue(server.error)) return false;
  const a = describeError(server.error);
  const b = describeError(page.error);
  return a.name === b.name && a.message === b.message;
}

/** Adds an error the page caught, merged into the server's record of it when there is one. */
export function addPageError(list: readonly ErrorRecord[], record: ErrorRecord): ErrorRecord[] {
  for (let index = 0; index < list.length; index++) {
    const current = list[index]!;
    if (!isSameRenderError(current, record)) continue;
    // The page's error keeps its place in the timeline, and the server's facts.
    const next = [...list];
    next[index] = { ...record, server: current.server };
    return next;
  }
  return addError(list, record);
}

/** Adds an error the dev server sent, merged into the page's copy of it when there is one. */
export function addServerError(list: readonly ErrorRecord[], record: ErrorRecord): ErrorRecord[] {
  for (let index = 0; index < list.length; index++) {
    const current = list[index]!;
    if (!isSameRenderError(record, current)) continue;
    const next = [...list];
    next[index] = { ...current, server: record.server };
    return next;
  }
  return addError(list, record);
}
