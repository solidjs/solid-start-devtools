---
'@solidjs/start-devtools': patch
---

The reactivity graph lays out each group of connected nodes in a band of its own, so unrelated chains no longer share columns.

- Nodes with no edges share a grid under the bands instead of one tall column.
- An edge that skips columns runs in a lane of its own instead of through other nodes.
- A signal sits in the column right before the node that reads it.
- A band keeps its arrangement while its nodes and edges stay the same. A band whose structure changed is arranged again, so its edges cross as little as possible.
