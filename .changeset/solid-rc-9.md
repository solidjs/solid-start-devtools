---
'@solidjs/start-devtools': patch
---

Build against Solid 2.0.0-rc.9.

Solid now compiles JSX with `@solidjs/compiler`, and its runtime no longer reads the event handlers the old `@dom-expressions/compiler` writes, so the toolbar is built with the new compiler.
