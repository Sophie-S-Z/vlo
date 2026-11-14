import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { openView } from './support/views';

/* Phase 17 Q-D: the Workshop, with deeper tools for poetry collections, essays, articles and papers. */

const tool = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Workshop tool' }).getByRole('button', { name, exact: true });

async function newProject(page: Page, mode: RegExp) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: mode }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
}

async function saved(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
}

test('a poetry collection makes an erasure and a golden shovel, and finds its echoes', async ({
  page,
  isMobile,
}) => {
  await newProject(page, /Poetry/);
  const first = page.getByRole('textbox', { name: 'Poem 1' });
  await expect(first).toBeFocused();
  await page.keyboard.type('The tide came in, slow as a held');
  await page.keyboard.press('Enter');
  await page.keyboard.type('breath, and the boats lay down.');
  await saved(page);
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await page.getByRole('button', { name: 'Add to binder' }).click();
  await page.getByRole('menuitem', { name: 'Poem' }).click();
  if (isMobile) await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: 'Poem 2' }).click();
  await page.keyboard.type('Salt on the tides of');
  await saved(page);

  await openView(page, 'Workshop');
  await expect(page).toHaveTitle(/Workshop/);
  await expect(tool(page, 'Erasure')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Source', { exact: true })).toHaveValue(/.+/);
  const words = page.getByRole('group', { name: 'Words of the source' });
  for (const word of ['tide', 'held', 'breath'])
    await words.getByRole('button', { name: word, exact: true }).click();
  await expect(words.getByRole('button', { name: 'tide', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Each kept word stays at its column, and the comma after "breath" stays.
  await expect(page.getByLabel('The erasure', { exact: true })).toHaveText(
    `${' '.repeat(4)}tide${' '.repeat(20)}held\nbreath,`,
  );
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('button', { name: 'Make the poem' }).click();
  await expect(page.getByRole('textbox', { name: 'Erasure of Poem 1' })).toBeVisible();

  await openView(page, 'Workshop');
  await tool(page, 'Golden shovel').click();
  await page.getByLabel('The line you borrow').fill('We real cool.');
  await page.getByLabel('Its poet').fill('Gwendolyn Brooks');
  await page.getByLabel('Stanzas').selectOption({ label: 'Couplets' });
  await expect(page.getByLabel('The golden shovel to write into')).toHaveText(
    'We real cool.\nafter Gwendolyn Brooks\n\nWe\nreal\n\ncool',
  );
  expect(await seriousIssues(page)).toEqual([]);

  await tool(page, 'Echoes').click();
  const echoes = page.getByRole('list', { name: 'Echoes' });
  await expect(echoes.getByRole('listitem').first()).toContainText('tide');
  await expect(echoes.getByRole('listitem').first()).toContainText('in 3 poems');

  await tool(page, 'Line endings').click();
  await page.getByLabel('Poem', { exact: true }).selectOption({ label: 'Poem 2' });
  await expect(page.getByRole('status').filter({ hasText: /lines?:/ })).toContainText(
    '1 line: 0 end on a pause, 1 run on. 1 end on a small word',
  );
  expect(await seriousIssues(page)).toEqual([]);
});

test('an article finds the Workshop from the command menu, with its spine and headlines', async ({
  page,
}) => {
  await newProject(page, /Article/);
  await expect(page.getByRole('textbox', { name: 'Post' })).toBeFocused();
  await page.keyboard.type('Ferries shaped the coast for a century. They carried the mail.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Without them, the islands emptied out. The rest followed.');
  await saved(page);

  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox').fill('headline');
  await page.getByRole('option', { name: 'Open Headlines in the Workshop' }).click();
  await expect(tool(page, 'Headlines')).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Headline idea').fill('The last ferry');
  await page.getByRole('button', { name: 'Add the idea' }).click();
  const ideas = page.getByRole('list', { name: 'Headline ideas' });
  await expect(ideas).toContainText('14 characters, 3 words');
  await expect(ideas).toContainText('A very short headline');
  await ideas.getByRole('button', { name: 'Use as the title' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The last ferry');
  await expect(ideas).toContainText('This is the title now.');
  // The rename reaches the page, and the tool stays open with its message.
  await expect(page.getByRole('status').filter({ hasText: 'The title is now' })).toContainText(
    'The last ferry',
  );

  await tool(page, 'Spine').click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Ferries shaped the coast' })).toHaveText(
    'Ferries shaped the coast for a century.',
  );
  await expect(page.getByText('Without them, the islands emptied out.', { exact: true })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
});

test('a research paper lists the sources that its text does not cite', async ({ page, isMobile }) => {
  await newProject(page, /Research paper/);
  await expect(page.getByRole('textbox', { name: 'Abstract' })).toBeFocused();
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await page
    .getByRole('navigation', { name: 'Binder' })
    .getByRole('button', { name: 'References', exact: true })
    .click();
  const list = page.getByRole('region', { name: 'References' });
  await list.locator('input[type="file"]').setInputFiles('tests/fixtures/sources/zotero.bib');
  await expect(list.getByRole('listitem')).toHaveCount(4);

  await openView(page, 'Workshop');
  await tool(page, 'Citation check').click();
  await expect(page.getByRole('status').filter({ hasText: /cited/ })).toHaveText('0 of 4 sources cited.');
  await expect(page.getByRole('region', { name: 'Not cited' }).getByRole('listitem')).toHaveCount(4);
  expect(await seriousIssues(page)).toEqual([]);
});
