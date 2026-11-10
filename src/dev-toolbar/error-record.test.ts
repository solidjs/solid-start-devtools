import { describe, expect, it } from 'vitest';
import type { ServerErrorMessage } from '../protocol.js';
import {
  addPageError,
  addServerError,
  createServerErrorRecord,
  type ErrorRecord,
} from './error-record.js';

function serverMessage(over: Partial<ServerErrorMessage> = {}): ServerErrorMessage {
  return {
    id: 1,
    at: performance.timeOrigin,
    name: 'Error',
    message: 'boom',
    kind: 'render',
    handling: 'fallback',
    ...over,
  };
}

function pageRecord(message = 'boom'): ErrorRecord {
  return { error: new Error(message), at: 10, origin: undefined };
}

describe('render errors the page throws again', () => {
  it('merges the server copy into the error the page caught first', () => {
    const page = pageRecord();
    const list = addServerError([page], createServerErrorRecord(serverMessage()));

    expect(list).toHaveLength(1);
    expect(list[0]!.error).toBe(page.error);
    expect(list[0]!.server?.handling).toBe('fallback');
  });

  it('merges the page error into the server copy that came first', () => {
    const page = pageRecord();
    const list = addPageError([createServerErrorRecord(serverMessage())], page);

    expect(list).toHaveLength(1);
    expect(list[0]!.error).toBe(page.error);
    expect(list[0]!.server?.id).toBe(1);
  });

  it('keeps errors with another message, or from a server function, apart', () => {
    expect(
      addServerError([pageRecord('other')], createServerErrorRecord(serverMessage())),
    ).toHaveLength(2);
    expect(
      addPageError(
        [createServerErrorRecord(serverMessage({ kind: 'server-function' }))],
        pageRecord(),
      ),
    ).toHaveLength(2);
  });

  it('merges one page error into one server copy only', () => {
    let list = addServerError([], createServerErrorRecord(serverMessage()));
    list = addPageError(list, pageRecord());
    list = addPageError(list, pageRecord());

    expect(list).toHaveLength(2);
  });
});
