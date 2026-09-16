import { transformAsync } from '@dom-expressions/compiler';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';

const extensions = ['.js', '.ts', '.json', '.tsx', '.jsx'];
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

function solid(generate) {
  return {
    name: 'solid',
    async transform(code, id) {
      const filename = id.replace(/\?.*$/, '');
      if (/[/\\]node_modules[/\\]/.test(filename) || !/\.[mc]?[jt]sx$/i.test(filename)) {
        return null;
      }

      const result = await transformAsync(code, {
        filename,
        moduleName: '@solidjs/web',
        generate,
        sourceMap: true,
        contextToCustomElements: true,
        wrapConditionals: true,
        builtIns,
      });

      return { code: result.code, map: result.map };
    },
  };
}

function css(server = false) {
  return {
    name: 'devtools-css',
    transform(code, id) {
      if (!id.endsWith('.css')) return null;
      if (server) return { code: '', map: null, moduleType: 'js' };
      // The panels also render inside a shadow root, which the document head
      // does not reach, so the text goes through the registry instead.
      const registry = fileURLToPath(new URL('./src/dev-toolbar/styles.ts', import.meta.url));
      return {
        code: `import { registerStyle } from ${JSON.stringify(registry)};\nregisterStyle(${JSON.stringify(code)});`,
        map: null,
        moduleType: 'js',
      };
    },
  };
}

function assetUrl() {
  return {
    name: 'devtools-asset-url',
    async resolveId(source, importer) {
      if (!source.endsWith('?url')) return null;
      const resolved = await this.resolve(source.slice(0, -4), importer, {
        skipSelf: true,
      });
      return resolved ? `${resolved.id}?url` : null;
    },
    load(id) {
      if (!id.endsWith('?url')) return null;
      const referenceId = this.emitFile({
        type: 'asset',
        name: 'onig.wasm',
        source: readFileSync(id.slice(0, -4)),
      });
      return `export default import.meta.ROLLDOWN_FILE_URL_${referenceId};`;
    },
  };
}

function packageVersion() {
  const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version;
  return {
    name: 'devtools-version',
    load(id) {
      if (id.endsWith('/src/version.ts')) return `export default ${JSON.stringify(version)};`;
    },
  };
}

function external(id) {
  return (
    id === 'solid-js' ||
    id.startsWith('solid-js/') ||
    id === '@solidjs/web' ||
    id.startsWith('@solidjs/web/') ||
    // The Vite plugin entry only borrows types from these.
    id === 'vite' ||
    id === '@vitejs/devtools-kit' ||
    id.startsWith('@vitejs/devtools-kit/')
  );
}

function config({
  input,
  entryFileNames,
  chunkFileNames,
  generate,
  server = false,
  clean = false,
}) {
  return {
    input,
    platform: server ? 'node' : 'browser',
    resolve: { extensions },
    output: {
      format: 'esm',
      dir: 'dist',
      entryFileNames,
      chunkFileNames,
      assetFileNames: 'assets/[name]-[hash][extname]',
      // Only the first build clears the folder, so later ones keep its output.
      cleanDir: clean,
      sourcemap: true,
    },
    external,
    plugins: [css(server), assetUrl(), packageVersion(), solid(generate)],
  };
}

export default defineConfig([
  config({
    input: 'src/index.tsx',
    clean: true,
    entryFileNames: 'index.js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    generate: 'dom',
  }),
  config({
    input: 'src/server.tsx',
    entryFileNames: 'server.js',
    chunkFileNames: 'server-chunks/[name]-[hash].js',
    generate: 'ssr',
    server: true,
  }),
  // One build, so the panel and the page agent share the registries. Built
  // apart they would each hold their own copy, and the panel would read a
  // registry nothing wrote to.
  config({
    input: {
      'devtools-renderer': 'src/devtools/renderer.tsx',
      'devtools-collector': 'src/devtools/collector.ts',
    },
    entryFileNames: '[name].js',
    chunkFileNames: 'devtools-chunks/[name]-[hash].js',
    generate: 'dom',
  }),
  config({
    input: 'src/vite.ts',
    entryFileNames: 'vite.js',
    chunkFileNames: 'vite-chunks/[name]-[hash].js',
    generate: 'ssr',
    server: true,
  }),
  config({
    input: 'src/noop.ts',
    entryFileNames: 'noop.js',
    chunkFileNames: 'noop-chunks/[name]-[hash].js',
    generate: 'ssr',
    server: true,
  }),
  {
    input: {
      index: 'src/index.tsx',
      vite: 'src/vite.ts',
      'devtools-renderer': 'src/devtools/renderer.tsx',
      'devtools-collector': 'src/devtools/collector.ts',
    },
    output: {
      format: 'esm',
      dir: 'dist/types',
    },
    external,
    plugins: [dts({ emitDtsOnly: true })],
  },
]);
