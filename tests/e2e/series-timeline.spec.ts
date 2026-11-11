import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Roadmap 2 F67, plan Task N5: the Timeline list of the Series page. series-timeline.test.ts holds the order. */

const binder = (page: Page) => page.getByRole('navigation', { name: 'Binder' });

async function toLibrary(page: Page) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
}

/** A novel whose Scene 1 has a story date, or none. */
async function novel(page: Page, title: string, date?: string) {
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
  if (date) {
    await binder(page).getByRole('button', { name: 'Options for Scene 1' }).click();
    await page.getByRole('menuitem', { name: 'Story date' }).click();
    const form = page.getByRole('dialog', { name: 'Story date for Scene 1' });
    await form.getByLabel('Story date').fill(date);
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form).toBeHidden();
  }
  await toLibrary(page);
}

async function addToSeries(page: Page, title: string, seriesTitle?: string) {
  await page.getByRole('button', { name: `Options for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Add to a series' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to a series' });
  if (seriesTitle) {
    await dialog.getByLabel('Title of the series').fill(seriesTitle);
    await dialog.getByRole('button', { name: 'Make the series' }).click();
  } else await dialog.getByRole('button', { name: 'Add to the series' }).click();
  await expect(dialog).toBeHidden();
}

test.skip(({ isMobile }) => isMobile, 'Under 600 px the binder is a drawer. binder.spec.ts covers it.');

test('the Series page puts the dated scenes of every book on one timeline, and a row opens its scene', async ({
  page,
}) => {
  await skipOnboarding(page);
  await novel(page, 'Salt', '1994-07-12');
  await novel(page, 'Tide', '1993');
  await novel(page, 'Ebb');
  for (const [title, seriesTitle] of [['Salt', 'Tides'], ['Tide'], ['Ebb']] as const)
    await addToSeries(page, title, seriesTitle);

  await page.getByRole('region', { name: 'Series' }).getByRole('link', { name: 'Tides' }).click();
  const timeline = page.getByRole('region', { name: 'Timeline' });
  const [dated, undated] = [timeline.getByRole('list').first(), timeline.getByRole('list').last()];
  await expect(dated.getByRole('listitem')).toHaveText(['1993Scene 1Tide', 'July 12, 1994Scene 1Salt']);
  await expect(timeline.getByRole('heading', { level: 3, name: 'Undated' })).toBeVisible();
  await expect(undated.getByRole('listitem')).toHaveText(['Scene 1Ebb']);
  expect(await seriousIssues(page)).toEqual([]);

  await dated
    .getByRole('listitem')
    .filter({ hasText: 'Salt' })
    .getByRole('link', { name: 'Scene 1' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Salt' })).toBeVisible();
});
