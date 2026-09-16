import solid from '@solidjs/vite-plugin';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { solidDevtoolsDocks } from '@solidjs/start-devtools/vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Vite starts DevTools itself once the package is installed.
  // The demo also skips the one-time approval code so it opens straight away.
  // Leave authentication on outside a throwaway example, since without it any
  // browser that reaches the dev server can read the file system.
  devtools: { clientAuth: false },
  plugins: [solid(), solidDevtoolsDocks()],
});
