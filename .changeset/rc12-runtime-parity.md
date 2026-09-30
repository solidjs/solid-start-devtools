---
'@solidjs/start-devtools': patch
---

Build and read the Solid 2.0.0-rc.12 runtime.

The toolbar is compiled with `@solidjs/compiler`, the compiler that ships with the runtime, so delegated event handlers use the key the runtime reads (`_$$click`). Every click in the reactivity and ownership panels was dead against rc.9 and later.
The `solid-js` and `@solidjs/web` peers move to `^2.0.0-rc.12`.
The reactivity graph reads a node's error off its extension (`_x._error`), recognises store slot nodes by the store they belong to, and hides the memo the built-in hot reload wrapper creates, which the runtime now marks as plumbing instead of naming. The ownership tree walks through that memo without a row.
A server render that fails sets the 500 status and logs, without writing toolbar state.
