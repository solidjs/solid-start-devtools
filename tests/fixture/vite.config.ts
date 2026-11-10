import { transformAsync } from '@solidjs/compiler';
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

/**
 * The dev server side of the devtools protocol, as @solidjs/vite-plugin serves
 * it: one server error kept from before the page loaded, and an open-in-editor
 * endpoint that records the files it was asked to open.
 */
function fakeDevServer(): Plugin {
  const opened: string[] = [];
  return {
    name: 'fake-devtools-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.ws.on('solid:devtools:hello', (hello: { since: number }, client) => {
        client.send('solid:devtools:info', {
          versions: { 'solid-js': 'from-dev-server' },
          errors: [
            {
              id: 1,
              at: hello.since + 1,
              name: 'Error',
              message: 'rendered on the server',
              stack: 'Error: rendered on the server\n    at load (/app/src/api.ts:3:9)',
              kind: 'render',
              handling: 'failed',
              method: 'GET',
              url: 'http://localhost/',
            },
          ],
        });
      });
      server.middlewares.use('/__solid/devtools/open-in-editor', (req, res) => {
        opened.push(new URL(req.url!, 'http://localhost').searchParams.get('file') ?? '');
        res.end();
      });
      server.middlewares.use('/__test/opened', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(opened));
      });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [solid(), fakeDevServer()],
  optimizeDeps: {
    rolldownOptions: {
      transform: { jsx: { runtime: 'classic' } },
    },
  },
});
