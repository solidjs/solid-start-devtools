# Start Devtools

Development error and server-function tooling for Solid Start mode.

`@solidjs/start-devtools` provides the toolbar used by the Solid Vite plugin in development.

- Runtime error inspection with source-mapped stack frames.
- Server-function request and response inspection.
- A reactivity graph of the live signals, memos and effects in the app.

```sh
pnpm add @solidjs/start-devtools@next
```

The Vite plugin mounts it automatically. Integrations can use the package directly:

```tsx
import { DevToolbar } from '@solidjs/start-devtools';

<DevToolbar>
  <App />
</DevToolbar>;
```

For custom server and client entries, render `DevToolbar` around the app in a shared
document or root component. In development, the package selects the browser or SSR build
for the current environment. In production, it becomes a children-only passthrough and
does not include the toolbar.

The same import is safe in development and production entries.

## Reactivity graph

The graph panel maps the running reactive graph. Signals, memos and effects are nodes,
and an edge points from a source to the computation that reads it. Hover a node for its
value, state and edge counts. Select one to dim the rest of the graph and list what it
reads and what reads it.

The panel reads the graph through the development hooks in `solid-js`, so it is empty in a
production build of the runtime. It only watches while it is open.

For component tree inspection, see [Solid Devtools](https://github.com/thetarnav/solid-devtools).
