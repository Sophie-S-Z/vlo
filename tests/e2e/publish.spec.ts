import { expect, test, type Page } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/* Phase 17 Q-C: the Publish dialog gives each platform its own copy, steps and file. */

/** Keeps each copy that Vlo puts on the clipboard, in each browser, with no clipboard permission. */
async function fakeClipboard(page: Page) {
  await page.addInitScript(() => {
    const copies: { html?: string; text: string }[] = [];
    Object.assign(window, { vloCopies: copies });
    const read = (item: ClipboardItem, type: string) =>
      item.types.includes(type) ? item.getType(type).then((blob) => blob.text()) : Promise.resolve('');
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          copies.push({ text });
          return Promise.resolve();
        },
        write: async ([item]: ClipboardItem[]) => {
          if (item)
            copies.push({ html: await read(item, 'text/html'), text: await read(item, 'text/plain') });
        },
      },
    });
  });
}

async function copies(page: Page) {
  return page.evaluate(
    () => (window as unknown as { vloCopies: { html?: string; text: string }[] }).vloCopies,
  );
}

async function newArticle(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('checkbox', { name: /Article/ }).click();
  await dialog.getByLabel('Title', { exact: true }).fill('Night Ferry');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: 'Post' })).toBeFocused();
  await page.keyboard.type('The crossing took a night.');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
}

test('an article goes to Substack as rich text, and to Medium and Reddit with their own steps', async ({
  page,
}) => {
  await fakeClipboard(page);
  await newArticle(page);

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish' });
  await expect(dialog.getByLabel('Where')).toHaveValue('substack');
  await expect(dialog.getByLabel('What', { exact: true })).toHaveValue('project');
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Night Ferry');
  await dialog.getByLabel('Subtitle', { exact: true }).fill('One crossing, one night');
  await expect(dialog.getByRole('list').first()).toContainText('In Substack, choose Create');

  await dialog.getByRole('button', { name: 'Copy the title' }).click();
  await dialog.getByRole('button', { name: 'Copy the subtitle' }).click();
  await dialog.getByRole('button', { name: 'Copy the text' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Text copied.' })).toBeAttached();
  const substack = await copies(page);
  expect(substack.map((c) => c.text)).toEqual([
    'Night Ferry',
    'One crossing, one night',
    'The crossing took a night.',
  ]);
  // The section title "Post" is a working title, so it is not in the copy.
  expect(substack[2]?.html).toBe('<p>The crossing took a night.</p>');
  expect(await seriousIssues(page)).toEqual([]);

  await dialog.getByLabel('Where').selectOption('medium');
  await expect(dialog.getByRole('heading', { name: 'In Medium' })).toBeVisible();
  await expect(dialog).toContainText('Medium has two heading sizes.');

  await dialog.getByLabel('Where').selectOption('reddit');
  await expect(dialog.getByLabel('Subtitle', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Copy the Markdown' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Markdown copied.' })).toBeAttached();
  expect((await copies(page)).at(-1)?.text).toBe('The crossing took a night.\n');

  // The choice stays for the next time.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(dialog.getByLabel('Where')).toHaveValue('reddit');
});

test('WordPress gets an import file and, with an app id, a draft on WordPress.com', async ({
  page,
  context,
  baseURL,
}) => {
  // WordPress.com signs in and sends the window back with a token. The test answers in its place.
  await context.route('https://public-api.wordpress.com/oauth2/authorize**', async (route) => {
    const url = new URL(route.request().url());
    const state = url.searchParams.get('state') ?? '';
    const back = `${baseURL ?? ''}/wpcom-callback.html#access_token=tok&expires_in=1209600&token_type=bearer&site_id=42&state=${state}`;
    await route.fulfill({ status: 302, headers: { location: back } });
  });
  const posted: string[] = [];
  await context.route('https://public-api.wordpress.com/rest/v1.1/sites/42/posts/new', async (route) => {
    posted.push(route.request().postData() ?? '');
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({ ID: 7, site_ID: 42 }),
    });
  });

  await newArticle(page);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish' });
  await dialog.getByLabel('Where').selectOption('wordpress');
  await dialog.getByLabel('Excerpt', { exact: true }).fill('One crossing');

  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'WordPress import file' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Night Ferry for WordPress.xml');
  const path = await file.path();
  const { readFile } = await import('node:fs/promises');
  const xml = await readFile(path, 'utf8');
  expect(xml).toContain('<wp:status><![CDATA[draft]]></wp:status>');
  expect(xml).toContain('<![CDATA[<p>The crossing took a night.</p>]]>');

  await dialog.getByRole('button', { name: 'Save as a draft on WordPress.com' }).click();
  await expect(dialog.getByRole('link', { name: 'Open the draft' })).toHaveAttribute(
    'href',
    'https://wordpress.com/post/42/7',
  );
  expect(JSON.parse(posted[0] ?? '{}')).toMatchObject({
    title: 'Night Ferry',
    excerpt: 'One crossing',
    status: 'draft',
    content: '<p>The crossing took a night.</p>',
  });
});

test('the command menu finds Publish by a platform name, and a novel publishes one scene', async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
  await page.keyboard.type('Rain on the deck.');

  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('royal road');
  await page.getByRole('option', { name: /Publish to Substack/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish' });
  await expect(dialog.getByLabel('What', { exact: true })).toHaveValue('item');
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Scene 1');
  await dialog.getByLabel('What', { exact: true }).selectOption('folder');
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Chapter 1');
  await dialog.getByLabel('Where').selectOption('royalroad');
  await expect(dialog.getByRole('heading', { name: 'In Royal Road' })).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
});
