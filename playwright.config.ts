import { defineConfig } from '@playwright/test';

// The toolbar only exists behind the `development` export condition, and the
// runtime keeps render errors intact only in its development server build. The
// worker processes running the server-side tests inherit this, so they resolve
// solid-js and @solidjs/web the way a development server does.
const conditions = '--conditions=development';
if (!process.env.NODE_OPTIONS?.includes(conditions)) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, conditions].filter(Boolean).join(' ');
}

export default defineConfig({
  testDir: './tests/e2e',
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec vite --config tests/fixture/vite.config.ts --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
