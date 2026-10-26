import { expect, test } from '@playwright/test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const fixture = fileURLToPath(new URL('../fixture-vite', import.meta.url));
const app = 'http://127.0.0.1:4174/';

test('mounts the toolbar into an app that does not render it', async ({ page }) => {
  await page.goto(app);
  await expect(page.locator('#increment')).toHaveText('count 0');
  await expect(page.locator('[data-solid-dev-toolbar]')).toHaveCount(1);
  // It is the plugin's mount: its own host on the body, beside the app.
  await expect(page.locator('body > [data-solid-dev-toolbar-root]')).toHaveCount(1);
  await expect(page.locator('#app [data-solid-dev-toolbar]')).toHaveCount(0);

  // The app keeps working beside it.
  await page.locator('#increment').click();
  await expect(page.locator('#increment')).toHaveText('count 1');
});

test('leaves production builds without the toolbar', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'start-devtools-vite-'));
  try {
    await build({
      configFile: path.join(fixture, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
    const html = await readFile(path.join(outDir, 'index.html'), 'utf8');
    expect(html).not.toContain('solid-start-devtools/mount');
    const assets = await readdir(path.join(outDir, 'assets'));
    const scripts = await Promise.all(
      assets
        .filter((file) => file.endsWith('.js'))
        .map((file) => readFile(path.join(outDir, 'assets', file), 'utf8')),
    );
    expect(scripts.join('\n')).not.toContain('data-solid-dev-toolbar');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
