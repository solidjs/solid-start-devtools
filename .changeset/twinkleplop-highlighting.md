---
'@solidjs/start-devtools': patch
---

Highlight error sources with twinkleplop instead of shiki.

The code view now highlights synchronously, so a stack frame's source appears with the panel rather than a moment later, and the toolbar no longer ships a WebAssembly grammar engine. The built package drops from 8.1 MB to 3.6 MB, and the error viewer chunk from 1.1 MB to 273 kB.
The panel highlights the whole file and keeps twenty-five lines on each side of the frame, which is about as far as the view scrolls. Cutting the file before highlighting it left the highlighter reading a block comment or template literal it never saw open, and the colours fell apart from there. The view opens on the frame's line.
The frame's line is marked with the `focus` directive and the word it points at with `err`, both written as comments above the file. The code itself is never edited to carry them, and marker lines are dropped from the output.
