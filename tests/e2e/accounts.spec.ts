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

/** A new account gives its name after the code (ADR 0011). A returning account goes on at once. */
async function giveName(page: Page, email: string) {
  const step = page.getByRole('heading', { level: 1, name: 'What is your name?' });
  const signedIn = page.getByText(`Signed in as ${email}`);
  await expect(step.or(signedIn)).toBeVisible();
  if (await step.isVisible()) {
    await page.getByLabel('Your full name').fill(`${email.split('@')[0] ?? ''} Writer`);
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(signedIn).toBeVisible();
}

async function signIn(page: Page, email: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Vlo sent a code' })).toBeVisible();
  await page.getByLabel('Code from the email').fill(CODE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await giveName(page, email);
  await expect(page.getByRole('button', { name: /^Account: / })).toBeVisible();
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

/** Brings the projects of the library with no account into the signed-in account. */
async function bringDeviceProjects(page: Page, count: string) {
  const library = page
    .getByRole('list', { name: 'Other libraries on this device' })
    .getByRole('listitem')
    .filter({ hasText: 'This device, with no account' });
  await expect(library).toContainText(count);
  await library.getByRole('button', { name: 'Bring its projects here' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Bring them in' }).click();
  await expect(page.getByRole('status').filter({ hasText: `${count} came in.` })).toBeVisible();
}

test('a writer signs in on a laptop and a phone, brings in the projects, and both keep them', async ({
  browser,
}) => {
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
  await expect(sync).toContainText('This device syncs with your account.');
  // The account has its own library. The project written with no account comes in only when asked.
  await laptop.goto('/');
  await expect(projects(laptop)).toHaveCount(0);
  await laptop.goto('/account');
  await bringDeviceProjects(laptop, '1 project');
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
  await expect(phoneSync).toContainText('This device syncs with your account.');
  await bringDeviceProjects(phone, '1 project');
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

  // Sign out on the phone: it stops sync, and the account's projects stay hidden until the next sign-in.
  await phone.goto('/account');
  await phone.getByRole('button', { name: 'Sign out' }).click();
  await expect(phone.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await expect(projects(phone)).toHaveCount(1);
  await phone.goto('/settings');
  await expect(phone.getByRole('button', { name: 'Sync my writing' })).toBeVisible();
  await signIn(phone, 'mira@example.com');
  await phone.goto('/');
  await expect(projects(phone)).toHaveCount(2);

  await laptopContext.close();
  await phoneContext.close();
});

test('a new writer gives a name and a photo, the Library greets them, and the profile follows them', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const laptopContext = await browser.newContext();
  const fake = await fakeSupabase(laptopContext);
  const laptop = await laptopContext.newPage();
  await skipOnboarding(laptop);
  await laptop.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sign in' }).click();
  await laptop.getByLabel('Email').fill('ada@example.com');
  await laptop.getByRole('button', { name: 'Send me a code' }).click();
  await laptop.getByLabel('Code from the email').fill(CODE);
  await laptop.getByRole('button', { name: 'Sign in' }).click();

  // The name step: a photo, placed in the circle, and the name.
  await expect(laptop.getByRole('heading', { level: 1, name: 'What is your name?' })).toBeVisible();
  await laptop.locator('input[type="file"]').setInputFiles('tests/fixtures/images/harbour.jpg');
  const crop = laptop.getByRole('dialog', { name: 'Place your photo' });
  await crop.getByRole('button', { name: 'Zoom in' }).click();
  await crop.getByRole('group').press('ArrowRight');
  expect(await seriousIssues(laptop)).toEqual([]);
  await crop.getByRole('button', { name: 'Use this photo' }).click();
  await expect(crop).toBeHidden();
  await laptop.getByLabel('Your full name').fill('Ada King Lovelace');
  await laptop.getByRole('button', { name: 'Continue' }).click();
  await expect(laptop.getByText('Signed in as ada@example.com')).toBeVisible();
  const [saved] = [...(fake.accounts?.profiles.values() ?? [])];
  expect(saved).toMatchObject({ name: 'Ada King Lovelace', called: '' });
  expect(saved?.photo).toMatch(/^data:image\/(webp|jpeg);base64,/);

  const greeting = laptop.getByRole('heading', { level: 1 });
  await laptop.goto('/');
  await expect(greeting).toHaveText('Welcome back to your library, Ada');

  // The header opens the profile. The preview follows the words as the writer types.
  await laptop.getByRole('button', { name: 'Account: Ada' }).click();
  await laptop.getByRole('menuitem', { name: 'Your profile' }).click();
  await expect(laptop.getByRole('heading', { level: 1, name: 'Your profile' })).toBeVisible();
  await laptop.getByLabel(/What Vlo calls you/).fill('Countess');
  await laptop.getByLabel(/Pen name/).fill('A. A. L.');
  await laptop.getByLabel(/About you/).fill('Ada wrote the first program.');
  const preview = laptop.getByRole('complementary', { name: 'Where your profile shows' });
  await expect(preview).toContainText('Welcome back to your library, Countess');
  await expect(preview).toContainText('A. A. L.');
  expect(await seriousIssues(laptop)).toEqual([]);
  await laptop.getByRole('button', { name: 'Save profile' }).click();
  await expect(laptop.getByRole('status').filter({ hasText: 'Your profile is saved.' })).toBeVisible();
  await laptop.goto('/');
  await expect(greeting).toHaveText('Welcome back to your library, Countess');

  // A new project takes the pen name as its author, and a book can take the bio.
  await newProject(laptop, false, 'Engines of thought.');
  await laptop.goto(`${new URL(laptop.url()).pathname}/book`);
  await expect(laptop.getByLabel('Copyright page')).toHaveValue(/A\. A\. L\./);
  await laptop.getByRole('button', { name: 'Use the bio from your profile' }).click();
  await expect(laptop.getByLabel('About the author')).toHaveValue('Ada wrote the first program.');

  // Another device signs in with no name step, and greets the writer by name.
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await fakeSupabase(phoneContext, fake);
  const phone = await phoneContext.newPage();
  await skipOnboarding(phone);
  await signIn(phone, 'ada@example.com');
  await phone.goto('/');
  await expect(phone.getByRole('heading', { level: 1 })).toHaveText('Welcome back to your library, Countess');

  await laptopContext.close();
  await phoneContext.close();
});

test('two accounts in one browser keep their own projects until the writer merges them', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await fakeSupabase(context);
  await skipOnboarding(page);
  await signIn(page, 'ada@example.com');
  await newProject(page, false, 'Ada wrote this.');

  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign in to another account' }).click();
  const other = page.getByRole('region', { name: 'Your accounts on this device' });
  await other.getByLabel('Email').fill('ben@example.com');
  await other.getByRole('button', { name: 'Send me a code' }).click();
  await other.getByLabel('Code from the email').fill(CODE);
  await other.getByRole('button', { name: 'Sign in' }).click();
  await giveName(page, 'ben@example.com');
  await page.goto('/');
  await expect(projects(page)).toHaveCount(0);

  // Ada's account is signed in here too, so Ben can bring in its projects or switch to it.
  await page.goto('/account');
  const ada = page
    .getByRole('list', { name: 'Other libraries on this device' })
    .getByRole('listitem')
    .filter({ hasText: 'ada@example.com' });
  await expect(ada).toContainText('1 project');
  await ada.getByRole('button', { name: 'Bring its projects here' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Bring them in' }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 project came in.' })).toBeVisible();
  await page.goto('/');
  await expect(projects(page)).toHaveCount(1);

  await page.goto('/account');
  await ada.getByRole('button', { name: 'Switch to this account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.goto('/account');
  await expect(page.getByText('Signed in as ada@example.com')).toBeVisible();
});

test('a signed-out visit opens on the sign-in screen, which can make an account or go on alone', async ({
  page,
  context,
}) => {
  await fakeSupabase(context);
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in\?next=%2F$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  await page.getByLabel('Email').fill('new@example.com');
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await page.getByLabel('Code from the email').fill(CODE);
  await page.getByRole('button', { name: 'Create my account' }).click();
  // A new account gives its name, then goes to the screen it asked for: here, the welcome.
  await expect(page).toHaveURL(/\/profile\/new\?next=%2F$/);
  expect(await seriousIssues(page)).toEqual([]);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Type your name.' })).toBeVisible();
  await page.getByLabel('Your full name').fill('Noor Haddad');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  // The welcome picks no kind of writing for the writer. A second click takes a pick away.
  const kinds = page.getByRole('group', { name: 'What do you write?' }).getByRole('checkbox');
  await expect(kinds).toHaveCount(9);
  for (const kind of await kinds.all()) await expect(kind).not.toBeChecked();
  const next = page.getByRole('button', { name: 'Next' });
  await expect(next).toBeDisabled();
  const memoir = page.getByRole('checkbox', { name: /Memoir/ });
  await memoir.click();
  await expect(memoir).toBeChecked();
  await expect(next).toBeEnabled();
  await memoir.click();
  await expect(memoir).not.toBeChecked();
  await expect(next).toBeDisabled();
});

test('a writer sets a password, then signs in with it and no code', async ({ page, context }) => {
  const fake = await fakeSupabase(context);
  await skipOnboarding(page);
  await signIn(page, 'pia@example.com');
  await page.goto('/account');
  const panel = page.getByRole('region', { name: 'Password' });
  await panel.getByLabel('New password').fill('short');
  await panel.getByLabel('Type the password again').fill('short');
  await panel.getByRole('button', { name: 'Save password' }).click();
  await expect(panel.getByRole('status')).toHaveText('Use at least 8 characters.');
  // A server with "Secure password change" on asks for a code from the email first.
  if (fake.accounts) fake.accounts.passwordNeedsCode = true;
  await panel.getByLabel('New password').fill('salt and harbour');
  await panel.getByLabel('Type the password again').fill('salt and harbour');
  await panel.getByRole('button', { name: 'Save password' }).click();
  await expect(panel.getByRole('status')).toContainText(
    'For your safety, Vlo sent a code to pia@example.com.',
  );
  await panel.getByLabel('Code from the email').fill(CODE);
  await panel.getByRole('button', { name: 'Save password' }).click();
  await expect(panel.getByRole('status')).toContainText('Your password is saved.');
  expect(await seriousIssues(page)).toEqual([]);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sign in' }).click();
  // This browser set a password, so the form starts with the password.
  await page.getByLabel('Email').fill('pia@example.com');
  await page.getByLabel('Password').fill('wrong password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'This email and password do not match.' }),
  ).toBeVisible();
  await page.getByLabel('Password').fill('salt and harbour');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Signed in as pia@example.com')).toBeVisible();
  expect(fake.calls.filter((c) => c.name === 'auth:otp')).toHaveLength(1);
});

test('a visitor writes without an account, and the choice holds in that tab', async ({ page, context }) => {
  await fakeSupabase(context);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings$/);
  await page.getByRole('button', { name: 'Write without an account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
});

test('the daily count goes once a day with numbers and no text, and Settings has no switch for it', async ({
  page,
  context,
}) => {
  const fake = await fakeSupabase(context);
  // Vercel's place headers, as api/geo.ts sends them back. The preview server has no such function.
  let places = 0;
  await context.route('**/api/geo', (route) => {
    places++;
    return route.fulfill({ json: { country: 'NZ', region: 'AUK', city: 'Auckland' } });
  });
  await skipOnboarding(page, { dailyCount: true });
  await expect
    .poll(() => fake.calls.filter((c) => c.name === 'daily_count').length, { timeout: 15_000 })
    .toBe(1);
  const [call] = fake.calls.filter((c) => c.name === 'daily_count');
  expect(Object.keys(call?.body ?? {}).sort()).toEqual([
    'p_city',
    'p_country',
    'p_day',
    'p_device',
    'p_install',
    'p_installed',
    'p_projects',
    'p_region',
    'p_total',
    'p_version',
    'p_words',
  ]);
  expect(call?.body).toMatchObject({
    p_device: 'computer',
    p_words: 0,
    p_projects: 0,
    p_country: 'NZ',
    p_region: 'AUK',
    p_city: 'Auckland',
  });

  // A reload on the same day, with no change to the projects, sends no second count.
  await page.reload();
  await page.waitForTimeout(6_000);
  expect(fake.calls.filter((c) => c.name === 'daily_count')).toHaveLength(1);
  // The place goes once a day, with the first count.
  expect(places).toBe(1);

  await page.goto('/network');
  await expect(page.getByRole('table')).toContainText('Daily count');

  await page.goto('/settings');
  const usage = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Usage counts' }) });
  await expect(usage.getByRole('heading', { name: 'The daily count' })).toBeVisible();
  await expect(usage).toContainText('never hold your text, a title, a name or your internet address');
  await expect(usage.getByRole('switch')).toHaveCount(0);
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
  await expect(writer.getByRole('status').filter({ hasText: 'Type your message first.' })).toBeVisible();
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
  // A second message within 30 seconds waits. The note link picks the note kind.
  await writer.getByRole('contentinfo').getByRole('link', { name: 'Write to Sophie' }).click();
  await expect(writer.getByRole('radio', { name: 'A personal note to Sophie' })).toBeChecked();
  await writer.getByLabel('Your note').fill('Thank you for Vlo.');
  await writer.getByRole('button', { name: 'Send the note' }).click();
  await expect(writer.getByRole('status').filter({ hasText: 'Wait 30 seconds' })).toBeVisible();

  // An account that is not the owner cannot open the owner page.
  const ownerContext = await browser.newContext();
  await fakeSupabase(ownerContext, fake);
  const owner = await ownerContext.newPage();
  await skipOnboarding(owner);
  await owner.goto('/owner');
  await expect(owner.getByText('with the owner account to see who uses Vlo.')).toBeVisible();
  await signIn(owner, 'owner@example.com');
  const ownerLink = owner.getByRole('link', { name: 'Open the owner page' });
  await expect(owner.getByText('Signed in as owner@example.com')).toBeVisible();
  await expect(ownerLink).toHaveCount(0);
  await owner.goto('/owner');
  await expect(owner.getByText('This page is for the owner of Vlo.')).toBeVisible();

  // An owner finds the page from the Account page.
  fake.accounts?.makeOwner('owner@example.com');
  await owner.goto('/account');
  await ownerLink.click();
  await expect(owner.getByRole('heading', { level: 1, name: 'Owner' })).toBeVisible();
  await expect(owner.getByText('Accounts', { exact: true })).toBeVisible();
  await expect(owner.getByRole('heading', { name: 'Words written today' })).toBeVisible();
  await expect(owner.getByRole('table', { name: 'Today against other days' })).toContainText(
    'Average day, last 4 weeks',
  );
  await expect(owner.getByText(/^Live\. Updated at/)).toBeVisible();
  await expect(owner.getByRole('heading', { name: 'Signed-out visitors and places' })).toBeVisible();
  await expect(owner.getByText('Signed out this month')).toBeVisible();
  await owner.getByRole('button', { name: 'Devices', exact: true }).click();
  await expect(owner.getByRole('slider', { name: /^Devices that opened Vlo each day\./ })).toBeVisible();
  expect(await seriousIssues(owner)).toEqual([]);
  await owner.getByRole('button', { name: 'Show as a table' }).click();
  await expect(owner.getByRole('table', { name: 'Devices that opened Vlo each day' })).toContainText(
    'Signed-in accounts',
  );

  await owner.getByRole('button', { name: /^People/ }).click();
  await expect(owner.getByRole('table', { name: 'Accounts' })).toContainText('owner@example.com');

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
  await item.getByRole('button', { name: 'Block this sender' }).click();
  await expect(item.getByRole('status')).toHaveText('Blocked. This sender cannot send more messages.');
  await expect(item).toContainText('Sender blocked');
  await writer.reload();
  await writer.getByLabel('Your note').fill('One more note.');
  await writer.getByRole('button', { name: 'Send the note' }).click();
  await expect(
    writer.getByRole('status').filter({ hasText: 'Vlo cannot send messages from this device or account.' }),
  ).toBeVisible();
  await item.getByRole('button', { name: 'Unblock this sender' }).click();
  await expect(item.getByRole('status')).toHaveText('Unblocked.');

  const download = owner.waitForEvent('download');
  await owner.getByRole('button', { name: 'Download all as CSV' }).click();
  expect((await download).suggestedFilename()).toBe('vlo-feedback.csv');

  await writerContext.close();
  await ownerContext.close();
});

test('the leaderboard ranks the signed-in writers, crowns the first, and a writer can leave it', async ({
  page,
  context,
}) => {
  const fake = await fakeSupabase(context);
  await skipOnboarding(page);
  await signIn(page, 'mira@example.com');
  const accounts = fake.accounts;
  if (!accounts) throw new Error('No fake accounts.');
  const mira = [...accounts.users.values()].find((u) => u.email === 'mira@example.com');
  if (!mira) throw new Error('No account for Mira.');
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const writer = (id: string, name: string, words: number) => {
    accounts.profiles.set(id, { name, called: '', pen_name: '', bio: '', photo: null, updated_at: today });
    accounts.pings.set(`${id}|${today}`, {
      install: id,
      day: today,
      user_id: id,
      device: 'computer',
      words,
      total: words,
      country: null,
    });
  };
  writer('w1', 'Ada Quill', 2400);
  writer('w2', 'Basho Frog', 900);
  writer('w3', 'Colette Ink', 450);
  accounts.pings.set(`m|${today}`, {
    install: 'm',
    day: today,
    user_id: mira.id,
    device: 'computer',
    words: 120,
    total: 120,
    country: null,
  });

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Leaderboard' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Leaderboard' })).toBeVisible();
  const rows = page.getByRole('list', { name: 'Leaderboard, Today' }).getByRole('listitem');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toHaveAttribute('data-medal', 'gold');
  await expect(rows.nth(0)).toContainText('Ada');
  await expect(rows.nth(0).locator('.vlo-crown')).toBeVisible();
  await expect(rows.nth(1)).toHaveAttribute('data-medal', 'silver');
  await expect(rows.nth(2)).toHaveAttribute('data-medal', 'bronze');
  await expect(rows.nth(3)).toContainText('(you)');
  await expect(rows.nth(3)).not.toHaveAttribute('data-medal');
  expect(await seriousIssues(page)).toEqual([]);

  await page.getByRole('button', { name: 'This year' }).click();
  await expect(page.getByRole('list', { name: 'Leaderboard, This year' }).getByRole('listitem')).toHaveCount(
    4,
  );

  await page.getByRole('switch', { name: 'Show me on the leaderboard' }).click();
  await expect(page.getByRole('list', { name: 'Leaderboard, This year' }).getByRole('listitem')).toHaveCount(
    3,
  );
  expect(accounts.offBoard.has(mira.id)).toBe(true);
});
