---
'@solidjs/start-devtools': minor
---

- The dock groups its panels into three views: Health (errors and runtime issues in one list), Activity (Timeline, Async and Server functions) and Structure (Ownership and Reactivity).
- The header and the pull tab show the `solid-js` version the app runs, in place of the toolbar's title and version. The pull tab also counts issues.
- The error panel lists stack frames beside the source, folds frames from libraries, and opens the selected frame in the editor.
- The Timeline folds runs of the same action into one row with a count.
- The detail panes of Health, Timeline, Async and Server functions, and the split between stack frames and source, are resizable.
- Picking an element with the inspector opens it in the ownership tree. The Reactivity graph shows the component filter the pick sets, with a button to clear it.
