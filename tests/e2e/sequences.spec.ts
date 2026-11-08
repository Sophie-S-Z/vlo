import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Task C6: the Collection Sequencer (spec 8.3, F18, US08, E2). A poet keeps named orders of the same
 * poems, moves poems by drag, keys or menu, turns the ring preview, and exports one order.
 */

const status = (page: Page) => page.locator('section > div p[role="status"]');
const cards = (page: Page, order: string) =>
  page.getByRole('list', { name: `Poems in ${order}` }).getByRole('listitem');

async function titlesOf(page: Page, order: string): Promise<string[]> {
  const labels = await cards(page, order).evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label') ?? ''),
  );
  return labels.map((label) => label.replace(/^\d+\. /, ''));
}

/** A new poetry collection with Poems 1 to 3, on its Sequences screen. */
async function newCollection(page: Page, isMobile: boolean) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Poetry/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Poem 1' })).toBeVisible();
  for (const n of [2, 3]) {
    if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
    await page.getByRole('button', { name: 'Add to binder' }).click();
    await page.getByRole('menuitem', { name: 'Poem' }).click();
    await expect(page.getByRole('heading', { level: 2, name: `Poem ${String(n)}` })).toBeVisible();
    if (isMobile) await page.keyboard.press('Escape');
  }
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'Sequences' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Orders of your poems' })).toBeVisible();
}

async function makeOrder(page: Page, name: string) {
  const first = page.getByLabel('Name of the first order');
  if (await first.isVisible()) {
    await first.fill(name);
  } else {
    await page.getByRole('button', { name: 'New order' }).click();
    await page.getByLabel('Name of the new order').fill(name);
  }
  await page.getByRole('button', { name: 'Make order' }).click();
  await expect(status(page)).toHaveText(`Made the order ${name} with 3 poems.`);
  await expect(page.getByRole('button', { name, pressed: true })).toBeVisible();
}

async function menuMove(page: Page, poem: string, move: string) {
  await page.getByRole('button', { name: `Options for ${poem}` }).click();
  await page.getByRole('menuitem', { name: move }).click();
}

test('US08: two orders of the same poems stay independent, after a reload too', async ({
  page,
  isMobile,
}) => {
  await newCollection(page, isMobile);
  await makeOrder(page, 'Chapbook');
  await makeOrder(page, 'Contest');
  await menuMove(page, 'Poem 3', 'Move to the start');
  await expect(status(page)).toHaveText('Poem 3 moved. It is now 1 of 3 in Contest.');
  await menuMove(page, 'Poem 1', 'Move later');
  await expect(status(page)).toHaveText('Poem 1 moved. It is now 3 of 3 in Contest.');
  await expect.poll(() => titlesOf(page, 'Contest')).toEqual(['Poem 3', 'Poem 2', 'Poem 1']);

  await page.getByRole('button', { name: 'Chapbook' }).click();
  await expect.poll(() => titlesOf(page, 'Chapbook')).toEqual(['Poem 1', 'Poem 2', 'Poem 3']);

  await page.reload();
  await page.getByRole('button', { name: 'Contest' }).click();
  await expect(cards(page, 'Contest')).toHaveCount(3);
  await expect.poll(() => titlesOf(page, 'Contest')).toEqual(['Poem 3', 'Poem 2', 'Poem 1']);
  await page.getByRole('button', { name: 'Chapbook' }).click();
  await expect.poll(() => titlesOf(page, 'Chapbook')).toEqual(['Poem 1', 'Poem 2', 'Poem 3']);
  expect(await seriousIssues(page)).toEqual([]);
});

test('the keyboard picks up a poem, moves it and drops it', async ({ page, isMobile }) => {
  await newCollection(page, isMobile);
  await makeOrder(page, 'Chapbook');
  await page.getByRole('button', { name: 'Move Poem 1' }).focus();
  const live = page.locator('[id^="DndLiveRegion"]');
  await page.keyboard.press('Space');
  await expect(live).toHaveText('Picked up Poem 1. It is 1 of 3.');
  // dnd-kit starts to read the arrow keys in a timer after the pick-up. A timer set now runs after it.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  // One column on a phone, and three side by side on a wide screen.
  await page.keyboard.press(isMobile ? 'ArrowDown' : 'ArrowRight');
  await expect(live).toHaveText('Poem 1 is at place 2 of 3.');
  await page.keyboard.press('Space');
  await expect(status(page)).toHaveText('Poem 1 moved. It is now 2 of 3 in Chapbook.');
  await expect.poll(() => titlesOf(page, 'Chapbook')).toEqual(['Poem 2', 'Poem 1', 'Poem 3']);
});

test('the ring turns with the arrow keys, Home and End', async ({ page, isMobile }) => {
  await newCollection(page, isMobile);
  await makeOrder(page, 'Chapbook');
  const ring = page.getByRole('slider', { name: 'Chapbook, 3 poems' });
  const front = page.getByTestId('ring-front');
  await expect(front).toHaveText('1 of 3: Poem 1');
  await ring.focus();
  await page.keyboard.press('ArrowRight');
  await expect(front).toHaveText('2 of 3: Poem 2');
  await expect(ring).toHaveAttribute('aria-valuetext', '2 of 3: Poem 2');
  await page.keyboard.press('End');
  await expect(front).toHaveText('3 of 3: Poem 3');
  await page.keyboard.press('ArrowRight');
  await expect(front).toHaveText('1 of 3: Poem 1');
  await page.keyboard.press('ArrowLeft');
  await expect(front).toHaveText('3 of 3: Poem 3');
  await page.keyboard.press('Home');
  await expect(front).toHaveText('1 of 3: Poem 1');
});

test('copy, rename, delete with undo, and a new poem joins the end of each order', async ({
  page,
  isMobile,
}) => {
  await newCollection(page, isMobile);
  await makeOrder(page, 'Chapbook');
  await menuMove(page, 'Poem 1', 'Move to the end');
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(status(page)).toHaveText('Made Chapbook copy, with the same order as Chapbook.');
  await expect.poll(() => titlesOf(page, 'Chapbook copy')).toEqual(['Poem 2', 'Poem 3', 'Poem 1']);

  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('New name for Chapbook copy').fill('Reading');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(status(page)).toHaveText('Renamed the order to Reading.');
  await expect(page.getByRole('heading', { level: 2, name: 'Reading' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(status(page)).toHaveText('Deleted the order Reading. The poems stay in the binder.');
  await expect(page.getByRole('button', { name: 'Reading' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(status(page)).toHaveText('Restored the order Reading.');
  await expect.poll(() => titlesOf(page, 'Reading')).toEqual(['Poem 2', 'Poem 3', 'Poem 1']);

  // A new poem in the binder joins the end of the order.
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Write' }).click();
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await page.getByRole('button', { name: 'Add to binder' }).click();
  await page.getByRole('menuitem', { name: 'Poem' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Poem 4' })).toBeVisible();
  if (isMobile) await page.keyboard.press('Escape');
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'Sequences' })
    .click();
  await page.getByRole('button', { name: 'Chapbook' }).click();
  await expect(cards(page, 'Chapbook')).toHaveCount(4);
  await expect.poll(() => titlesOf(page, 'Chapbook')).toEqual(['Poem 2', 'Poem 3', 'Poem 1', 'Poem 4']);
});

test('E2: the export of an order holds its poems in that order', async ({ page, isMobile }) => {
  await newCollection(page, isMobile);
  await makeOrder(page, 'Contest');
  await menuMove(page, 'Poem 3', 'Move to the start');
  await expect(status(page)).toHaveText('Poem 3 moved. It is now 1 of 3 in Contest.');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog.getByRole('radio', { name: 'This order: Contest' })).toBeChecked();
  await dialog.getByRole('radio', { name: /Markdown/ }).click();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await download;
  const text = await readFile(await file.path(), 'utf8');
  const at = (title: string) => text.indexOf(`# ${title}`);
  expect(at('Poem 3')).toBeGreaterThan(-1);
  expect(at('Poem 3')).toBeLessThan(at('Poem 1'));
  expect(at('Poem 1')).toBeLessThan(at('Poem 2'));
});

test.describe('with Calm mode on', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('vlo:preferences', JSON.stringify({ theme: 'system', calm: true }));
    });
  });

  test('the ring is a still numbered list, and the menu still moves poems', async ({ page, isMobile }) => {
    await newCollection(page, isMobile);
    await makeOrder(page, 'Chapbook');
    await expect(page.getByRole('slider')).toHaveCount(0);
    const still = page.getByRole('region', { name: 'Order of Chapbook' });
    await expect(still.getByRole('listitem')).toHaveText(['Poem 1', 'Poem 2', 'Poem 3']);
    await menuMove(page, 'Poem 2', 'Move earlier');
    await expect(still.getByRole('listitem')).toHaveText(['Poem 2', 'Poem 1', 'Poem 3']);
    expect(await seriousIssues(page)).toEqual([]);
  });
});
