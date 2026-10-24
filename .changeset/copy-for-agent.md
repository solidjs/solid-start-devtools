---
'@solidjs/start-devtools': minor
---

Each panel has a button that copies a Markdown report for an agent such as Claude Code.

- The error report has the message, the mapped stack and the source around the frames in the app.
- The server function report has the status, time, headers and bodies of the call.
- The ownership and reactivity reports have the selected node with its values and the nodes around it.
- Values with sensitive names, such as `cookie`, `token` or `password`, are redacted.
