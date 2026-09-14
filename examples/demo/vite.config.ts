import solid from '@solidjs/vite-plugin';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    solid({
      // Start mode owns the entries, so the demo is just a root component.
      // The toolbar is mounted by the plugin because the package is installed.
      ssr: true,
      start: { devtools: true },
      serverFunctions: true,
    }),
  ],
});
