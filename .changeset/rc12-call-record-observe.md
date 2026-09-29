---
'@solidjs/start-devtools': patch
---

The server-function panel is driven by the runtime's `"call"` record.

`observeServerFunctionCalls` was removed from `@solidjs/web/server-functions` in rc.9; the panel has shown nothing since. It now subscribes to `OBSERVE.records` for `"call"` with `bodies: true`, and shows each call as the runtime saw it: the request as sent and the response as it arrived, with unread bodies to inspect, the function's source name when the build carried one, and the call's timing. The record arrives once, when the call settles, so a call appears with its response rather than ahead of it; a call whose fetch failed appears with the failure and no response.

The toolbar excludes its own owner from the runtime's observe layer (`OBSERVE.exclude`) and hands the app it wraps back (`OBSERVE.include`), so the toolbar's own signals and effects are never reported as the app's by diagnostics, attribution, or the performance tracks.
