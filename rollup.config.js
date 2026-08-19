import { babel } from '@rollup/plugin-babel';
import cjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { readFileSync } from 'node:fs';
import cleaner from 'rollup-plugin-cleaner';

const extensions = ['.js', '.ts', '.json', '.tsx', '.jsx'];

function css(server = false) {
  return {
    name: 'devtools-css',
    transform(code, id) {
      if (!id.endsWith('.css')) return null;
      if (server) return { code: '', map: null };
      return {
        code: `const style = document.createElement('style');\nstyle.textContent = ${JSON.stringify(code)};\ndocument.head.append(style);`,
        map: null,
      };
    },
  };
}

function assetUrl() {
  return {
    name: 'devtools-asset-url',
    async resolveId(source, importer) {
      if (!source.endsWith('?url')) return null;
      const resolved = await this.resolve(source.slice(0, -4), importer, { skipSelf: true });
      return resolved ? `${resolved.id}?url` : null;
    },
    load(id) {
      if (!id.endsWith('?url')) return null;
      const referenceId = this.emitFile({
        type: 'asset',
        name: 'onig.wasm',
        source: readFileSync(id.slice(0, -4)),
      });
      return `export default import.meta.ROLLUP_FILE_URL_${referenceId};`;
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
    id.startsWith('@solidjs/web/')
  );
}

function config({ input, entryFileNames, chunkFileNames, generate, server = false }) {
  return {
    input,
    output: {
      format: 'esm',
      dir: 'dist',
      entryFileNames,
      chunkFileNames,
      assetFileNames: 'assets/[name]-[hash][extname]',
      sourcemap: true,
    },
    external,
    plugins: [
      ...(server ? [] : [cleaner({ targets: ['./dist/'] })]),
      css(server),
      assetUrl(),
      packageVersion(),
      babel({
        extensions,
        babelHelpers: 'bundled',
        presets: [
          ['@babel/preset-env', { targets: { esmodules: true } }],
          '@babel/preset-typescript',
          ['babel-preset-solid', { moduleName: '@solidjs/web', generate }],
        ],
      }),
      nodeResolve({ extensions, browser: !server }),
      cjs({ extensions }),
    ],
  };
}

export default [
  config({
    input: 'src/index.tsx',
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
  config({
    input: 'src/noop.ts',
    entryFileNames: 'noop.js',
    chunkFileNames: 'noop-chunks/[name]-[hash].js',
    generate: 'ssr',
    server: true,
  }),
];
