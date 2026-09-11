---
'@solidjs/start-devtools': patch
---

Add a reactivity graph panel to the dev toolbar.

The panel maps live signals, memos and effects as a directed graph.
Hovering a node shows its value, state, owner and edge counts.
Selecting a node highlights everything upstream and downstream of it and lists its sources and observers.
Nodes pulse and count changes as the app updates, and the graph can be filtered by kind or searched by name, value or owner.
