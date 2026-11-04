import { OBSERVE } from 'solid-js';
import type { ChangeOrigin } from 'solid-js/attribution';
import type { ServerErrorMessage } from '../protocol.js';
import { serverErrorValue } from './dev-server.js';

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
