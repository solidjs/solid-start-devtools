import { expect, test } from '@playwright/test';
import { createRequestEvent, renderToString } from '@solidjs/web';
import { provideRequestEvent } from '@solidjs/web/storage';
import { build } from 'vite';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const fixture = path.join(root, 'tests/fixture');

async function readJavaScript(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = await Promise.all(
    entries.map(async (entry) => {
      const current = path.join(directory, entry.name);
      if (entry.isDirectory()) return readJavaScript(current);
      if (entry.name.endsWith('.js')) return readFile(current, 'utf8');
      return '';
    }),
  );
  return sources.join('\n');
}

test('renders the toolbar around the app', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('[data-solid-dev-toolbar]')).toHaveCount(1);
  await expect(page.locator('#fixture-content')).toHaveText('app content');
});

test('captures client errors', async ({ page }) => {
  await page.goto('/');
  await page.locator('#throw-client-error').click();

  await expect(page.locator('[data-solid-error-viewer-error-info-message]')).toHaveText(
    'client boom',
  );

  // Frames come from the parsed stack, so an empty list means the parser broke.
  const frames = page.locator('[data-solid-error-viewer-stack-frame]');
  await expect(frames.first()).toContainText('app.tsx');
});

test('shows server-function calls', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });

  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'View Server Functions' });
  const instances = page.locator('[data-solid-functions-instances]');

  // The panel overlays the page, so the fixture buttons are only clickable
  // while it is closed.
  await page.locator('#emit-server-function-request').click();
  await toggle.click();
  await expect(instances).toContainText('loadUser');

  await toggle.click();
  await page.locator('#emit-server-function-response').click();
  await toggle.click();
  await expect(instances).toContainText('201');

  await toggle.click();
  await page.locator('#emit-server-function-response').click();
  await toggle.click();
  await expect(instances).toContainText('500');

  // The detail pane starts empty and fills in once a call is selected.
  const detail = page.locator('[data-solid-functions-detail]');
  await expect(detail).toContainText('Select a server function call.');
  await page.locator('[data-solid-functions-instances] [data-solid-select-option]').first().click();
  await expect(detail.locator('[data-solid-function-instance-viewer]')).toBeVisible();

  expect(warnings).not.toContainEqual(expect.stringContaining('STRICT_READ_UNTRACKED'));
});

test('mounts once and disposes', async ({ page }) => {
  await page.goto('/?mount');

  await expect(page.locator('[data-solid-dev-toolbar]')).toHaveCount(1);
  expect(await page.evaluate(() => Reflect.get(window, '__sameDispose'))).toBe(true);
  await page.evaluate(() => Reflect.get(window, '__disposeToolbar')());
  await expect(page.locator('[data-solid-dev-toolbar]')).toHaveCount(0);
});

test('sets a 500 status for server render errors', async () => {
  const moduleUrl = pathToFileURL(path.join(root, 'dist/server.js')).href;
  const { DevToolbar } = await import(moduleUrl);
  const event = createRequestEvent(new Request('http://localhost/'));
  const originalError = console.error;
  console.error = () => {};

  try {
    const html = provideRequestEvent(event, () =>
      renderToString(() =>
        DevToolbar({
          get children() {
            throw new Error('server boom');
          },
        }),
      ),
    );
    await Promise.resolve();

    expect(event.response.status).toBe(500);
    expect(html).toContain('server boom');
  } finally {
    console.error = originalError;
  }
});

test('removes the toolbar from production bundles', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'start-devtools-'));

  try {
    await build({
      configFile: path.join(fixture, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
    const output = await readJavaScript(outDir);

    expect(output).not.toContain('data-solid-dev-toolbar');
    expect(output).not.toContain('Start Devtools Version');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
