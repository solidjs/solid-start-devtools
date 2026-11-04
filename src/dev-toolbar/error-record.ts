import { OBSERVE } from 'solid-js';
import type { ChangeOrigin } from 'solid-js/attribution';

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
