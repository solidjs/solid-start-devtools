---
'@solidjs/start-devtools': minor
---

Add `connectDevServer`, which lets `@solidjs/vite-plugin` send the toolbar what only the dev server knows, and `@solidjs/start-devtools/protocol`, the messages and endpoints both sides use.

- Errors the server runtime reports during a render, a server function or a request show in the Health view.
- Open in editor sends one request to the plugin's endpoint, which resolves the path against the Vite root.
- The solid-js version in the header comes from the dev server when the page cannot import the package file.
