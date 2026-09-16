import { expect, test, type Page } from '@playwright/test';

const DEMO = 'http://127.0.0.1:4174/';

/**
 * Runs a snippet inside the dock's shadow root.
 *
 * The dock keeps its UI in a closed-looking custom element and the dock bar
 * sits under an overlay, so a normal click never reaches its buttons.
 */
function inDock<T>(page: Page, body: string, value?: string): Promise<T> {
  return page.evaluate(
    ({ source, argument }) => {
      const root = document.querySelector('devframes-dock-embedded')?.shadowRoot;
      if (!root) throw new Error('the dock has not mounted');
      return new Function('root', 'value', source)(root, argument) as never;
    },
    { source: body, argument: value },
  );
}

const openEntry = (page: Page, title: string) =>
  inDock(
    page,
    `[...root.querySelectorAll('button')].find((el) => el.getAttribute('aria-label') === value).click();`,
    title,
  );

test('renders the panels inside the Vite DevTools dock', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator('devframes-dock-embedded')).toBeAttached();

  // The tree holds the app that rendered before the panel opened, because the
  // plugin starts watching the runtime with the page.
  await openEntry(page, 'Ownership Tree');
  await expect
    .poll(() =>
      inDock<string[]>(
        page,
        `return [...root.querySelectorAll('[data-solid-ownership-name]')].map((el) => el.textContent);`,
      ),
    )
    .toEqual(['<App>', '<Tasks>', '<For>', '<TaskRow>', '<TaskRow>', '<TaskRow>']);

  // The panel styles itself inside the shadow root the dock renders it in.
  expect(
    await inDock<number>(
      page,
      `return root.querySelectorAll('style[data-solid-dev-toolbar-styles]').length;`,
    ),
  ).toBe(1);

  // A signal opens in the graph, which is a dock entry of its own.
  await inDock(
    page,
    `[...root.querySelectorAll('[data-solid-ownership-label]')].find((el) => el.textContent.includes('<Tasks>')).click();`,
  );
  await inDock(
    page,
    `root.querySelector('[data-solid-ownership-signal] [data-solid-ownership-view-graph]').click();`,
  );
  await expect
    .poll(() =>
      inDock<string | undefined>(
        page,
        `return root.querySelector('[data-solid-reactivity-node="selected"]')?.textContent;`,
      ),
    )
    .toContain('tasks');

  // The graph keeps reading the app after the jump.
  await page.evaluate(() =>
    (document.querySelectorAll('input[type=checkbox]')[0] as HTMLElement).click(),
  );
  // The node prints its name, then its value, then how many read it.
  await expect
    .poll(() =>
      inDock<string[]>(
        page,
        `return [...root.querySelectorAll('[data-solid-reactivity-node]')].map((el) => el.textContent).filter((text) => text.startsWith('done'));`,
      ),
    )
    .toEqual([expect.stringMatching(/^done2/)]);
});
