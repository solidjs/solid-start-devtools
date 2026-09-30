---
'@solidjs/start-devtools': patch
---

The server-function panel is driven by the runtime's `"call"` record.

`observeServerFunctionCalls` was removed from `@solidjs/web/server-functions` in rc.9; the panel has shown nothing since. It now subscribes to `OBSERVE.records` for `"request"` and `"call"` with `bodies: true`: a call appears the moment its request is handed to `fetch` and completes when the caller's await settles, showing the request as sent and the response as it arrived, with unread bodies to inspect, the function's source name when the build carried one, and the call's timing. A call whose fetch itself failed is marked as failed, with the thrown value's message in place of the response.

The toolbar excludes its own owner from the runtime's observe layer (`OBSERVE.exclude`) and hands the app it wraps back (`OBSERVE.include`), so the toolbar's own signals and effects are never reported as the app's by diagnostics, attribution, or the performance tracks.
