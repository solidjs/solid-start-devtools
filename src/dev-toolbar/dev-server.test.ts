import { describe, expect, it } from 'vitest';
import {
  DEVTOOLS_HELLO_EVENT,
  DEVTOOLS_INFO_EVENT,
  DEVTOOLS_SERVER_ERROR_EVENT,
  type DevServerChannel,
  type DevServerInfo,
  type ServerErrorMessage,
} from '../protocol.js';
import { createDevServerConnection, serverErrorPlace, serverErrorValue } from './dev-server.js';

function fakeChannel() {
  const handlers = new Map<string, (data: any) => void>();
  const sent: { event: string; data: unknown }[] = [];
  const channel: DevServerChannel = {
    on(event, listener) {
      handlers.set(event, listener);
    },
    send(event, data) {
      sent.push({ event, data });
    },
  };
  function emit(event: string, data: unknown): void {
    handlers.get(event)?.(data);
  }
  return { channel, sent, emit };
}

function serverError(over: Partial<ServerErrorMessage> = {}): ServerErrorMessage {
  return {
    id: 1,
    at: 1000,
    name: 'Error',
    message: 'boom',
    stack: 'Error: boom\n    at load (/app/src/api.ts:3:9)',
    kind: 'render',
    handling: 'failed',
    ...over,
  };
}

function info(errors: ServerErrorMessage[] = []): DevServerInfo {
  return { base: '/', versions: { 'solid-js': '2.0.0' }, errors };
}

describe('createDevServerConnection', () => {
  it('says hello with the time the page started loading', () => {
    const connection = createDevServerConnection();
    const { channel, sent } = fakeChannel();
    connection.connect(channel, 500);
    connection.connect(channel, 600);

    expect(sent).toEqual([{ event: DEVTOOLS_HELLO_EVENT, data: { since: 500 } }]);
  });

  it('hands a late listener the info and the errors that came before it', () => {
    const connection = createDevServerConnection();
    const { channel, emit } = fakeChannel();
    connection.connect(channel, 0);
    emit(DEVTOOLS_INFO_EVENT, info([serverError()]));
    emit(DEVTOOLS_SERVER_ERROR_EVENT, serverError({ id: 2 }));

    const infos: DevServerInfo[] = [];
    const ids: number[] = [];
    connection.listen({
      onInfo: (value) => infos.push(value),
      onServerError: (message) => ids.push(message.id),
    });

    expect(infos).toHaveLength(1);
    expect(connection.info()?.versions['solid-js']).toBe('2.0.0');
    expect(ids).toEqual([1, 2]);
  });

  it('drops an error it already has', () => {
    const connection = createDevServerConnection();
    const { channel, emit } = fakeChannel();
    connection.connect(channel, 0);
    const ids: number[] = [];
    connection.listen({ onServerError: (message) => ids.push(message.id) });

    emit(DEVTOOLS_SERVER_ERROR_EVENT, serverError());
    emit(DEVTOOLS_INFO_EVENT, info([serverError()]));

    expect(ids).toEqual([1]);
  });

  it('stops calling a listener that was removed', () => {
    const connection = createDevServerConnection();
    const { channel, emit } = fakeChannel();
    connection.connect(channel, 0);
    const ids: number[] = [];
    const stop = connection.listen({ onServerError: (message) => ids.push(message.id) });
    stop();
    emit(DEVTOOLS_SERVER_ERROR_EVENT, serverError());

    expect(ids).toEqual([]);
  });
});

describe('serverErrorValue', () => {
  it('keeps the name, message and stack the server sent', () => {
    const error = serverErrorValue(serverError({ name: 'TypeError' }));
    expect(error.name).toBe('TypeError');
    expect(error.message).toBe('boom');
    expect(error.stack).toContain('/app/src/api.ts:3:9');
  });
});

describe('serverErrorPlace', () => {
  it('names the server function that threw', () => {
    expect(serverErrorPlace(serverError({ kind: 'server-function', functionId: 'abc' }))).toBe(
      'Server function abc',
    );
    expect(serverErrorPlace(serverError({ kind: 'request' }))).toBe('Server request');
  });
});
