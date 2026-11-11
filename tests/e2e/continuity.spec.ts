import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Roadmap 2 F66, plan Task N3: the continuity check. continuity.test.ts holds the rules. */

const scene = (page: Page) => page.getByRole('textbox', { name: 'Scene 1' });
const views = (page: Page) => page.getByRole('navigation', { name: 'Project views' });

test('the continuity check is off at first, marks a near name with its reason, and "Not a problem" keeps it', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(scene(page)).toBeFocused();
  await page.keyboard.type('The boat took Mria home.');
  await views(page).getByRole('link', { name: 'Codex' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Mira');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Mira' })).toBeVisible();

  await views(page).getByRole('link', { name: 'Write' }).click();
  // The word count rolls after the save, so the axe check below never meets a half-faded count.
  await expect(page.getByText('5 words', { exact: true })).toBeVisible();
  const mark = scene(page).locator('.vlo-continuity');
  await expect(mark).toHaveCount(0);
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Continuity check' }).click();
  await expect(mark).toHaveText(['Mria']);

  await mark.click();
  await expect(page.locator('[data-vlo-cursor-note]')).toHaveText(
    '“Mria” is one letter away from “Mira”, a Codex name.',
  );
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('button', { name: 'Not a problem' }).click();
  await expect(mark).toHaveCount(0);
  await expect(scene(page)).toBeFocused();
  await expect(scene(page)).toHaveText('The boat took Mria home.');
});
