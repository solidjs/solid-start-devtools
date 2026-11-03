---
'@solidjs/start-devtools': patch
---

Show the body of server function calls that send files.

With `enableRichArguments()` in `@solidjs/web` 2.0.0-rc.20, a call whose arguments hold a `File` or `Blob` sends multipart form data marked `X-Server-Function-Format: 0`. The panel read that body as a seroval stream and showed no body. It now shows the arguments in the seroval tree and the files in a form data table. Reports copied for an agent list both.
