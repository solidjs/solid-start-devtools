import { OPEN_IN_EDITOR_PATH } from '../protocol.js';
import { devServerInfo } from './dev-server.js';

/**
 * Asks the dev server to open the file in the user's IDE.
 *
 * When `@solidjs/vite-plugin` connected the toolbar, its endpoint resolves the
 * path against the Vite root, so one request is enough.
 */
export function openInEditor(location: string): void {
  const info = devServerInfo();
  if (info) {
    const base = info.base.endsWith('/') ? info.base.slice(0, -1) : info.base;
    void fetch(`${base}${OPEN_IN_EDITOR_PATH}?file=${encodeURIComponent(location)}`).catch(
      () => {},
    );
    return;
  }

  // Without the plugin, Vite's own `/__open-in-editor` endpoint resolves
  // relative paths against its server root, which the toolbar does not know.
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
