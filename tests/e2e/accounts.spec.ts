import { expect, test, type Page } from '@playwright/test';
import { CODE } from '../fixtures/fakeAccounts';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';
import { fakeSupabase } from './support/share';

/*
 * Phase 18 (decisions A1 to A7): a writer signs in on a laptop and a phone and finds every project on
 * both; the daily count; feedback; and the owner page. The server is the fake of tests/fixtures.
 */

// Playwright routes the fake Supabase requests only with no service worker, as in the reader tests.
test.use({ serviceWorkers: 'block' });

const projects = (page: Page) => page.getByRole('list', { name: 'Projects' }).getByRole('listitem');

async function signIn(page: Page, email: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Vlo sent a code' })).toBeVisible();
  await page.getByLabel('Code from the email').fill(CODE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Account' }),
  ).toBeVisible();
}

async function syncNow(page: Page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Synced\.$/ })).toBeVisible();
}

async function newProject(page: Page, poetry: boolean, words: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  if (poetry) await dialog.getByRole('checkbox', { name: /Poetry collection/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox').first()).toBeFocused();
  await page.keyboard.type(words);
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
}

test('a writer signs in on a laptop and a phone, and both keep every project', async ({ browser }) => {
  test.setTimeout(120_000);
  const laptopContext = await browser.newContext();
  const fake = await fakeSupabase(laptopContext);
  const laptop = await laptopContext.newPage();
  await skipOnboarding(laptop);
  await newProject(laptop, false, 'The harbour lights came on.');

  await signIn(laptop, 'mira@example.com');
  expect(await seriousIssues(laptop)).toEqual([]);
  // A sign-in turns sync on by itself.
  const sync = laptop.getByRole('region', { name: 'Sync on all your devices' });
  await expect(sync.getByRole('status')).toHaveText(
    'Sync is on. Sign in on your other devices with the same email.',
  );
  await expect(sync).toContainText('This device syncs with your account.');
  await syncNow(laptop);
  expect(fake.accounts?.vaults.size).toBe(1);
  // The relay gets sealed copies only.
  expect(JSON.stringify(fake.calls.filter((c) => c.name === 'sync_put'))).not.toContain('harbour');

  const phoneContext = await browser.newContext();
  await fakeSupabase(phoneContext, fake);
  const phone = await phoneContext.newPage();
  await skipOnboarding(phone);
  await newProject(phone, true, 'Gulls on the wall');
  await signIn(phone, 'mira@example.com');
  const phoneSync = phone.getByRole('region', { name: 'Sync on all your devices' });
  await expect(phoneSync.getByRole('status')).toHaveText(
    'This device syncs now. Your projects come to the Library.',
  );
  await syncNow(phone);
  await syncNow(laptop);

  for (const page of [laptop, phone]) {
    await page.goto('/');
    await expect(projects(page)).toHaveCount(2);
    await expect(projects(page).getByRole('link', { name: /Untitled collection/ })).toBeVisible();
  }

  // Stop sync on the laptop in Settings: the Account page keeps it off until the writer asks again.
  await laptop.goto('/settings');
  await laptop.getByRole('button', { name: 'Stop sync on this device' }).click();
  await expect(laptop.getByRole('status').filter({ hasText: 'Sync stopped on this device' })).toBeVisible();
  await laptop.goto('/account');
  await expect(sync).toContainText('You stopped sync on this device in Settings.');
  await laptop.goto('/settings');
  await expect(laptop.getByRole('button', { name: 'Sync my writing' })).toBeVisible();
  await laptop.goto('/account');
  await sync.getByRole('button', { name: 'Sync this device with my account' }).click();
  await expect(sync).toContainText('This device syncs with your account.');

  // Sign out on the phone: it stops sync and keeps both projects.
  await phone.goto('/account');
  await phone.getByRole('button', { name: 'Sign out' }).click();
  await expect(phone.getByRole('button', { name: 'Send me a code' })).toBeVisible();
  await phone.goto('/');
  await expect(projects(phone)).toHaveCount(2);
  await phone.goto('/settings');
  await expect(phone.getByRole('button', { name: 'Sync my writing' })).toBeVisible();

  await laptopContext.close();
  await phoneContext.close();
});

test('the daily count goes once a day, with no text, and Settings turns it off', async ({
  page,
  context,
}) => {
  // A real writer starts with the count on. skipOnboarding keeps it off unless a value is there.
  await page.addInitScript(() => {
    if (localStorage.getItem('vlo:daily-count') === null)
      localStorage.setItem('vlo:daily-count', JSON.stringify({ off: false }));
  });
  const fake = await fakeSupabase(context);
  await skipOnboarding(page);
  await expect
    .poll(() => fake.calls.filter((c) => c.name === 'daily_count').length, { timeout: 15_000 })
    .toBe(1);
  const [call] = fake.calls.filter((c) => c.name === 'daily_count');
  expect(Object.keys(call?.body ?? {}).sort()).toEqual(['p_device', 'p_install', 'p_installed', 'p_version']);
  expect(call?.body.p_device).toBe('computer');

  // A reload on the same day sends no second count.
  await page.reload();
  await page.waitForTimeout(6_000);
  expect(fake.calls.filter((c) => c.name === 'daily_count')).toHaveLength(1);

  await page.goto('/network');
  await expect(page.getByRole('table')).toContainText('Daily count');

  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Count this device once a day' });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('vlo:daily-count'))).toBe('{"off":true}');
});

test('a writer sends feedback, and the owner reads it, marks it and sees the counts', async ({ browser }) => {
  const writerContext = await browser.newContext();
  const fake = await fakeSupabase(writerContext);
  const writer = await writerContext.newPage();
  await skipOnboarding(writer);
  await writer.goto('/settings');
  await writer.getByRole('contentinfo').getByRole('link', { name: 'Send feedback' }).click();
  await expect(writer.getByRole('heading', { level: 1, name: 'Send feedback' })).toBeVisible();
  expect(await seriousIssues(writer)).toEqual([]);
  await writer.getByRole('button', { name: 'Send feedback' }).click();
  await expect(writer.getByRole('status').filter({ hasText: 'Type your feedback first.' })).toBeVisible();
  await writer.getByRole('radio', { name: 'A problem' }).click();
  await writer.getByLabel('Your feedback').fill('Sync on my phone would help a lot.');
  await writer.getByRole('button', { name: '5 of 5' }).click();
  await writer.getByLabel('Email for a reply (you can skip this)').fill('reader@example.com');
  await writer.getByRole('button', { name: 'Send feedback' }).click();
  await expect(writer.getByRole('heading', { level: 1, name: 'Thank you' })).toBeVisible();
  expect(fake.accounts?.feedback[0]).toMatchObject({
    kind: 'problem',
    message: 'Sync on my phone would help a lot.',
    rating: 5,
    contact: 'reader@example.com',
    place: 'settings',
    user_id: null,
  });

  // An account that is not the owner cannot open the owner page.
  const ownerContext = await browser.newContext();
  await fakeSupabase(ownerContext, fake);
  const owner = await ownerContext.newPage();
  await skipOnboarding(owner);
  await owner.goto('/owner');
  await expect(owner.getByText('with the owner account to see who uses Vlo.')).toBeVisible();
  await signIn(owner, 'owner@example.com');
  await owner.goto('/owner');
  await expect(owner.getByText('This page is for the owner of Vlo.')).toBeVisible();

  fake.accounts?.makeOwner('owner@example.com');
  await owner.reload();
  await expect(owner.getByText('Accounts', { exact: true })).toBeVisible();
  await expect(owner.getByRole('img', { name: /^Devices each day\./ })).toBeVisible();
  expect(await seriousIssues(owner)).toEqual([]);
  await owner.getByRole('button', { name: 'Show as a table' }).click();
  await expect(owner.getByRole('table')).toContainText('Signed-in accounts');

  await owner.getByRole('button', { name: /^People/ }).click();
  await expect(owner.getByRole('table')).toContainText('owner@example.com');

  await owner.getByRole('button', { name: /^Feedback \(1 new\)/ }).click();
  const item = owner.getByRole('list', { name: 'Feedback' }).getByRole('listitem');
  await expect(item).toContainText('Sync on my phone would help a lot.');
  await expect(item.getByRole('link', { name: 'reader@example.com' })).toHaveAttribute(
    'href',
    'mailto:reader@example.com',
  );
  await item.getByRole('button', { name: 'Planned' }).click();
  await expect(item.getByRole('status')).toHaveText('Saved.');
  expect(fake.accounts?.feedback[0]?.status).toBe('planned');

  const download = owner.waitForEvent('download');
  await owner.getByRole('button', { name: 'Download all as CSV' }).click();
  expect((await download).suggestedFilename()).toBe('vlo-feedback.csv');

  await writerContext.close();
  await ownerContext.close();
});
