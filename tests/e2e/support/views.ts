import type { Page } from '@playwright/test';

/**
 * Opens a project view by its name. Write and the views of the template are tabs. The other views sit in
 * the More menu of the tab row (Phase 17 decision S3), so this opens the menu and picks the view there.
 */
export async function openView(page: Page, name: string): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Project views' });
  const tab = nav.getByRole('link', { name, exact: true });
  if ((await tab.count()) > 0 && (await tab.isVisible())) {
    await tab.click();
    return;
  }
  await nav.getByRole('button', { name: 'More views' }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${name}\\b`) }).click();
}
