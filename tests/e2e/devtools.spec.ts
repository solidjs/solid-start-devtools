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

test('maps the reactivity graph', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'View Reactivity Graph' });
  const nodes = page.locator('[data-solid-reactivity-node]');
  const count = nodes.filter({ hasText: /^count/ }).first();

  await toggle.click();
  await expect(count).toBeVisible();
  await expect(nodes.filter({ hasText: /^doubled/ }).first()).toBeVisible();
  await expect(nodes.filter({ hasText: /^report-doubled/ }).first()).toBeVisible();

  // Effects that subscribe to nothing sit in their own column before the signals.
  const columns = await nodes.evaluateAll((elements) =>
    elements.map((element) => ({
      x: Math.round(element.getBoundingClientRect().x),
      kind: (element as HTMLElement).dataset.kind,
    })),
  );
  const leftmost = Math.min(...columns.map((entry) => entry.x));
  expect(
    columns
      .filter((entry) => entry.x === leftmost)
      .every((entry) => entry.kind?.includes('effect')),
  ).toBe(true);
  expect(columns.some((entry) => entry.kind === 'signal' && entry.x > leftmost)).toBe(true);

  // Hovering a node explains it without selecting it.
  await count.hover();
  const card = page.locator('[data-solid-reactivity-hovercard]');
  await expect(card).toContainText('number');
  await expect(card).toContainText('2 out');

  // The card sits above or below the node, never over it.
  const cardBox = (await card.boundingBox())!;
  const nodeBox = (await count.boundingBox())!;
  expect(cardBox.y + cardBox.height <= nodeBox.y || cardBox.y >= nodeBox.y + nodeBox.height).toBe(
    true,
  );

  // The detail pane only appears once a node is selected.
  await expect(page.locator('[data-solid-reactivity-detail]')).toHaveCount(0);

  // Selecting a node lists what reads it and dims the rest of the graph.
  await count.click();
  const detail = page.locator('[data-solid-reactivity-detail]');
  await expect(detail).toContainText('Observers (2)');
  await expect(detail.locator('[data-solid-reactivity-link]').first()).toContainText('doubled');
  await expect(nodes.filter({ hasText: /^doubled/ }).first()).toHaveAttribute(
    'data-solid-reactivity-node',
    'downstream',
  );

  // The panel covers the page, so close it before driving the app.
  await toggle.click();
  await page.locator('#increment-count').click();
  await toggle.click();
  await expect(count).toContainText('1');
  await expect(nodes.filter({ hasText: /^doubled/ }).first()).toContainText('2');

  // The value pane is the same expandable tree the server function viewer uses.
  const tree = page.locator('[data-solid-reactivity-detail-value]');
  await expect(tree.locator('[data-solid-value-token="number"]')).toHaveText('1');

  await nodes
    .filter({ hasText: /^effect\[/ })
    .first()
    .click();
  await expect(tree.locator('[data-solid-value-tree-row]').first()).toContainText('array');
  await expect(tree.locator('[data-solid-value-tree-key]').first()).toContainText('0');
  await expect(tree).toContainText('<main>');

  // Filters drop a whole kind from the graph.
  await count.click();
  await page.getByRole('button', { name: 'Memos' }).click();
  await expect(nodes.filter({ hasText: /^doubled/ })).toHaveCount(0);
  await expect(count).toBeVisible();

  // The owner field opens the ownership tree on the component that owns the node.
  if ((await count.getAttribute('data-solid-reactivity-node')) !== 'selected') {
    await count.click();
  }
  // The path names the components the app declared, not the toolbar around it.
  await expect(
    page.locator('[data-solid-reactivity-detail] [data-solid-reactivity-owner]'),
  ).toHaveText('<App> › <Counter>');
  await page.locator('[data-solid-reactivity-detail] [data-solid-reactivity-owner]').click();
  await expect(page.locator('[data-solid-ownership-row][data-selected]')).toContainText(
    '<Counter>',
  );
});

test('maps the ownership tree', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'View Ownership Tree' });
  const rows = page.locator('[data-solid-ownership-name]');

  await toggle.click();
  await expect(rows).toHaveText(['<App>', '<Greeting>', '<Counter>', '<Show>']);

  // The detail pane only appears once an owner is selected.
  await expect(page.locator('[data-solid-ownership-detail]')).toHaveCount(0);

  // A component owns the signals and scopes created inside it.
  await page.locator('[data-solid-ownership-label]').filter({ hasText: '<Counter>' }).click();
  const detail = page.locator('[data-solid-ownership-detail]');
  await expect(detail).toContainText('Signals (1)');
  await expect(detail).toContainText('count');
  await expect(detail).toContainText('doubled');

  // Values stay live while the panel is open, even when the tree does not move.
  // The panel covers the page, so the click goes straight to the element.
  await page.evaluate(() => (document.querySelector('#increment-count') as HTMLElement).click());
  await expect(
    detail
      .locator('[data-solid-ownership-signal]')
      .filter({ has: page.getByText('count', { exact: true }) }),
  ).toContainText('1');

  // Props are listed by name, never read.
  await page.locator('[data-solid-ownership-label]').filter({ hasText: '<Greeting>' }).click();
  await expect(detail).toContainText('Props (1)');
  await expect(detail).toContainText('name');

  // The ancestry section lists the owners above the selection, nearest first.
  const frames = detail.locator('[data-solid-ownership-frame]');
  await expect(frames).toHaveCount(2);
  await expect(frames.first()).toContainText('<Greeting>');
  await expect(frames.nth(1)).toContainText('<App>');

  // Clicking a frame walks up the tree.
  await frames.nth(1).click();
  await expect(detail.locator('[data-solid-ownership-detail-head]')).toContainText('<App>');

  // Owner mode adds the scopes that component mode folds away.
  await page.getByRole('button', { name: 'Owners', exact: true }).click();
  await expect(rows.filter({ hasText: /^doubled$/ })).toHaveCount(1);

  // Search keeps the ancestors of a match so the row stays reachable.
  await page.getByRole('button', { name: 'Components', exact: true }).click();
  await page.locator('[data-solid-ownership-search]').fill('doubled');
  await expect(rows).toHaveText(['<App>', '<Counter>']);

  // Rows carry no count badges.
  await expect(page.locator('[data-solid-ownership-row] [data-solid-badge="info"]')).toHaveCount(0);

  // A signal opens in the reactivity graph with that node selected.
  await page.locator('[data-solid-ownership-search]').fill('');
  await page.locator('[data-solid-ownership-label]').filter({ hasText: '<Counter>' }).click();
  const countEntry = detail
    .locator('[data-solid-ownership-signal]')
    .filter({ has: page.getByText('count', { exact: true }) });
  await countEntry.hover();
  await countEntry.getByRole('button', { name: 'View in graph' }).click();
  await expect(
    page
      .locator('[data-solid-reactivity-node]')
      .filter({ hasText: /^count/ })
      .first(),
  ).toHaveAttribute('data-solid-reactivity-node', 'selected');

  // The node lands in the middle of the canvas, measured after the detail pane
  // has narrowed it.
  await expect
    .poll(async () => {
      const canvasBox = (await page.locator('[data-solid-reactivity-canvas]').boundingBox())!;
      const nodeBox = (await page
        .locator('[data-solid-reactivity-node="selected"]')
        .first()
        .boundingBox())!;
      return Math.abs(nodeBox.x + nodeBox.width / 2 - (canvasBox.x + canvasBox.width / 2));
    })
    .toBeLessThan(4);

  // The graph keeps watching after the jump. The ownership panel stops in the
  // same flush the graph starts, which used to take the graph's hooks away.
  // The panel covers the page, so the click goes straight to the element.
  await page.evaluate(() => (document.querySelector('#increment-count') as HTMLElement).click());
  await expect(
    page
      .locator('[data-solid-reactivity-node]')
      .filter({ hasText: /^count/ })
      .first(),
  ).toContainText('2');
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
