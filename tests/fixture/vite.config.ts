import { transformAsync } from '@dom-expressions/compiler';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const builtIns = [
  'For',
  'Show',
  'Switch',
  'Match',
  'Loading',
  'Reveal',
  'Portal',
  'Repeat',
  'Dynamic',
  'Errored',
];

function solid(): Plugin {
  return {
    name: 'solid-test',
    enforce: 'pre',
    async transform(code, id) {
      const filename = id.replace(/\?.*$/, '');
      if (/[/\\]node_modules[/\\]/.test(filename) || !/\.[mc]?[jt]sx$/i.test(filename)) {
        return null;
      }

      const result = await transformAsync(code, {
        filename,
        moduleName: '@solidjs/web',
        generate: 'dom',
        sourceMap: true,
        contextToCustomElements: true,
        wrapConditionals: true,
        builtIns,
      });

      return { code: result.code, map: result.map };
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [solid()],
  optimizeDeps: {
    rolldownOptions: {
      transform: { jsx: { runtime: 'classic' } },
    },
  },
});
