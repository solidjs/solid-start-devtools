# Start Devtools

Development error and server-function tooling for Solid Start mode.

`@solidjs/start-devtools` provides the toolbar used by the Solid Vite plugin in development. It includes runtime error inspection, source-mapped stack frames, and server-function request and response inspection.

```sh
pnpm add @solidjs/start-devtools
```

The Vite plugin mounts it automatically. Integrations can use the package directly:

```tsx
import { DevToolbar } from "@solidjs/start-devtools";

<DevToolbar>
  <App />
</DevToolbar>;
```

The package is intended for development and should not be imported into production entries.

For component and reactivity inspection, see [Solid Devtools](https://github.com/thetarnav/solid-devtools).
