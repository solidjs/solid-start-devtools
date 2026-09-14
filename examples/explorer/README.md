# Ownership demo

A file explorer that grows and shrinks its component tree as you use it.

```sh
pnpm demo:explorer
```

The command builds the package and starts the app on http://localhost:5173.

## What it shows

The app is built with `@solidjs/vite-plugin` in start mode, so the plugin owns the entries
and mounts the toolbar itself. `examples/explorer/src/App.tsx` is the whole app.

- `FolderNode` renders itself for every nested folder, so the ownership tree has the same
  shape as the folder you opened.
- `SelectionProvider` owns the selection signals. Every row reads them out of context,
  which is visible in the tree as one owner holding the signals many components use.
- `PreviewPane` is mounted behind a toggle, so hiding it disposes an owner and its scopes.
- `Stats`, `Breadcrumbs` and `FolderNode` each create memos, which component mode folds
  into the component that owns them.

## Things to try

1. Open the ownership panel and expand `routes` in the app. New rows appear and flash.
2. Hide the preview. `<PreviewPane>` and the memo and effect it owns leave the tree.
3. Select `<SelectionProvider>` and see the two signals every row depends on.
4. Click the file location under a component name to open it in your editor.
5. Switch to owner mode to see the roots, memos and effects that component mode folds away.
6. Search for `folder-stats` to find every folder memo at once.
