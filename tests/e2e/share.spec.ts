import { expect, test, type Page, type Route } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Task E3 (spec section 11, Gate 5): the Share panel against a fake Supabase project. The build of the
 * browser tests names https://vlo-test.supabase.co, and these routes answer its RPC paths.
 */

const RPC = 'https://vlo-test.supabase.co/rest/v1/rpc/';
const SHARE_ID = '3f2a7b1c-9d4e-4f60-8a1b-2c3d4e5f6a7b';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'apikey, authorization, content-type',
};

interface Call {
  name: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

interface Answer {
  status: number;
  body: unknown;
}

async function fakeSupabase(page: Page, answers: Partial<Record<string, Answer>> = {}): Promise<Call[]> {
  const calls: Call[] = [];
  await page.route(`${RPC}*`, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const name = new URL(request.url()).pathname.split('/').at(-1) ?? '';
    calls.push({
      name,
      url: request.url(),
      headers: await request.allHeaders(),
      body: request.postDataJSON() as Record<string, unknown>,
    });
    const answer = answers[name] ?? {
      status: 200,
      body: name === 'create_share' ? SHARE_ID : name === 'revoke_share' ? true : null,
    };
    await route.fulfill({
      status: answer.status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(answer.body),
    });
  });
  return calls;
}

async function novelWithText(page: Page) {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  await expect(page.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
  await page.keyboard.type('The harbour lights came on one by one.');
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
}

/** The key of a link in each form that a leak could take: base64url, base64 and hex. */
function keyForms(key: string): string[] {
  const bytes = Buffer.from(key, 'base64url');
  expect(bytes).toHaveLength(32);
  return [key, bytes.toString('base64'), bytes.toString('base64').replace(/=+$/, ''), bytes.toString('hex')];
}

test('a link sends the sealed text only, keeps its key in the fragment, and stops with the owner token', async ({
  page,
}) => {
  const calls = await fakeSupabase(page);
  await novelWithText(page);

  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share for reading' });
  await expect(dialog.getByRole('checkbox', { name: /Scene 1/ })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: '14 days' })).toBeChecked();
  expect(await seriousIssues(page)).toEqual([]);

  await dialog.getByRole('radio', { name: '7 days' }).click();
  await dialog.getByRole('button', { name: 'Create link' }).click();
  await expect(dialog.getByRole('heading', { name: 'Your link is ready' })).toBeVisible();
  await expect(dialog).toContainText(
    'Your copy on this device is the main copy. Readers see this version until you share again.',
  );
  const link = await dialog.getByRole('textbox', { name: 'Link for readers' }).inputValue();
  const match = /^http:\/\/localhost:4173\/r\/([0-9a-f-]{36})#k=([A-Za-z0-9_-]{43})$/.exec(link);
  expect(match?.[1]).toBe(SHARE_ID);
  const key = match?.[2] ?? '';
  expect(await seriousIssues(page)).toEqual([]);

  expect(calls.map((c) => c.name)).toEqual(['create_share']);
  const [create] = calls;
  expect(Object.keys(create?.body ?? {}).sort()).toEqual(['p_days', 'p_iv', 'p_owner_token', 'p_payload']);
  expect(create?.body.p_days).toBe(7);
  expect(JSON.stringify(create?.body)).not.toContain('harbour');
  const token = String(create?.body.p_owner_token);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

  await dialog.getByRole('button', { name: 'Done' }).click();
  const row = dialog.getByRole('listitem').filter({ hasText: 'Scene 1' }).filter({ hasText: 'Open until' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Stop sharing' }).click();
  await expect(row).toContainText('Readers lose this link at once');
  await row.getByRole('button', { name: 'Stop sharing' }).click();
  const stopped = dialog.getByRole('listitem').filter({ hasText: 'Stopped' });
  await expect(stopped).toBeVisible();

  // Stop sharing reads the comments first, because the server gives none for a stopped link.
  expect(calls.map((c) => c.name)).toEqual(['create_share', 'list_comments', 'revoke_share']);
  expect(calls[1]?.body).toEqual({ p_share_id: SHARE_ID });
  expect(calls[2]?.body).toEqual({ p_id: SHARE_ID, p_owner_token: token });

  // Review Focus 3: no request holds the key, in its URL, its headers or its body.
  for (const call of calls) {
    const sent = [call.url, JSON.stringify(call.headers), JSON.stringify(call.body)].join('\n');
    for (const form of keyForms(key)) expect(sent).not.toContain(form);
  }

  await stopped.getByRole('button', { name: 'Remove from list' }).click();
  await expect(dialog.getByRole('listitem').filter({ hasText: 'Stopped' })).toHaveCount(0);
  expect(await seriousIssues(page)).toEqual([]);
});

test('a refusal from the server shows its reason, and the panel keeps the choices', async ({ page }) => {
  await fakeSupabase(page, {
    create_share: { status: 400, body: { code: 'P0001', message: 'payload too large' } },
  });
  await novelWithText(page);
  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share for reading' });
  await dialog.getByRole('radio', { name: '30 days' }).click();
  await dialog.getByRole('button', { name: 'Create link' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'This is too large to share. Pick fewer items, or a shorter comment.',
  );
  await expect(dialog.getByRole('radio', { name: '30 days' })).toBeChecked();
  await expect(dialog.getByRole('heading', { name: 'Links of this project' })).toHaveCount(0);
});

test('the command menu opens the Share panel, and with nothing picked no request goes out', async ({
  page,
}) => {
  const calls = await fakeSupabase(page);
  await novelWithText(page);
  await page.keyboard.press('ControlOrMeta+k');
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await menu.getByRole('combobox').fill('beta reader');
  await menu.getByRole('option', { name: 'Share for reading…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share for reading' });
  await dialog.getByRole('button', { name: 'Clear' }).click();
  await dialog.getByRole('button', { name: 'Create link' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Pick at least one item to share.');
  expect(calls).toHaveLength(0);
});
