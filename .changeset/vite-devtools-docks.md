---
'@solidjs/start-devtools': patch
---

Show the reactivity graph and the ownership tree inside Vite DevTools.

Add `@solidjs/start-devtools/vite`, a Vite plugin that registers both panels as dock entries. The panels render in the page the app runs in, so they read the same runtime the toolbar reads and nothing is sent to the dev server. Opening a signal in the graph, or an owner in the tree, switches to the other dock entry.
The plugin also loads a small module with the page, because the runtime only reports owners and signals as they are created and a panel opens long after the app rendered.
The floating toolbar keeps working as before. The dock is an extra way to reach the panels, and needs Vite 8.3 with Vite DevTools installed.
