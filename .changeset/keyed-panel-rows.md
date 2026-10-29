---
'@solidjs/start-devtools': patch
---

The Ownership tree rows and the Reactivity graph nodes and edges are now matched by id between refreshes. Before, every refresh rebuilt all of them, so an app that writes a signal every frame kept the page at about 15 to 20 frames per second while one of these panels was open.
