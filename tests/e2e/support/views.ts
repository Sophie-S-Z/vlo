import { expect, type Page } from '@playwright/test';

/** The views that sit in the More menu of the tab row (Phase 17 decision S3), unless one is on show. */
const MORE_VIEWS = ['Workshop', 'Outline', 'Codex', 'Feedback', 'Book', 'Submissions', 'Progress'];

/**
 * Opens a project view by its name. Write and the views of the template are tabs. The other views sit in
 * the More menu of the tab row, so this opens the menu and picks the view there. The view on show has a
 * tab of its own.
 */
export async function openView(page: Page, name: string): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Project views' });
  const tab = nav.getByRole('link', { name, exact: true });
  if (!MORE_VIEWS.includes(name)) {
    await tab.click();
    return;
  }
  await expect(nav).toBeVisible();
  if ((await tab.count()) > 0) {
    await tab.click();
    return;
  }
  await nav.getByRole('button', { name: 'More views' }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${name}\\b`) }).click();
}
