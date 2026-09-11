---
'@solidjs/start-devtools': patch
---

Add an ownership tree panel to the dev toolbar.

The panel shows the app as a tree of owners. Component mode lists components only and folds the scopes between them into the component above, so a component shows the signals, memos and effects created inside it. Owner mode shows every owner.
Selecting a row lists its prop names, the signals it holds with their values, the scopes folded into it and its children.
Components show where they are declared, and clicking the location opens the file in your editor.
Rows flash when an owner is created, and the tree can be searched by component, scope or signal.
