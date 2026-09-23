---
'@solidjs/start-devtools': patch
---

Highlight error sources with twinkleplop instead of shiki.

The code view now highlights synchronously, so a stack frame's source appears with the panel rather than a moment later, and the toolbar no longer ships a WebAssembly grammar engine. The built package drops from 8.1 MB to 3.6 MB, and the error viewer chunk from 1.1 MB to 273 kB.
The error line and the word the frame points at are marked with twinkleplop's `hl` and `err` directives, written as comments above the snippet. The code itself is never edited to carry them, and the marker lines are dropped from the output.
