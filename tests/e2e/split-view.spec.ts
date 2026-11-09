import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task H7 (roadmap F39): the split view. performance.spec.ts holds the keystroke budget with two panes. */

const binder = (page: Page) => page.getByRole('navigation', { name: 'Binder' });
const beside = (page: Page) => page.getByRole('region', { name: 'Beside' });
const saved = (page: Page) => page.getByRole('status').filter({ hasText: /^Saved$/ });
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test.skip(({ isMobile }) => isMobile, 'The split view needs a screen 1024 px wide.');

test('two items open side by side, each saves its own text, and the split stays after reload', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
  await binder(page).getByRole('button', { name: 'Options for Chapter 1' }).click();
  await page.getByRole('menuitem', { name: 'Add Scene inside' }).click();
  const left = page.getByRole('textbox', { name: 'Scene 2' });
  await expect(left).toBeFocused();

  // The open item cannot open beside itself.
  await binder(page).getByRole('button', { name: 'Options for Scene 2' }).click();
  await expect(page.getByRole('menuitem', { name: 'Open', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open beside' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await binder(page).getByRole('button', { name: 'Options for Scene 1' }).click();
  await page.getByRole('menuitem', { name: 'Open beside' }).click();
  const right = beside(page).getByRole('textbox', { name: 'Scene 1' });
  await expect(right).toBeVisible();
  await expect(page).toHaveURL(/beside=/);
  expect(await seriousIssues(page)).toEqual([]);

  await left.click();
  await page.keyboard.type('The tide comes in.');
  await right.click();
  await page.keyboard.type('The lamp goes out.');
  await expect(saved(page)).toHaveCount(2);

  // The command menu acts on the pane whose text has focus.
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(`${mod}+k`);
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('Bold');
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(right.locator('strong')).toHaveText('The lamp goes out.');
  await expect(left.locator('strong')).toHaveCount(0);
  await expect(saved(page)).toHaveCount(2);

  await page.reload();
  await expect(left).toHaveText('The tide comes in.');
  await expect(right).toHaveText('The lamp goes out.');

  await beside(page).getByRole('button', { name: 'Swap panes' }).click();
  await expect(beside(page).getByRole('textbox', { name: 'Scene 2' })).toHaveText('The tide comes in.');
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toHaveText('The lamp goes out.');
  await beside(page).getByRole('button', { name: 'Close pane' }).click();
  await expect(beside(page)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
  await expect(page).not.toHaveURL(/beside=/);
});
