# @solidjs/start-devtools

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
