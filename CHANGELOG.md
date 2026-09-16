# @solidjs/start-devtools

## 1.0.0-next.5

### Patch Changes

- 341960b: Add an ownership tree panel to the dev toolbar.

  The panel shows the app as a tree of owners. Component mode lists components only and folds the scopes between them into the component above, so a component shows the signals, memos and effects created inside it. Owner mode shows every owner.
  Selecting a row lists its prop names, the signals it holds with their values, the scopes folded into it, its children, and the ancestry it was created under.
  Components show where they are declared, and clicking the location opens the file in your editor.
  Rows flash when an owner is created, and the tree can be searched by component, scope or signal.

- b1177e3: Add a reactivity graph panel to the dev toolbar.

  The panel maps live signals, memos and effects as a directed graph.
  Hovering a node shows its value, state, owner and edge counts.
  Selecting a node highlights everything upstream and downstream of it and lists its sources and observers.
  The selected node's value is shown as an expandable tree, the same one the server function panel uses for serialized values.
  Nodes pulse and count changes as the app updates, and the graph can be filtered by kind or searched by name, value or owner.

- cb0e333: Update terracotta to `2.0.0-next.9`.

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
