---
'@solidjs/start-devtools': minor
---

Add fine-grained reactive update highlighter with frequency color progression:

- Toggle via `Alt+Shift+H` shortcut or the highlight icon in the dock toolbar, with state persisted in local storage.
- Outlines each DOM change as it happens. A text change gets a box around the changed text only, one per line it covers. Other changes get a box around the element.
- Frequency-based color progression within an 800ms window: Light Blue (1), Purple (2-3), Pink (4-7), and Red (8+).
- The boxes are drawn on one canvas in a shadow root, so they add nothing to the page and page styles cannot reach them. They follow the page when it scrolls. One frame draws at most 200 of them, and the fade turns off when the user prefers reduced motion.
