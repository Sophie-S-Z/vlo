import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Plan Task H5 (roadmap F42): the Codex. codex.test.ts and views-data.test.ts hold the backup round trip. */

const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' });
const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });

test('a Codex entry marks its names in the text, shows on the cursor, and counts in the matrix', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type("Mira rowed out. Mi's oar broke.");

  await views(page).getByRole('link', { name: 'Codex' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Codex' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Name' }).fill('Mira');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Mira' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Other names' }).fill('Mi');
  await page.getByRole('textbox', { name: 'Note' }).click();
  await page.getByRole('textbox', { name: 'Note' }).fill('Owes the harbour master.');
  await page.getByRole('heading', { level: 2, name: 'Codex' }).click();
  await expect(page.getByText('2 mentions in the text')).toBeVisible();
  const matrix = page.getByRole('region', { name: 'Mentions' });
  await expect(matrix.getByRole('row', { name: /Mira/ }).getByRole('cell')).toHaveText(['2']);
  expect(await seriousIssues(page)).toEqual([]);

  await views(page).getByRole('link', { name: 'Write' }).click();
  // The browser does not check the spelling of a Codex name.
  await expect(scene(page).locator('[spellcheck="false"]')).toHaveText(['Mira', 'Mi']);
  await expect(scene(page).locator('.vlo-codex')).toHaveCount(0);

  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Show Codex names' }).click();
  const names = scene(page).locator('.vlo-codex');
  await expect(names).toHaveText(['Mira', 'Mi']);
  await names.first().click();
  await expect(page.locator('[data-vlo-cursor-note]')).toHaveText(
    'Mira, character: Owes the harbour master.',
  );
});
