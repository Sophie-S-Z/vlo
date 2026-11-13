import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { openView } from './support/views';

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

  await openView(page, 'Codex');
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

test('F65: a change at Scene 2 shows on the cursor in Scene 2, and not in Scene 1', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Under 600 px the binder is a drawer. codex-changes.test.ts holds the rules.');
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type('Mira rowed out.');
  const binder = page.getByRole('navigation', { name: 'Binder' });
  await binder.getByRole('button', { name: 'Options for Chapter 1' }).click();
  await page.getByRole('menuitem', { name: 'Add Scene inside' }).click();
  const second = page.getByRole('textbox', { name: 'Scene 2' });
  await expect(second).toBeFocused();
  await page.keyboard.type('Mira waits.');

  await openView(page, 'Codex');
  await page.getByRole('textbox', { name: 'Name' }).fill('Mira');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await page.getByRole('textbox', { name: 'Note' }).fill('Ferry pilot.');
  await page.getByRole('button', { name: 'Add a change' }).click();
  const form = page.getByRole('form', { name: 'Add a change' });
  await expect(form.getByLabel('From the scene')).toBeFocused();
  await form.getByLabel('From the scene').selectOption({ label: 'Scene 2' });
  await form.getByLabel('Change').fill('Loses her left eye.');
  expect(await seriousIssues(page)).toEqual([]);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Added the change.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a change' })).toBeFocused();
  await expect(page.getByRole('list', { name: 'Changes at scenes' })).toContainText(
    'Scene 2Loses her left eye.',
  );
  expect(await seriousIssues(page)).toEqual([]);

  await views(page).getByRole('link', { name: 'Write' }).click();
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Show Codex names' }).click();
  const note = page.locator('[data-vlo-cursor-note]');
  await binder.getByRole('button', { name: 'Scene 2', exact: true }).click();
  await second.locator('.vlo-codex').click();
  await expect(note).toHaveText('Mira, character: Ferry pilot. Loses her left eye.');
  await binder.getByRole('button', { name: 'Scene 1', exact: true }).click();
  await scene(page).locator('.vlo-codex').click();
  await expect(note).toHaveText('Mira, character: Ferry pilot.');
});
