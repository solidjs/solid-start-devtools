# Start Devtools

Development error and server-function tooling for Solid Start mode.

`@solidjs/start-devtools` provides the toolbar used by the Solid Vite plugin in development. It includes runtime error inspection, source-mapped stack frames, and server-function request and response inspection.

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

For component and reactivity inspection, see [Solid Devtools](https://github.com/thetarnav/solid-devtools).
