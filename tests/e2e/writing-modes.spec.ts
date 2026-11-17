import { expect, test } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding, writeWithoutAccount } from './support/onboarding';
import { openView } from './support/views';

// A signed-out visit opens on the sign-in screen; these tests write with no account.
test.beforeEach(async ({ page }) => {
  await writeWithoutAccount(page);
});

/* Phase 17 Q-B: research papers, articles and essays start from a structure with a guide for each section. */

test('a research paper starts from IMRaD, each section shows its guide, and References lists the sources', async ({
  page,
  isMobile,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Research paper/ }).click();
  const structure = dialog.getByLabel('Start the research paper from');
  await expect(structure).toHaveValue('imrad');
  await expect(dialog).toContainText('Abstract, Introduction, Methods, Results, Discussion');
  await structure.selectOption('lab-report');
  await expect(dialog).toContainText('Aim, materials, procedure');
  await structure.selectOption('imrad');
  await expect(dialog.getByLabel('Title')).toHaveValue('Untitled paper');
  expect(await seriousIssues(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Create project' }).click();

  const abstract = page.getByRole('textbox', { name: 'Abstract' });
  await expect(abstract).toBeFocused();
  const guide = page.getByTestId('section-guide');
  await expect(guide).toContainText('the question, the method, the main result');
  await expect(guide).toContainText('Under the range: 150–250 words');
  await abstract.pressSequentially('Tides shape the harbour. ');
  // The guide is not part of the text.
  await expect(abstract).not.toContainText('the main result');

  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  const binder = page.getByRole('navigation', { name: 'Binder' });
  for (const name of ['Introduction', 'Methods', 'Results', 'Discussion', 'Conclusion'])
    await expect(binder.getByRole('button', { name, exact: true })).toBeVisible();
  await binder.getByRole('button', { name: 'References', exact: true }).click();

  const list = page.getByRole('region', { name: 'References' });
  await expect(list).toContainText('No sources yet');
  await list.locator('input[type="file"]').setInputFiles('tests/fixtures/sources/zotero.bib');
  await expect(list.getByRole('listitem')).toHaveCount(4);
  await list.getByLabel('Style').selectOption('mla');
  await expect(page.getByRole('region', { name: 'Works Cited' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
});

test('an essay project adds a ready section from the binder', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Under 600 px the binder is a drawer.');
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Essay/ }).click();
  await dialog.getByLabel('Start the essay from').selectOption('argumentative');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: 'Introduction' })).toBeFocused();

  const binder = page.getByRole('navigation', { name: 'Binder' });
  await expect(
    binder.getByRole('button', { name: 'Counterargument and rebuttal', exact: true }),
  ).toBeVisible();
  await binder.getByRole('button', { name: 'Add to binder' }).click();
  await page.getByRole('menuitem', { name: 'Section with a guide' }).click();
  await page.getByRole('menuitem', { name: 'Acknowledgements' }).click();
  await expect(page.getByRole('textbox', { name: 'Acknowledgements' })).toBeFocused();
  await expect(page.getByTestId('section-guide')).toContainText('Thank the people');
});

test('a comedy project starts from a stand-up set, plays a rimshot, and finds its punch words', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Comedy/ }).click();
  await expect(dialog.getByLabel('Start the comedy from')).toHaveValue('stand-up');
  await expect(dialog.getByLabel('Title')).toHaveValue('Untitled comedy');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  const opener = page.getByRole('textbox', { name: 'Opener' });
  await expect(opener).toBeFocused();
  await expect(page.getByTestId('section-guide')).toContainText('first 15 seconds');
  await opener.pressSequentially('My dog files my taxes. He is a good boy.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/rimshot');
  await page.keyboard.press('Enter');
  await expect(page.locator('.vlo-rimshot')).toHaveText('ba-dum-tss!');
  await expect(opener).not.toContainText('/rimshot');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');

  await openView(page, 'Workshop');
  await expect(page.getByRole('region', { name: 'Opener' }).getByRole('strong')).toHaveText('boy.');
  await page
    .getByRole('group', { name: 'Workshop tool' })
    .getByRole('button', { name: 'Premise machine' })
    .click();
  await expect(page.getByText(/^What if .+\?$/)).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
});
