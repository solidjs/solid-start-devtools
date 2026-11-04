/**
 * What the dev server and the toolbar send each other.
 *
 * `@solidjs/vite-plugin` serves the dev server side. It imports these types
 * and declares each constant with the type of the one here, so a change on
 * either side fails the other's compile instead of dropping messages.
 */

/**
 * Opens a file in the editor: `GET /__solid/devtools/open-in-editor?file=src/App.tsx:12:5`.
 * The dev server resolves the path against its root, so the toolbar does not
 * need to know where the root is. Like Vite's own `/__open-in-editor`, the
 * path does not take the Vite `base`.
 */
export const OPEN_IN_EDITOR_PATH = '/__solid/devtools/open-in-editor';

/** Toolbar to server, once it connects. The payload is a `DevServerHello`. */
export const DEVTOOLS_HELLO_EVENT = 'solid:devtools:hello';

/** Server to toolbar, the answer to the hello. The payload is a `DevServerInfo`. */
export const DEVTOOLS_INFO_EVENT = 'solid:devtools:info';

/** Server to toolbar, each server error after the hello. The payload is a `ServerErrorMessage`. */
export const DEVTOOLS_SERVER_ERROR_EVENT = 'solid:devtools:server-error';

export interface DevServerHello {
  /**
   * When the page started loading, in milliseconds since the epoch
   * (`performance.timeOrigin`). The server answers with the errors it kept
   * from then on, so the errors of the render that served this page are
   * included and those of earlier pages are not.
   */
  since: number;
}

/** Package versions the dev server resolved from the app root. A package it could not find is left out. */
export interface DevServerVersions {
  'solid-js'?: string;
  '@solidjs/web'?: string;
  '@solidjs/vite-plugin'?: string;
  vite?: string;
}

export interface DevServerInfo {
  versions: DevServerVersions;
  /** The server errors kept since the hello's `since`, oldest first. */
  errors: ServerErrorMessage[];
}

/** A failure the server runtime reported, as `configureServerErrors` hears it. */
export interface ServerErrorMessage {
  /** Unique for the life of the dev server, so a toolbar can drop one it already has. */
  id: number;
  /** When the server heard it, in milliseconds since the epoch. */
  at: number;
  name: string;
  message: string;
  /** Mapped to the source files by the dev server's module runner. */
  stack?: string;
  kind: 'render' | 'server-function' | 'request';
  /** How the runtime handled it, such as `fallback` or `failed`. */
  handling: string;
  /** The server function that threw, for `kind: 'server-function'`. */
  functionId?: string;
  /** The component labels from the root to where the error was thrown. */
  ownerPath?: string[];
  /** The method and URL of the request the failure happened in. */
  method?: string;
  url?: string;
}

/**
 * The part of Vite's `import.meta.hot` the toolbar uses. The plugin passes
 * `import.meta.hot` from a module Vite serves, since a pre-bundled package
 * has none of its own.
 */
export interface DevServerChannel {
  on(event: string, listener: (data: any) => void): void;
  send(event: string, data?: unknown): void;
}
