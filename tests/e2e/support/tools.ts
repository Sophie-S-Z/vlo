import type { Page } from '@playwright/test';

/**
 * Runs a toolbar tool by its name. Under 640 px the wide tool groups sit in the More menu, so on a phone
 * layout this opens More tools and picks the tool there.
 */
export async function useTool(page: Page, name: string): Promise<void> {
  const toolbar = page.getByRole('toolbar', { name: 'Formatting', exact: true });
  const button = toolbar.getByRole('button', { name, exact: true });
  if (await button.isVisible()) {
    await button.click();
    return;
  }
  await toolbar.getByRole('button', { name: 'More tools' }).click();
  const menu = page.getByRole('menu');
  // A tool that opens a panel ends its menu name with an ellipsis. A switch is a checkbox item.
  const label = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}…?$`);
  await menu
    .getByRole('menuitem', { name: label })
    .or(menu.getByRole('menuitemcheckbox', { name: label }))
    .click();
}
