import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Phase 19, Task F1: links between items, and backlinks. */

const binder = (page: Page) => page.getByRole('navigation', { name: 'Binder' });
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function itemMenu(page: Page, title: string, action: string) {
  await binder(page)
    .getByRole('button', { name: `Options for ${title}` })
    .click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

test('a link shows the current title, opens its item, shows in Links here, and goes quiet when its item goes', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'The binder is a drawer on a phone; the links themselves do not change.');
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 1' })).toBeVisible();
  await itemMenu(page, 'Chapter 1', 'Add Scene inside');
  const scene2 = page.getByRole('textbox', { name: 'Scene 2' });
  await expect(scene2).toBeFocused();

  // "[[" lists the items, and a choice makes a link.
  await page.keyboard.type('See [[');
  const list = page.getByRole('listbox', { name: 'Items and headings' });
  await expect(list).toBeVisible();
  await page.keyboard.type('scene 1');
  await list.getByRole('option', { name: /^Scene 1/ }).click();
  const link = scene2.locator('.vlo-item-link');
  await expect(link).toHaveText('Scene 1');
  // With the caret after the link, the line under the toolbar names it and offers its tools.
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('Link to “Scene 1”.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open beside' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await page.keyboard.press('End');
  await page.keyboard.type('next.');

  // A rename changes the link at once.
  await itemMenu(page, 'Scene 1', 'Rename');
  const rename = page.getByRole('dialog', { name: 'Rename' });
  await rename.getByLabel('Title').fill('The Harbour');
  await rename.getByRole('button', { name: 'Save' }).click();
  await expect(link).toHaveText('The Harbour');

  // A click opens the item, and Links here lists the item that links to it.
  await link.click();
  await expect(page.getByRole('heading', { level: 2, name: 'The Harbour' })).toBeVisible();
  await page.getByRole('button', { name: 'Show details' }).click();
  const details = page.getByRole('complementary', { name: 'Details' });
  const here = details.getByRole('region', { name: 'Links here' });
  await expect(here.getByRole('button', { name: 'Scene 2' })).toBeVisible();
  await here.getByRole('button', { name: 'Scene 2' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 2' })).toBeVisible();

  // Ctrl or ⌘ as you click opens the item beside.
  await link.click({ modifiers: [mod] });
  await expect(
    page.getByRole('region', { name: 'Beside' }).getByRole('textbox', { name: 'The Harbour' }),
  ).toBeVisible();
  await page.getByRole('region', { name: 'Beside' }).getByRole('button', { name: 'Close pane' }).click();

  // A link to a deleted item is quiet, and "Remove link" keeps its words.
  await itemMenu(page, 'The Harbour', 'Delete');
  await page
    .getByRole('alertdialog', { name: 'Delete The Harbour?' })
    .getByRole('button', { name: 'Delete item' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Scene 2' })).toBeVisible();
  await expect(link).toHaveClass(/vlo-item-link-broken/);
  await link.click();
  await expect(page.getByText('This link goes to an item that the project no longer has.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove link' }).click();
  await expect(link).toHaveCount(0);
  await expect(scene2).toHaveText('See The Harbour next.');
});
