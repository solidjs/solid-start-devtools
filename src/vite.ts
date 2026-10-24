import path from 'node:path';
import type { Plugin } from 'vite';

const PACKAGE = '@solidjs/start-devtools';
const MOUNT_ID = 'virtual:solid-start-devtools/mount';

export interface DevtoolsPluginOptions {
  /**
   * Mount the toolbar in pages served from an `index.html`, so the app needs
   * no `<DevToolbar>` in its JSX. Apps whose entry already renders the
   * toolbar keep one, since the toolbar never mounts twice.
   *
   * @default true
   */
  mount?: boolean;
}

/** `base` and `path` joined with one slash between them. */
function joinBase(base: string, file: string): string {
  return `${base.replace(/\/+$/, '')}/${file.replace(/^\/+/, '')}`;
}

/**
 * The Vite plugin of the devtools. In development it mounts the toolbar into
 * the page, so no JSX is needed. Builds, `vite preview` and Vitest are left
 * alone, so production never carries the toolbar.
 *
 * ```ts
 * import solid from '@solidjs/vite-plugin';
 * import devtools from '@solidjs/start-devtools/vite';
 *
 * export default defineConfig({ plugins: [solid(), devtools()] });
 * ```
 *
 * Start mode of `@solidjs/vite-plugin` mounts the toolbar through its own
 * generated entries and serves no `index.html`, so this plugin adds nothing
 * there.
 */
export default function devtools(options: DevtoolsPluginOptions = {}): Plugin {
  const mount = options.mount ?? true;
  let root = process.cwd();
  let base = '/';

  return {
    name: 'solid-start-devtools',
    apply(_config, env) {
      return env.command === 'serve' && !env.isPreview && env.mode !== 'test';
    },

    // The mount module reaches the page behind the dependency scanner's back,
    // through a script added to index.html. Without this, the first page load
    // finds the package, optimizes it again and reloads the page.
    config() {
      if (!mount) return;
      return { optimizeDeps: { include: [PACKAGE] } };
    },

    configResolved(config) {
      root = config.root;
      base = config.base;
    },

    async resolveId(source, importer) {
      if (source === MOUNT_ID) return { id: MOUNT_ID, moduleSideEffects: true };
      // The virtual module has no directory to resolve a package from, so the
      // app's copy is found from the root, the one the app itself imports.
      if (importer === MOUNT_ID && source === PACKAGE) {
        return this.resolve(source, path.join(root, 'index.html'), { skipSelf: true });
      }
      return null;
    },

    load(id) {
      if (id !== MOUNT_ID) return null;
      return [`import { mountDevToolbar } from '${PACKAGE}';`, 'mountDevToolbar();'].join('\n');
    },

    transformIndexHtml() {
      if (!mount) return undefined;
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: joinBase(base, `/@id/${MOUNT_ID}`) },
          injectTo: 'body' as const,
        },
      ];
    },
  };
}
