# Start Devtools

Development error and server-function tooling for Solid Start mode.

`@solidjs/start-devtools` provides the toolbar used by the Solid Vite plugin in development.

- Runtime error inspection with source-mapped stack frames.
- Server-function request and response inspection.
- An ownership tree of the components and scopes the app created.

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

## Ownership tree

The ownership panel shows the app as a tree of owners.

Component mode lists components only. The scopes between them are folded into the component
above, so a component shows every signal, memo and effect created inside it. Owner mode
shows every owner instead, including roots, memos and effects.

Selecting a row lists its prop names, the signals it holds with their values, the scopes
folded into it and its children. Prop values are getters, so the panel lists their names
and never reads them.

The panel reads the tree through the development hooks in `solid-js`, so it is empty in a
production build of the runtime. It only watches while it is open.

For reactivity inspection, see [Solid Devtools](https://github.com/thetarnav/solid-devtools).
