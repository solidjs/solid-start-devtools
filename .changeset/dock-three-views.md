---
'@solidjs/start-devtools': minor
---

- The dock has three views in its header: Health, Activity and Structure. The header shows the `solid-js` version the app runs, in place of the toolbar's title and version.
- Health lists thrown errors and runtime issues together, with search and severity chips. An error shows the function it was thrown in, when it was caught, the action it was caught during with a link to it, its stack frames beside the source, and "Open in editor".
- Activity merges actions, server-function calls, async loads and waits, and errors into one stream over the last 30 seconds, with a live lanes strip on a time axis, filter chips, time groups and a pause button. Repeated actions fold into one row. An action shows what it wrote, what re-ran and which effects ran, then waterfalls of its re-runs and server calls.
- Structure shows the ownership tree or the reactivity graph. Tree rows show signal and memo counts and how recently and how often their computations update. "Hide Solid internals" folds Solid's own components away. The detail lists props, signals and memos by kind, with a signal's previous value.
- ⌘K (Ctrl+K) opens a search across components, signals, memos, actions and server functions while the dock is open.
- The timeline keeps distinct actions when one action repeats many times, such as an animation loop.
- Every list and detail split is resizable.
