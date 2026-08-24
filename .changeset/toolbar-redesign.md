---
'@solidjs/start-devtools': patch
---

Sync the dev toolbar redesign from Solid Start: panel layout with a call list beside a detail pane, collapsible sections, body-first content viewers, request timing, unhandled rejection capture, drag limited to the toolbar pill, and source map tracing through `@jridgewell/trace-mapping`. Stack parsing moves from `error-stack-parser` to `error-stack-parser-es/lite`, dropping the `stackframe` transitive dependency.
