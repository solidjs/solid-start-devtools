# @solidjs/start-devtools

## 1.0.0-next.5

### Patch Changes

- 341960b: Add an ownership tree panel to the dev toolbar.

  The panel shows the app as a tree of owners. Component mode lists components only and folds the scopes between them into the component above, so a component shows the signals, memos and effects created inside it. Owner mode shows every owner.
  Selecting a row lists its prop names, the signals it holds with their values, the scopes folded into it, its children, and the ancestry it was created under.
  Components show where they are declared, and clicking the location opens the file in your editor.
  Rows flash when an owner is created, and the tree can be searched by component, scope or signal.

- 841fc15: The server-function panel is driven by the runtime's `"call"` record.

  `observeServerFunctionCalls` was removed from `@solidjs/web/server-functions` in rc.9; the panel has shown nothing since. It now subscribes to `OBSERVE.records` for `"request"` and `"call"` with `bodies: true`: a call appears the moment its request is handed to `fetch` and completes when the caller's await settles, showing the request as sent and the response as it arrived, with unread bodies to inspect, the function's source name when the build carried one, and the call's timing. A call whose fetch itself failed is marked as failed, with the thrown value's message in place of the response.

  The toolbar excludes its own owner from the runtime's observe layer (`OBSERVE.exclude`) and hands the app it wraps back (`OBSERVE.include`), so the toolbar's own signals and effects are never reported as the app's by diagnostics, attribution, or the performance tracks.

- 841fc15: Build and read the Solid 2.0.0-rc.13 runtime.

  The toolbar is compiled with `@solidjs/compiler`, the compiler that ships with the runtime, so delegated event handlers use the key the runtime reads (`_$$click`). Every click in the reactivity and ownership panels was dead against rc.9 and later.
  The `solid-js` and `@solidjs/web` peers move to `^2.0.0-rc.13`.
  The reactivity graph reads a node's error off its extension (`_x._error`), recognises store slot nodes by the store they belong to, and hides the memo the built-in hot reload wrapper creates, which the runtime now marks as plumbing instead of naming. The ownership tree walks through that memo without a row.
  A server render that fails sets the 500 status and logs, without writing toolbar state.

- b1177e3: Add a reactivity graph panel to the dev toolbar.

  The panel maps live signals, memos and effects as a directed graph.
  Hovering a node shows its value, state, owner and edge counts.
  Selecting a node highlights everything upstream and downstream of it and lists its sources and observers.
  The selected node's value is shown as an expandable tree, the same one the server function panel uses for serialized values.
  Nodes pulse and count changes as the app updates, and the graph can be filtered by kind or searched by name, value or owner.

- cb0e333: Update terracotta to `2.0.0-next.9`.
- d086474: Highlight error sources with twinkleplop instead of shiki.

  The code view now highlights synchronously, so a stack frame's source appears with the panel rather than a moment later, and the toolbar no longer ships a WebAssembly grammar engine. The built package drops from 8.1 MB to 3.6 MB, and the error viewer chunk from 1.1 MB to 273 kB.
  The panel highlights the whole file and keeps twenty-five lines on each side of the frame, which is about as far as the view scrolls. Cutting the file before highlighting it left the highlighter reading a block comment or template literal it never saw open, and the colours fell apart from there. The view opens on the frame's line.
  The frame's line is marked with the `focus` directive and the word it points at with `err`, both written as comments above the file. The code itself is never edited to carry them, and marker lines are dropped from the output.

## 1.0.0-next.4

### Patch Changes

- a3cb04d: Sync the dev toolbar redesign from Solid Start: panel layout with a call list beside a detail pane, collapsible sections, body-first content viewers, request timing, unhandled rejection capture, drag limited to the toolbar pill, and source map tracing through `@jridgewell/trace-mapping`. Stack parsing moves from `error-stack-parser` to `error-stack-parser-es/lite`, dropping the `stackframe` transitive dependency.

## 1.0.0-next.3

### Patch Changes

- 34d3748: Keep server-function inspector entries reactive as responses arrive.

## 1.0.0-next.2

### Patch Changes

- 7783dd5: Build with Rolldown, update the project toolchain, and strengthen package validation.
- 550ba8e: Build with the native Solid compiler and migrate formatting to Oxfmt.
- f7dd9d0: Make direct imports production-safe with a no-op default export and development-only browser and server implementations. Register server-function observers from the browser entry.

## 1.0.0-next.1

### Patch Changes

- 4df6fae: Support server rendering the development error boundary and avoid duplicate toolbars when authored entries wrap their app.

## 1.0.0-next.0

### Major Changes

- ec71b6a: Add the Start development toolbar, runtime error overlay, and server-function inspector.
