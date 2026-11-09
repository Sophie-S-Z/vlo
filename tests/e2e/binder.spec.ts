import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

const binder = (page: Page) => page.getByRole('navigation', { name: 'Binder' });
const titles = (page: Page) => binder(page).locator('[data-binder-title]').allTextContents();

/** A novel with Chapter 1 holding Scene 1 and Scene 2. */
async function novelWithTwoScenes(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
  await binder(page).getByRole('button', { name: 'Options for Chapter 1' }).click();
  await page.getByRole('menuitem', { name: 'Add Scene inside' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 2' })).toBeVisible();
  // The new scene's editor takes the focus once it loads, and that can scroll the page. The tests start after.
  await expect(page.getByRole('textbox', { name: 'Scene 2' })).toBeFocused();
  expect(await titles(page)).toEqual(['Chapter 1', 'Scene 1', 'Scene 2']);
}

// Phones get the binder as a drawer. The drawer tests at the end of this file cover them.
test.describe('wide screens', () => {
  test.skip(({ isMobile }) => isMobile, 'Under 600 px the binder is a drawer.');

  test('mouse: drag Scene 2 above Scene 1, and the order stays after reload', async ({ page }) => {
    await novelWithTwoScenes(page);
    const handle = binder(page).getByRole('button', { name: 'Move Scene 2' });
    const target = binder(page).getByRole('button', { name: 'Move Scene 1' });
    // The hover scrolls the row into view first, so the boxes below stay true while the mouse moves.
    await handle.hover();
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error('rows not laid out');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 4, { steps: 10 });
    await expect(binder(page).getByRole('status').filter({ hasText: 'is over' })).toHaveText(
      'Scene 2 is over Scene 1.',
    );
    await page.mouse.up();
    await expect.poll(() => titles(page)).toEqual(['Chapter 1', 'Scene 2', 'Scene 1']);
    await page.reload();
    await expect.poll(() => titles(page)).toEqual(['Chapter 1', 'Scene 2', 'Scene 1']);
  });

  test('keyboard: Space lifts, ArrowUp moves, Space drops, and the move is announced', async ({ page }) => {
    await novelWithTwoScenes(page);
    await binder(page).getByRole('button', { name: 'Move Scene 2' }).focus();
    const live = binder(page).getByRole('status');
    await page.keyboard.press('Space');
    await expect(live.filter({ hasText: 'Picked up' })).toHaveText('Picked up Scene 2.');
    // dnd-kit starts to read the arrow keys in a timer after the pick-up. A timer set now runs after it.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await page.keyboard.press('ArrowUp');
    await expect(live.filter({ hasText: 'is over' })).toHaveText('Scene 2 is over Scene 1.');
    await page.keyboard.press('Space');
    await expect.poll(() => titles(page)).toEqual(['Chapter 1', 'Scene 2', 'Scene 1']);
    await expect(live.filter({ hasText: 'moved' })).toHaveText(
      'Scene 2 moved. It is now 1 of 2 in Chapter 1.',
    );
    await page.reload();
    await expect.poll(() => titles(page)).toEqual(['Chapter 1', 'Scene 2', 'Scene 1']);
  });

  test('menu: Move up, then Move down, for screen reader users', async ({ page }) => {
    await novelWithTwoScenes(page);
    await binder(page).getByRole('button', { name: 'Options for Scene 2' }).click();
    await page.getByRole('menuitem', { name: 'Move up' }).click();
    await expect.poll(() => titles(page)).toEqual(['Chapter 1', 'Scene 2', 'Scene 1']);
    await binder(page).getByRole('button', { name: 'Options for Scene 2' }).click();
    await page.getByRole('menuitem', { name: 'Move down' }).click();
    await expect.poll(() => titles(page)).toEqual(['Chapter 1', 'Scene 1', 'Scene 2']);
  });
});

test('touch: long-press and move reorders on a touch screen', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Touch input comes from the Chromium DevTools Protocol.');
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1024, height: 800 } });
  const page = await context.newPage();
  await novelWithTwoScenes(page);
  const from = await binder(page).getByRole('button', { name: 'Move Scene 2' }).boundingBox();
  const to = await binder(page).getByRole('button', { name: 'Move Scene 1' }).boundingBox();
  if (!from || !to) throw new Error('rows not laid out');
  const cdp = await context.newCDPSession(page);
  const point = (x: number, y: number) => [{ x, y, id: 1 }];
  const x = from.x + from.width / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x, from.y + 20) });
  await page.waitForTimeout(400);
  for (let y = from.y + 20; y >= to.y + 4; y -= 6) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x, y) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => titles(page)).toEqual(['Chapter 1', 'Scene 2', 'Scene 1']);
  await context.close();
});

test.describe('wide screens, item menu', () => {
  test.skip(({ isMobile }) => isMobile, 'Under 600 px the binder is a drawer.');

  test('each item shows its status and synopsis, and the item menu changes them', async ({ page }) => {
    await novelWithTwoScenes(page);
    const row = binder(page).getByRole('listitem').filter({ hasText: 'Scene 1' });
    await expect(row.getByText('Draft')).toBeVisible();
    await binder(page).getByRole('button', { name: 'Options for Scene 1' }).click();
    await page.getByRole('menuitem', { name: 'Status' }).click();
    await page.getByRole('menuitemradio', { name: 'Revised' }).click();
    await expect(row.getByText('Revised')).toBeVisible();

    await binder(page).getByRole('button', { name: 'Options for Scene 1' }).click();
    await page.getByRole('menuitem', { name: 'Edit synopsis' }).click();
    const dialog = page.getByRole('dialog', { name: 'Synopsis for Scene 1' });
    await dialog.getByLabel('Synopsis').fill('Mira finds the ledger.');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(row.getByText('Mira finds the ledger.')).toBeVisible();
    await page.reload();
    await expect(binder(page).getByText('Mira finds the ledger.')).toBeVisible();
  });

  test('deleting the open item opens another and removes its stored text', async ({ page }) => {
    await novelWithTwoScenes(page);
    await expect(page.getByRole('heading', { level: 2, name: 'Scene 2' })).toBeVisible();
    const itemId = new URL(page.url()).searchParams.get('item');
    await binder(page).getByRole('button', { name: 'Options for Scene 2' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
      .getByRole('alertdialog', { name: 'Delete Scene 2?' })
      .getByRole('button', { name: 'Delete item' })
      .click();
    await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
    expect(await titles(page)).toEqual(['Chapter 1', 'Scene 1']);
    const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    expect(names).not.toContain(`vlo-item-${itemId ?? ''}`);
  });
});

test('under 600 px the binder opens as a drawer, and picking an item closes it', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await novelWithTwoScenesSmall(page);
  await page.getByRole('button', { name: 'Binder' }).click();
  await binder(page).getByRole('button', { name: 'Scene 1', exact: true }).click();
  await expect(binder(page)).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the project screen with its binder has no serious axe issues', async ({ page, isMobile }) => {
  if (isMobile) {
    await novelWithTwoScenesSmall(page);
    await page.getByRole('button', { name: 'Binder' }).click();
  } else {
    await novelWithTwoScenes(page);
  }
  expect(await seriousIssues(page)).toEqual([]);
});

/** The same setup as novelWithTwoScenes, through the phone drawer. */
async function novelWithTwoScenesSmall(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Binder' }).click();
  await binder(page).getByRole('button', { name: 'Options for Chapter 1' }).click();
  await page.getByRole('menuitem', { name: 'Add Scene inside' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 2' })).toBeVisible();
}
