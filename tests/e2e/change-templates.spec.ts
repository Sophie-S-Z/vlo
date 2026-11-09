import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task G5 (roadmap F35): add and remove templates after a project is made. */

const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Templates of Salt Year' });
const stages = (page: Page) => page.getByRole('dialog', { name: 'Life stages' });

async function toLibrary(page: Page) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
}

/** Opens Change templates for Salt Year, toggles the templates and saves. */
async function toggleTemplates(page: Page, names: string[]) {
  await page.getByRole('button', { name: 'Options for Salt Year' }).click();
  await page.getByRole('menuitem', { name: 'Change templates' }).click();
  for (const name of names)
    await dialog(page)
      .getByRole('checkbox', { name: new RegExp(`^${name}`) })
      .click();
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(dialog(page)).toBeHidden();
}

async function openTimeline(page: Page) {
  await page.getByRole('link', { name: 'Salt Year', exact: true }).click();
  await views(page).getByRole('link', { name: 'Timeline' }).click();
  await page.getByRole('button', { name: 'Life stages' }).click();
}

test('add Memoir to a novel, remove it, add it back, and its life stages are still there', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const create = page.getByRole('dialog', { name: 'New project' });
  await create.getByLabel('Title').fill('Salt Year');
  await create.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeVisible();
  await expect(views(page).getByRole('link', { name: 'Timeline' })).toHaveCount(0);
  await toLibrary(page);

  await toggleTemplates(page, ['Memoir']);
  await expect(page.getByText('Novel + Memoir')).toBeVisible();
  await openTimeline(page);
  await stages(page).getByLabel('New life stage', { exact: true }).fill('Childhood');
  await stages(page).getByLabel('Starts', { exact: true }).fill('1986');
  await stages(page).getByLabel('Ends', { exact: true }).fill('1997');
  await stages(page).getByRole('button', { name: 'Add life stage' }).click();
  await expect(stages(page).getByLabel('Name of Childhood')).toHaveValue('Childhood');
  await stages(page).getByRole('button', { name: 'Done' }).click();
  await toLibrary(page);

  await toggleTemplates(page, ['Memoir']);
  await page.getByRole('link', { name: 'Salt Year', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeVisible();
  await expect(views(page).getByRole('link', { name: 'Timeline' })).toHaveCount(0);
  await toLibrary(page);

  await toggleTemplates(page, ['Memoir']);
  await openTimeline(page);
  await expect(stages(page).getByLabel('Name of Childhood')).toHaveValue('Childhood');
});

test('a template stays while items need it, and the dialog lists them', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const create = page.getByRole('dialog', { name: 'New project' });
  await create.getByLabel('Title').fill('Salt Year');
  await create.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeVisible();
  await toLibrary(page);

  await page.getByRole('button', { name: 'Options for Salt Year' }).click();
  await page.getByRole('menuitem', { name: 'Change templates' }).click();
  await dialog(page)
    .getByRole('checkbox', { name: /^Open writing/ })
    .click();
  await dialog(page)
    .getByRole('checkbox', { name: /^Novel/ })
    .click();
  const status = dialog(page).getByRole('status');
  await expect(status).toContainText('These items do not fit the templates you picked.');
  await expect(status.getByRole('listitem')).toHaveText(['Chapter 1 (Chapter)', 'Scene 1 (Scene)']);
  await expect(dialog(page).getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(await seriousIssues(page)).toEqual([]);

  await status.getByRole('link', { name: 'Scene 1' }).click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeVisible();
});
