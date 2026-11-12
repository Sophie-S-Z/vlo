import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { openView } from './support/views';

/*
 * Plan Task C8: the Submissions tracker (spec 8.4, F20, E4). A writer logs the pieces sent to each venue,
 * sorts the table, changes a status in the row, and sees a follow-up flag after the venue's days.
 */

const status = (page: Page) => page.locator('section > div p[role="status"]');
const form = (page: Page) => page.getByRole('form', { name: /Log a submission|Change the submission/ });
const rows = (page: Page) => page.locator('tbody tr');

/** The local date `days` before today, as YYYY-MM-DD, as the date field takes it. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A new poetry collection with Poems 1 and 2, on its Submissions screen. */
async function newCollection(page: Page, isMobile: boolean) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Poetry/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Poem 1' })).toBeVisible();
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await page.getByRole('button', { name: 'Add to binder' }).click();
  await page.getByRole('menuitem', { name: 'Poem' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Poem 2' })).toBeVisible();
  if (isMobile) await page.keyboard.press('Escape');
  await openSubmissions(page);
}

async function openSubmissions(page: Page) {
  await openView(page, 'Submissions');
  await expect(page.getByRole('heading', { level: 2, name: 'Submissions' })).toBeVisible();
}

async function logSubmission(
  page: Page,
  entry: { pieces: string[]; venue: string; sentAt: string; days?: string },
) {
  await page.getByRole('button', { name: 'Log a submission' }).click();
  const f = form(page);
  // The button that opened the form is gone, so focus starts at the form heading.
  await expect(f.getByRole('heading', { name: 'Log a submission' })).toBeFocused();
  for (const piece of entry.pieces) await f.getByRole('checkbox', { name: piece }).check();
  await f.getByLabel('Venue').fill(entry.venue);
  await f.getByLabel('Sent on').fill(entry.sentAt);
  if (entry.days !== undefined) await f.getByLabel('Follow up after (days)').fill(entry.days);
  await f.getByRole('button', { name: 'Log submission' }).click();
  await expect(status(page)).toHaveText(`Logged the submission to ${entry.venue.trim()}.`);
  await expect(form(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Log a submission' })).toBeFocused();
}

const venuesInOrder = (page: Page) =>
  rows(page).evaluateAll((trs) =>
    trs.map((tr) => (tr.children[1]?.textContent ?? '').replace(/^Venue: /, '')),
  );

test('F20: the writer logs submissions, sorts them, and changes a status in the row', async ({
  page,
  isMobile,
}) => {
  await newCollection(page, isMobile);
  await expect(page.getByTestId('submission-summary')).toHaveText(
    'Log each piece you send out: where it went, when, and what came back.',
  );

  // A refused form says why and keeps the typing.
  await page.getByRole('button', { name: 'Log a submission' }).click();
  await form(page).getByLabel('Venue').fill('Agni');
  await form(page).getByRole('button', { name: 'Log submission' }).click();
  await expect(form(page).getByRole('alert')).toHaveText('Choose at least one piece.');
  await expect(form(page).getByLabel('Venue')).toHaveValue('Agni');
  await form(page).getByRole('button', { name: 'Cancel' }).click();

  await logSubmission(page, { pieces: ['Poem 1', 'Poem 2'], venue: 'Agni', sentAt: daysAgo(10) });
  await logSubmission(page, { pieces: ['Poem 2'], venue: 'Ploughshares', sentAt: daysAgo(3) });
  await logSubmission(page, { pieces: ['Poem 1'], venue: 'Bat City Review', sentAt: daysAgo(20) });
  await expect(page.getByTestId('submission-summary')).toHaveText(
    '3 submissions: 3 waiting for a reply, 0 accepted.',
  );

  // Newest first by default, then by venue in both directions.
  await expect.poll(() => venuesInOrder(page)).toEqual(['Ploughshares', 'Agni', 'Bat City Review']);
  if (isMobile) {
    await page.getByLabel('Sort by').selectOption({ label: 'Venue, A to Z or oldest first' });
    await expect.poll(() => venuesInOrder(page)).toEqual(['Agni', 'Bat City Review', 'Ploughshares']);
    await page.getByLabel('Sort by').selectOption({ label: 'Venue, Z to A or newest first' });
  } else {
    const venue = page.getByRole('columnheader', { name: 'Venue' });
    await venue.getByRole('button').click();
    await expect(venue).toHaveAttribute('aria-sort', 'ascending');
    await expect.poll(() => venuesInOrder(page)).toEqual(['Agni', 'Bat City Review', 'Ploughshares']);
    await venue.getByRole('button').click();
    await expect(venue).toHaveAttribute('aria-sort', 'descending');
  }
  await expect.poll(() => venuesInOrder(page)).toEqual(['Ploughshares', 'Bat City Review', 'Agni']);

  // A status change in the row saves at once and tints the row.
  await page.getByLabel('Status of Poem 1, Poem 2 at Agni').selectOption('accepted');
  await expect(status(page)).toHaveText('Poem 1, Poem 2 at Agni: Accepted.');
  await expect(rows(page).filter({ hasText: 'Agni' })).toHaveClass(/vlo-sub-accepted/);
  await expect(page.getByTestId('submission-summary')).toHaveText(
    '3 submissions: 2 waiting for a reply, 1 accepted.',
  );

  // A change through the form keeps the other fields.
  await page.getByRole('button', { name: 'Change the submission of Poem 2 to Ploughshares' }).click();
  await expect(form(page).getByRole('checkbox', { name: 'Poem 2' })).toBeChecked();
  await form(page).getByLabel('Reply on').fill(daysAgo(1));
  await form(page).getByLabel('Status').selectOption('declined');
  await form(page).getByLabel('Notes').fill('Kind note from the editor.');
  await form(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(status(page)).toHaveText('Saved the changes to Ploughshares.');
  const ploughshares = rows(page).filter({ hasText: 'Ploughshares' });
  await expect(ploughshares).toContainText('Kind note from the editor.');
  await expect(ploughshares).toHaveClass(/vlo-sub-closed/);

  await page.reload();
  await expect.poll(() => venuesInOrder(page)).toEqual(['Ploughshares', 'Agni', 'Bat City Review']);
  await expect(page.getByLabel('Status of Poem 1, Poem 2 at Agni')).toHaveValue('accepted');
  expect(await seriousIssues(page)).toEqual([]);
});

test('E4: a sent piece with no reply after the venue days gets a follow-up flag', async ({
  page,
  isMobile,
}) => {
  await newCollection(page, isMobile);
  await logSubmission(page, { pieces: ['Poem 1'], venue: 'Agni', sentAt: daysAgo(100) });
  const agni = rows(page).filter({ hasText: 'Agni' });
  await expect(agni).toHaveAttribute('data-follow-up', 'true');
  await expect(agni.getByText('Follow up', { exact: true })).toBeVisible();
  await expect(page.getByTestId('submission-summary')).toHaveText(
    '1 submission: 1 waiting for a reply, 0 accepted, 1 to follow up.',
  );
  // The tinted row keeps its text contrast in each theme.
  for (const theme of ['paper', 'ink', 'sepia']) {
    await page.evaluate((name) => {
      document.documentElement.dataset.theme = name;
    }, theme);
    expect(await seriousIssues(page), theme).toEqual([]);
  }

  // The venue keeps its own days. " agni " is the same venue, so a new row fills in the same days.
  await page.getByRole('button', { name: 'Change the submission of Poem 1 to Agni' }).click();
  await expect(form(page).getByLabel('Follow up after (days)')).toHaveValue('90');
  await form(page).getByLabel('Follow up after (days)').fill('120');
  await form(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(status(page)).toHaveText('Saved the changes to Agni.');
  await expect(agni).not.toHaveAttribute('data-follow-up');
  await expect(agni.getByText('Follow up', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Log a submission' }).click();
  await form(page).getByLabel('Venue').fill(' agni ');
  await expect(form(page).getByLabel('Follow up after (days)')).toHaveValue('120');
  await form(page).getByLabel('Follow up after (days)').fill('0');
  await form(page).getByRole('checkbox', { name: 'Poem 2' }).check();
  await form(page).getByRole('button', { name: 'Log submission' }).click();
  await expect(form(page).getByRole('alert')).toHaveText(
    'Type a number of days from 1 to 3650 for the follow-up.',
  );
  await form(page).getByRole('button', { name: 'Cancel' }).click();

  // A reply ends the flag, whatever the days.
  await page.getByLabel('Status of Poem 1 at Agni').selectOption('no-reply');
  await expect(agni).not.toHaveAttribute('data-follow-up');
});

test('a deleted piece shows as "Deleted piece", and a deleted row comes back with Undo', async ({
  page,
  isMobile,
}) => {
  await newCollection(page, isMobile);
  await logSubmission(page, { pieces: ['Poem 1', 'Poem 2'], venue: 'Agni', sentAt: daysAgo(5) });

  // The piece title opens the piece.
  await rows(page).getByRole('link', { name: 'Poem 2' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Poem 2' })).toBeVisible();
  if (isMobile) await page.getByRole('button', { name: 'Binder' }).click();
  await page.getByRole('button', { name: 'Options for Poem 2' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('alertdialog', { name: 'Delete Poem 2?' })
    .getByRole('button', { name: 'Delete item' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Poem 1' })).toBeVisible();
  if (isMobile) await page.keyboard.press('Escape');
  await openSubmissions(page);

  const agni = rows(page).filter({ hasText: 'Agni' });
  await expect(agni.locator('td').first()).toHaveText('Poem 1, Deleted piece');
  await page.getByRole('button', { name: 'Change the submission of Poem 1, Deleted piece to Agni' }).click();
  await expect(form(page)).toContainText('One piece of this row left the binder.');
  await form(page).getByRole('button', { name: 'Cancel' }).click();
  // Cancel puts focus back on the button that opened the form.
  await expect(
    page.getByRole('button', { name: 'Change the submission of Poem 1, Deleted piece to Agni' }),
  ).toBeFocused();

  await page.getByRole('button', { name: 'Delete the submission of Poem 1, Deleted piece to Agni' }).click();
  await expect(status(page)).toHaveText('Deleted the submission to Agni.');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(status(page)).toHaveText('Restored the submission to Agni.');
  await expect(
    page.getByRole('button', { name: 'Change the submission of Poem 1, Deleted piece to Agni' }),
  ).toBeFocused();
  await expect(rows(page)).toHaveCount(1);
  await expect(agni.locator('td').first()).toHaveText('Poem 1, Deleted piece');
});

test('every template has the Submissions tab, and the command palette opens it', async ({ page }) => {
  await skipOnboarding(page);
  for (const template of [/Novel/, /Memoir/]) {
    await page.goto('/');
    await page.getByRole('button', { name: 'New project' }).click();
    const dialog = page.getByRole('dialog', { name: 'New project' });
    await dialog.getByRole('checkbox', { name: template }).click();
    await dialog.getByRole('button', { name: 'Create project' }).click();
    const tabs = page.getByRole('navigation', { name: 'Project views' }).getByRole('link');
    await expect(tabs.nth(-2)).toHaveText('Submissions');
    await expect(tabs.last()).toHaveText('Progress');
    await expect(tabs.first()).toHaveAttribute('aria-current', 'page');
  }
  await page.keyboard.press('ControlOrMeta+k');
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('Open Submissions');
  await menu.getByRole('option', { name: 'Open Submissions' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Submissions' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Submissions' }),
  ).toHaveAttribute('aria-current', 'page');
  expect(await seriousIssues(page)).toEqual([]);
});
