# Start Devtools

Development error and server-function tooling for Solid Start mode.

`@solidjs/start-devtools` provides the toolbar used by the Solid Vite plugin in development.

- Runtime error inspection with source-mapped stack frames.
- Server-function request and response inspection.
- A reactivity graph of the live signals, memos and effects in the app.
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

## Demo

Two demo apps live in `examples`.

- `examples/demo` is a small orders dashboard that exercises every panel.
- `examples/explorer` is a file explorer whose component tree grows as you open folders.
- `examples/docks` renders the panels inside the Vite DevTools dock instead of the toolbar.

```sh
pnpm demo
pnpm demo:explorer
pnpm demo:docks
```

## Vite DevTools

The panels also run inside the Vite DevTools dock. Add the plugin to a project that has
Vite DevTools installed:

```ts
import { solidDevtoolsDocks } from '@solidjs/start-devtools/vite';

export default defineConfig({
  plugins: [solid(), solidDevtoolsDocks()],
});
```

The dock gains a `Reactivity Graph` entry and an `Ownership Tree` entry. Both render in the
page the app runs in, so they read the same runtime the toolbar reads, and a jump between
the two switches dock entries. `examples/docks` is a small app set up this way:

```sh
pnpm demo:docks
```

The floating toolbar is unaffected. Use whichever suits the project, or both.

## Reactivity graph

The graph panel maps the running reactive graph. Signals, memos and effects are nodes,
and an edge points from a source to the computation that reads it. Hover a node for its
value, state and edge counts. Select one to dim the rest of the graph, list what it
reads and what reads it, and inspect its value as an expandable tree.

The panel reads the graph through the development hooks in `solid-js`, so it is empty in a
production build of the runtime. It only watches while it is open.

## Ownership tree

The ownership panel shows the app as a tree of owners.

Component mode lists components only. The scopes between them are folded into the component
above, so a component shows every signal, memo and effect created inside it. Owner mode
shows every owner instead, including roots, memos and effects.

Selecting a row lists its prop names, the signals it holds with their values, the scopes
folded into it, its children, and the ancestry it was created under. Every frame of the
ancestry is clickable, so you can walk back up the tree. Prop values are getters, so the panel lists their names
and never reads them.

A component also shows where it is declared. The location comes from the hot reload
transform, which `@solidjs/vite-plugin` runs in development, so it is there without any
extra setup. Clicking it asks the dev server to open the file in your editor.

The panel reads the tree through the development hooks in `solid-js`, so it is empty in a
production build of the runtime. It only watches while it is open.

For more inspection tools, see [Solid Devtools](https://github.com/thetarnav/solid-devtools).
