import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seriousIssues(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function createPoetry(page: Page) {
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('radio', { name: /Poetry collection/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
}

test('create a Poetry project, land on its first poem, and find its card in the Library', async ({
  page,
}) => {
  await page.goto('/');
  await createPoetry(page);
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}\?item=[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Untitled collection' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Poem 1' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  const card = page.getByRole('list', { name: 'Projects' }).getByRole('listitem');
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('link', { name: /Untitled collection/ })).toBeVisible();
  await expect(card.getByText('Poetry collection')).toBeVisible();
  await expect(card.getByText('0 words')).toBeVisible();
});

test('a project stays after reload', async ({ page }) => {
  await page.goto('/');
  await createPoetry(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Poem 1' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Untitled collection/ })).toBeVisible();
});

test('keyboard only: create a Memoir project with a typed title', async ({ page }) => {
  await page.goto('/');
  const newButton = page.getByRole('button', { name: 'New project' });
  await expect(newButton).toBeVisible();
  await newButton.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await expect(dialog.getByRole('radio', { name: /Novel/ })).toBeFocused();
  // Radix checks a radio when focus arrives while an arrow key is down. Playwright's press releases the key
  // before the focus move, so the test holds the key the way a person does.
  await page.keyboard.down('ArrowRight');
  await expect(dialog.getByRole('radio', { name: /Memoir/ })).toBeChecked();
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Title')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Tide Tables');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Tide Tables' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Memory 1' })).toBeVisible();
});

test('rename and delete from the card menu', async ({ page }) => {
  await page.goto('/');
  await createPoetry(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();

  await page.getByRole('button', { name: 'Options for Untitled collection' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename project' });
  await rename.getByLabel('Title').fill('Salt Hours');
  await rename.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: /Salt Hours/ })).toBeVisible();

  await page.getByRole('button', { name: 'Options for Salt Hours' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete Salt Hours?' });
  await confirm.getByRole('button', { name: 'Delete project' }).click();
  await expect(page.getByText('Your projects will live here, on this device.')).toBeVisible();
  const leftovers = await page.evaluate(
    async () => (await indexedDB.databases()).filter((d) => d.name?.startsWith('vlo-item-')).length,
  );
  expect(leftovers).toBe(0);
});

test('an unknown project shows a way back to the Library', async ({ page }) => {
  await page.goto('/p/does-not-exist');
  await expect(page.getByRole('heading', { level: 1, name: 'Project not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the Library' })).toBeVisible();
});

test('the Library with projects and the New project dialog have no serious axe issues', async ({ page }) => {
  await page.goto('/');
  await createPoetry(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('link', { name: /Untitled collection/ })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);

  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('dialog', { name: 'New project' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
});

test('the Library has no horizontal scroll at 360 px with a project', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await createPoetry(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('link', { name: /Untitled collection/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
