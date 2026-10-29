/**
 * Asks the dev server to open the file in the user's IDE.
 * Vite serves the `/__open-in-editor` endpoint in development.
 */
export function openInEditor(location: string): void {
  // Vite resolves relative paths against its server root (server.config.root).
  // In monorepos or subproject setups (like examples/explorer), `location` may
  // include parent path segments (e.g. 'examples/explorer/src/App.tsx') while
  // Vite's root is already set to 'examples/explorer'. We dispatch the full location
  // and candidate sub-paths so launch-editor finds the file regardless of root depth.
  void fetch(`/__open-in-editor?file=${encodeURIComponent(location)}`).catch(() => {});

  const parts = location.split('/');
  for (let i = 1; i < parts.length; i++) {
    const subpath = parts.slice(i).join('/');
    void fetch(`/__open-in-editor?file=${encodeURIComponent(subpath)}`).catch(() => {});
  }
}
