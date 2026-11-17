import type { Locator, Page } from '@playwright/test';

/**
 * Opens the toolbar menu that holds a tool, and returns the tool's menu item. A tool that is not a button
 * sits in the Insert, Format or Review menu from 640 px, or in the More menu on a phone layout and at the
 * Simple level. `scope` picks one pane of a split view.
 */
export async function openToolMenu(page: Page, name: string, scope: Page | Locator = page): Promise<Locator> {
  const toolbar = scope.getByRole('toolbar', { name: 'Formatting', exact: true });
  // The toolbar comes with the editor, so a test that opens a view and comes back waits for it.
  await toolbar.waitFor();
  // A tool that opens a panel ends its menu name with an ellipsis. A switch is a checkbox item.
  const label = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}…?$`);
  for (const menuName of ['Insert', 'Format', 'Review', 'More tools']) {
    const trigger = toolbar.getByRole('button', { name: menuName, exact: true });
    if (!(await trigger.isVisible())) continue;
    await trigger.click();
    const menu = page.getByRole('menu');
    const item = menu
      .getByRole('menuitem', { name: label })
      .or(menu.getByRole('menuitemcheckbox', { name: label }));
    if ((await item.count()) > 0) return item;
    await page.keyboard.press('Escape');
  }
  throw new Error(`No toolbar tool "${name}".`);
}

/** Runs a toolbar tool by its name: its button when it shows, else its item in the menu that holds it. */
export async function useTool(page: Page, name: string, scope: Page | Locator = page): Promise<void> {
  const toolbar = scope.getByRole('toolbar', { name: 'Formatting', exact: true });
  await toolbar.waitFor();
  const button = toolbar.getByRole('button', { name, exact: true });
  if (await button.isVisible()) {
    await button.click();
    return;
  }
  await (await openToolMenu(page, name, scope)).click();
}
