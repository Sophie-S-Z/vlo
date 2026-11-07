import { randomBytes, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { expect, test, type BrowserContext, type Request, type Route } from '@playwright/test';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Plan Task E4 (spec section 11, US12, US13, Review Focus 1 and 4): the reader view of a share link,
 * against a fake Supabase project that keeps its shares and comments in memory.
 */

const RPC = 'https://vlo-test.supabase.co/rest/v1/rpc/';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'apikey, authorization, content-type',
};
const DAY = 86_400_000;

interface Share {
  payload: string;
  iv: string;
  expiresAt: number;
  revoked: boolean;
  comments: { id: string; payload: string; iv: string; created_at: string }[];
}

interface Fake {
  shares: Map<string, Share>;
  calls: { name: string; body: Record<string, unknown> }[];
}

/** A fake Supabase project for every page of the context. Two contexts can share one project. */
async function fakeSupabase(
  context: BrowserContext,
  fake: Fake = { shares: new Map(), calls: [] },
): Promise<Fake> {
  await context.route(`${RPC}*`, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const name = new URL(request.url()).pathname.split('/').at(-1) ?? '';
    const body = request.postDataJSON() as Record<string, unknown>;
    fake.calls.push({ name, body });
    const reply = (status: number, value: unknown) =>
      route.fulfill({
        status,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify(value),
      });
    const now = Date.now();
    switch (name) {
      case 'create_share': {
        const id = webcrypto.randomUUID();
        fake.shares.set(id, {
          payload: String(body.p_payload),
          iv: String(body.p_iv),
          expiresAt: now + Number(body.p_days) * DAY,
          revoked: false,
          comments: [],
        });
        await reply(200, id);
        return;
      }
      case 'get_share': {
        const share = fake.shares.get(String(body.p_id));
        if (!share) {
          await reply(200, []);
          return;
        }
        const status = share.revoked ? 'revoked' : share.expiresAt < now ? 'expired' : 'ok';
        await reply(200, [
          {
            payload: status === 'ok' ? share.payload : null,
            iv: status === 'ok' ? share.iv : null,
            expires_at: new Date(share.expiresAt).toISOString(),
            status,
          },
        ]);
        return;
      }
      case 'add_comment': {
        const share = fake.shares.get(String(body.p_share_id));
        if (!share || share.revoked || share.expiresAt < now) {
          await reply(400, { code: 'P0001', message: 'share unavailable' });
          return;
        }
        const id = webcrypto.randomUUID();
        share.comments.push({
          id,
          payload: String(body.p_payload),
          iv: String(body.p_iv),
          created_at: new Date(now).toISOString(),
        });
        await reply(200, id);
        return;
      }
      case 'list_comments': {
        const share = fake.shares.get(String(body.p_share_id));
        await reply(200, share && !share.revoked ? share.comments : []);
        return;
      }
      default:
        await reply(404, { message: 'unknown' });
    }
  });
  return fake;
}

/**
 * Seals a value as Vlo does: JSON, gzip, then AES-GCM 256 with a new 12-byte IV. The additional data names
 * the purpose, so a bundle cannot open as a comment.
 */
async function seal(value: unknown): Promise<{ key: string; payload: string; iv: string }> {
  const raw = randomBytes(32);
  const key = await webcrypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = randomBytes(12);
  const cipher = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: Buffer.from('vlo:bundle:v1') },
    key,
    gzipSync(Buffer.from(JSON.stringify(value))),
  );
  return {
    key: raw.toString('base64url'),
    payload: Buffer.from(cipher).toString('base64'),
    iv: iv.toString('base64'),
  };
}

/** Puts a sealed bundle on the fake server and gives the reader's path. */
async function shareOf(fake: Fake, bundle: unknown, days = 14): Promise<{ id: string; path: string }> {
  const sealed = await seal(bundle);
  const id = webcrypto.randomUUID();
  fake.shares.set(id, {
    payload: sealed.payload,
    iv: sealed.iv,
    expiresAt: Date.now() + days * DAY,
    revoked: false,
    comments: [],
  });
  return { id, path: `/r/${id}#k=${sealed.key}` };
}

const BUNDLE = {
  v: 1,
  title: 'Salt Year',
  author: 'Ada Marlow',
  createdAt: 1,
  sections: [
    {
      title: 'The Harbour',
      form: 'prose',
      blocks: [
        { type: 'h', level: 2, runs: [{ t: 'The Harbour' }] },
        { type: 'p', runs: [{ t: 'The harbour lights came on ' }, { t: 'one by one', i: true }, { t: '.' }] },
        {
          type: 'p',
          runs: [{ t: 'The gulls slept on the wall.' }, { fn: 1, note: [{ t: 'A real wall.' }] }],
        },
      ],
    },
  ],
};

/** The JavaScript files that the page loaded. */
function scripts(requests: Request[]): string[] {
  return requests.map((r) => new URL(r.url()).pathname).filter((p) => p.endsWith('.js'));
}

test.describe('the reader view', () => {
  test('a reader on a phone reads, comments with no account, and the writer sees the comment (US13)', async ({
    browser,
  }) => {
    // The writer makes the link in Vlo.
    const writerContext = await browser.newContext();
    const fake = await fakeSupabase(writerContext);
    const writer = await writerContext.newPage();
    await skipOnboarding(writer);
    await writer.getByRole('button', { name: 'New project' }).click();
    await writer
      .getByRole('dialog', { name: 'New project' })
      .getByRole('button', { name: 'Create project' })
      .click();
    await expect(writer.getByRole('textbox', { name: 'Scene 1' })).toBeFocused();
    await writer.keyboard.type('The harbour lights came on one by one.');
    await expect(writer.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');
    await writer.getByRole('button', { name: 'Share' }).click();
    const panel = writer.getByRole('dialog', { name: 'Share for reading' });
    await panel.getByRole('button', { name: 'Create link' }).click();
    const link = await panel.getByRole('textbox', { name: 'Link for readers' }).inputValue();

    // The reader opens it on a 390-pixel phone, in a fresh browser with no Vlo data.
    const readerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await fakeSupabase(readerContext, fake);
    const reader = await readerContext.newPage();
    const requests: Request[] = [];
    reader.on('request', (r) => requests.push(r));
    await reader.goto(new URL(link).pathname + new URL(link).hash);
    await expect(reader.getByRole('heading', { level: 1, name: 'Scene 1' })).toBeVisible();
    const line = reader.getByText('The harbour lights came on one by one.');
    await expect(line).toBeVisible();
    // The key leaves the address bar at once.
    expect(await reader.evaluate(() => window.location.href)).not.toContain('#');
    expect(await reader.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await seriousIssues(reader)).toEqual([]);

    await line.tap();
    const field = reader.getByLabel(/Your comment on/);
    await expect(field).toBeFocused();
    await field.fill('This line made me stop.');
    await reader.getByLabel('Your name (optional)').fill('Ines');
    expect(await seriousIssues(reader)).toEqual([]);
    await reader.getByRole('button', { name: 'Send comment' }).click();
    await expect(field).toHaveCount(0);
    const comments = reader.getByRole('list', { name: 'Comments' });
    await expect(comments).toContainText('This line made me stop.');
    await expect(comments).toContainText('Ines');
    const add = fake.calls.find((c) => c.name === 'add_comment');
    expect(Object.keys(add?.body ?? {}).sort()).toEqual(['p_iv', 'p_payload', 'p_share_id']);
    expect(JSON.stringify(add?.body)).not.toMatch(/stop|Ines/);

    // No request from the reader holds the key, in any form, in its address, headers or body.
    const key = new URL(link).hash.slice(3);
    const forms = [
      key,
      Buffer.from(key, 'base64url').toString('base64'),
      Buffer.from(key, 'base64url').toString('hex'),
    ];
    for (const r of requests) {
      const sent = [r.url(), JSON.stringify(await r.allHeaders()), r.postData() ?? ''].join('\n');
      for (const form of forms) expect(sent).not.toContain(form);
    }

    // No editor, AI, export or equation code loads for a reader.
    const loaded = scripts(requests);
    expect(loaded.some((p) => p.includes('ReaderPage'))).toBe(true);
    for (const chunk of [
      'ProjectPage',
      'AssistantPanel',
      'engine-',
      'ExportDialog',
      'SharePanel',
      'mathlive',
    ])
      expect(loaded.filter((p) => p.includes(chunk))).toEqual([]);

    // The writer reads the comment in the Share panel.
    await panel.getByRole('button', { name: 'Done' }).click();
    await panel.getByRole('button', { name: 'Refresh comments' }).click();
    await expect(panel.getByRole('heading', { name: '1 comment' })).toBeVisible();
    await expect(panel).toContainText('This line made me stop.');
    await expect(panel).toContainText('On “The harbour lights came on one by one.”');
    expect(await seriousIssues(writer)).toEqual([]);
    await readerContext.close();
    await writerContext.close();
  });

  test('a keyboard reader comments through the comment button, and a refusal keeps the text', async ({
    page,
    context,
  }) => {
    const fake = await fakeSupabase(context);
    const { id, path } = await shareOf(fake, BUNDLE);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'Salt Year' })).toBeVisible();
    await expect(page.getByText('Ada Marlow')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'The Harbour' })).toBeVisible();
    await expect(page.getByRole('emphasis')).toHaveText('one by one');
    await page.getByRole('link', { name: 'Note 1', exact: true }).click();
    await expect(page.locator('#note-1')).toContainText('A real wall.');

    // The writer stops sharing while the reader types.
    const button = page.getByRole('button', { name: /Comment on “The gulls slept/ });
    await button.focus();
    await page.keyboard.press('Enter');
    const field = page.getByLabel(/Your comment on “The gulls slept/);
    await field.fill('Which wall?');
    const share = fake.shares.get(id);
    if (share) share.revoked = true;
    await page.getByRole('button', { name: 'Send comment' }).click();
    await expect(page.getByRole('alert')).toHaveText('This link expired, or the writer stopped sharing it.');
    await expect(field).toHaveValue('Which wall?');
  });

  test('a link opened after it expired gives the date (US12)', async ({ page, context }) => {
    const fake = await fakeSupabase(context);
    const { id, path } = await shareOf(fake, BUNDLE, 14);
    // Day 15 of a 14-day link.
    const share = fake.shares.get(id);
    if (share) share.expiresAt = Date.now() - DAY;
    const expired = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(share?.expiresAt);
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'This link expired' })).toBeVisible();
    await expect(page.getByText(`This link expired on ${expired}.`)).toBeVisible();
    expect(await seriousIssues(page)).toEqual([]);
  });

  test('a stopped link, a link with no key, a damaged key and an unknown link each say what to do', async ({
    page,
    context,
  }) => {
    const fake = await fakeSupabase(context);
    const { id, path } = await shareOf(fake, BUNDLE);
    const share = fake.shares.get(id);
    if (share) share.revoked = true;
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'The writer stopped sharing this link' })).toBeVisible();
    expect(await seriousIssues(page)).toEqual([]);

    await page.goto(`/r/${id}`);
    await expect(page.getByRole('heading', { name: 'This link is missing its key' })).toBeVisible();
    expect(await seriousIssues(page)).toEqual([]);

    await page.goto(`/r/${webcrypto.randomUUID()}#k=short`);
    await expect(page.getByRole('heading', { name: 'This link has a damaged key' })).toBeVisible();

    const { path: other } = await shareOf(fake, BUNDLE);
    await page.goto(other.replace(/\/r\/[^#]+/, `/r/${webcrypto.randomUUID()}`));
    await expect(page.getByRole('heading', { name: 'This link does not exist' })).toBeVisible();
  });

  test('a crafted bundle and a crafted comment show as text only (Review Focus 1)', async ({
    page,
    context,
  }) => {
    const fake = await fakeSupabase(context);
    const attack = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
    const crafted = {
      ...BUNDLE,
      title: attack,
      sections: [
        {
          title: attack,
          form: 'prose',
          blocks: [
            { type: 'p', runs: [{ t: attack }, { t: 'click me', link: 'javascript:window.__pwned=1' }] },
            { type: 'p', runs: [{ t: 'data', link: 'data:text/html,<script>parent.__pwned=1</script>' }] },
            {
              type: 'math',
              math: {
                tag: 'math',
                attrs: { href: 'javascript:window.__pwned=1', onclick: 'window.__pwned=1' },
                text: '',
                children: [{ tag: 'mi', attrs: {}, text: attack, children: [] }],
              },
            },
          ],
        },
      ],
    };
    const { id, path } = await shareOf(fake, crafted);
    // A comment written by hand, with markup as its text, sealed with the link's key.
    const key = new URL(`http://x${path}`).hash.slice(3);
    const raw = Buffer.from(key, 'base64url');
    const aes = await webcrypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    const iv = randomBytes(12);
    const sealed = await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: Buffer.from('vlo:comment:v1') },
      aes,
      gzipSync(
        Buffer.from(
          JSON.stringify({ v: 1, section: 0, block: 0, quote: attack, name: attack, text: attack, at: 1 }),
        ),
      ),
    );
    fake.shares.get(id)?.comments.push({
      id: 'c1',
      payload: Buffer.from(sealed).toString('base64'),
      iv: iv.toString('base64'),
      created_at: new Date().toISOString(),
    });

    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(attack);
    await expect(page.getByRole('list', { name: 'Comments' })).toContainText(attack);
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
    // The page holds the two scripts of index.html only: its inline theme script and the app module.
    const shipped = await page.evaluate(() =>
      [...document.querySelectorAll('script')].map((s) => (s.src ? new URL(s.src).origin : 'inline')),
    );
    expect(shipped.sort()).toEqual(['http://localhost:4173', 'inline']);
    expect(await page.locator('main img, main script, main iframe').count()).toBe(0);
    expect(await page.locator('a[href^="javascript:"], a[href^="data:"]').count()).toBe(0);
    await expect(page.getByText('click me')).toBeVisible();
    expect(await page.locator('math[href], math[onclick]').count()).toBe(0);
  });

  test('a bundle that is not one Vlo makes cannot be read', async ({ page, context }) => {
    const fake = await fakeSupabase(context);
    const { path } = await shareOf(fake, {
      ...BUNDLE,
      sections: [{ title: 'S', form: 'prose', blocks: [{ type: 'html', html: '<b>x</b>' }] }],
    });
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Vlo cannot read this text' })).toBeVisible();
    expect(await seriousIssues(page)).toEqual([]);
  });
});
