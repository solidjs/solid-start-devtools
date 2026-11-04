import {
  DEVTOOLS_HELLO_EVENT,
  DEVTOOLS_INFO_EVENT,
  DEVTOOLS_SERVER_ERROR_EVENT,
  type DevServerChannel,
  type DevServerHello,
  type DevServerInfo,
  type ServerErrorMessage,
} from '../protocol.js';
import { MAX_ERRORS } from './error-list.js';

export interface DevServerListener {
  onInfo?(info: DevServerInfo): void;
  onServerError?(message: ServerErrorMessage): void;
}

export interface DevServerConnection {
  /** Sends the hello and starts listening to the channel. Later calls do nothing. */
  connect(channel: DevServerChannel, since: number): void;
  /** The info the server answered with, once it has. */
  info(): DevServerInfo | undefined;
  /**
   * Adds a listener. It hears the info and the errors that arrived before it
   * was added, then the ones after. The returned function removes it.
   */
  listen(listener: DevServerListener): () => void;
}

/**
 * The toolbar's side of the dev server channel.
 *
 * The plugin connects before the toolbar renders, so the info and the first
 * errors can arrive before any panel listens. The connection keeps them and
 * hands them to each listener that joins later.
 */
export function createDevServerConnection(): DevServerConnection {
  const listeners = new Set<DevServerListener>();
  const seen = new Set<number>();
  const errors: ServerErrorMessage[] = [];
  let info: DevServerInfo | undefined;
  let connected = false;

  function receiveError(message: ServerErrorMessage): void {
    // The info's errors and a live event can carry the same error.
    if (seen.has(message.id)) return;
    seen.add(message.id);
    errors.push(message);
    if (errors.length > MAX_ERRORS) seen.delete(errors.shift()!.id);
    for (const listener of listeners) listener.onServerError?.(message);
  }

  return {
    connect(channel, since) {
      if (connected) return;
      connected = true;
      channel.on(DEVTOOLS_INFO_EVENT, (data: DevServerInfo) => {
        info = data;
        for (const listener of listeners) listener.onInfo?.(data);
        for (const message of data.errors) receiveError(message);
      });
      channel.on(DEVTOOLS_SERVER_ERROR_EVENT, receiveError);
      const hello: DevServerHello = { since };
      channel.send(DEVTOOLS_HELLO_EVENT, hello);
    },
    info: () => info,
    listen(listener) {
      listeners.add(listener);
      if (info) listener.onInfo?.(info);
      for (const message of errors) listener.onServerError?.(message);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const shared = createDevServerConnection();

/**
 * Connects the toolbar to the dev server. `@solidjs/vite-plugin` calls this
 * with `import.meta.hot` from the client entry it generates.
 */
export function connectDevServer(channel: DevServerChannel): void {
  shared.connect(channel, performance.timeOrigin);
}

export function listenToDevServer(listener: DevServerListener): () => void {
  return shared.listen(listener);
}

export function devServerInfo(): DevServerInfo | undefined {
  return shared.info();
}

/** A server error as an `Error`, so the error panel shows it like one thrown in the page. */
export function serverErrorValue(message: ServerErrorMessage): Error {
  const error = new Error(message.message);
  error.name = message.name;
  error.stack = message.stack ?? `${message.name}: ${message.message}`;
  return error;
}

/** Where on the server the error happened, for the subtitle of its row. */
export function serverErrorPlace(message: ServerErrorMessage): string {
  if (message.kind === 'server-function') {
    return message.functionId ? `Server function ${message.functionId}` : 'Server function';
  }
  if (message.kind === 'render') return 'Server render';
  return 'Server request';
}
