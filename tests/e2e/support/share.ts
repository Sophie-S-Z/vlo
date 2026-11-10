import { randomBytes, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { BrowserContext, Route } from '@playwright/test';
import { FakeSyncRelay } from '../../fixtures/syncRelay';

/* A fake Supabase project and sealed share bundles for the reader view tests (spec section 11). */

const RPC = 'https://vlo-test.supabase.co/rest/v1/rpc/';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'apikey, authorization, content-type',
};
export const DAY = 86_400_000;

interface Share {
  payload: string;
  iv: string;
  expiresAt: number;
  revoked: boolean;
  comments: { id: string; payload: string; iv: string; created_at: string }[];
}

interface Fake {
  shares: Map<string, Share>;
  /** The sync relay of migration 0005 (F49). */
  sync: FakeSyncRelay;
  calls: { name: string; body: Record<string, unknown> }[];
}

/** A fake Supabase project for every page of the context. Two contexts can share one project. */
export async function fakeSupabase(
  context: BrowserContext,
  fake: Fake = { shares: new Map(), sync: new FakeSyncRelay(), calls: [] },
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
      default: {
        if (!name.includes('sync')) {
          await reply(404, { message: 'unknown' });
          return;
        }
        let value: unknown;
        try {
          value = fake.sync.call(name, body);
        } catch (error) {
          await reply(400, { code: 'P0001', message: (error as Error).message });
          return;
        }
        await reply(200, value);
      }
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
export async function shareOf(fake: Fake, bundle: unknown, days = 14): Promise<{ id: string; path: string }> {
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

export const BUNDLE = {
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
