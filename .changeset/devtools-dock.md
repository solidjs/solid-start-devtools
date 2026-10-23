---
'@solidjs/start-devtools': minor
---

Show the devtools in a dock at the bottom of the page.

- Closed, the dock is a small grip at the bottom center of the page. It grows into a pull tab on hover or focus, and turns red when there are errors. Click it, or drag it up, to open the dock.
- Alt+Shift+D opens and closes the dock.
- Drag the top edge of the dock to change its height. The page can scroll past it.
- A side nav holds the Errors, Server functions, Reactivity and Ownership tabs, with counts of errors and calls.
- The header shows the version and the current route.
- The dock remembers whether it was open, its tab and its height across reloads.
- An error opens the dock on the Errors tab.
- Selected tabs, calls and stack frames use a rounded fill instead of a colored left border. Graph nodes show their kind with a colored dot and tint instead of a left border.
