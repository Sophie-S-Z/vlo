import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { db } from '@/lib/db';

/* Plan Task E1 (spec section 11): the Supabase RPC client goes through the network module. */

const URL_ = 'https://vlo-test.supabase.co';

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', URL_);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  await db.open();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await db.delete();
});

function answer(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: URL | string, init: RequestInit) => {
      calls.push({ url: url.toString(), init });
      return Promise.resolve(
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
      );
    }),
  );
  return calls;
}

describe('rpc', () => {
  test('posts the arguments to the RPC path with the anon key, and logs the host and the path only', async () => {
    const calls = answer(200, 'share-id');
    const { rpc } = await import('@/features/share/rpc');
    await expect(rpc<string>('create_share', { p_payload: 'c', p_iv: 'i' }, 'share')).resolves.toBe(
      'share-id',
    );
    expect(calls[0]?.url).toBe(`${URL_}/rest/v1/rpc/create_share`);
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get('apikey')).toBe('anon-key');
    expect(headers.get('authorization')).toBe('Bearer anon-key');
    expect(calls[0]?.init.body).toBe(JSON.stringify({ p_payload: 'c', p_iv: 'i' }));
    const [entry] = await db.networkLog.toArray();
    expect(entry).toMatchObject({
      host: 'vlo-test.supabase.co',
      path: '/rest/v1/rpc/create_share',
      purpose: 'share',
    });
    expect(JSON.stringify(entry)).not.toContain('anon-key');
  });

  test('turns each server refusal into a ShareError kind', async () => {
    const { rpc, ShareError } = await import('@/features/share/rpc');
    for (const [message, kind] of [
      ['payload too large', 'too-large'],
      ['comment too large', 'too-large'],
      ['share unavailable', 'unavailable'],
      ['comment limit reached', 'limit'],
      ['bad expiry', 'server'],
    ] as const) {
      answer(400, { code: 'P0001', message });
      const failure = rpc('add_comment', {}, 'share');
      await expect(failure).rejects.toBeInstanceOf(ShareError);
      await expect(failure).rejects.toMatchObject({ kind });
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(rpc('get_share', {}, 'share')).rejects.toMatchObject({ kind: 'offline' });
  });

  test('a build with no Supabase settings sends nothing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    const calls = answer(200, 1);
    const { rpc, sharingReady } = await import('@/features/share/rpc');
    expect(sharingReady()).toBe(false);
    await expect(rpc('ping', {}, 'share')).rejects.toMatchObject({ kind: 'not-set-up' });
    expect(calls).toHaveLength(0);
  });
});

describe('the Supabase host', () => {
  test('share and usage may reach the Supabase host only', async () => {
    const { hostAllowed } = await import('@/lib/net');
    expect(hostAllowed(new URL(`${URL_}/rest/v1/rpc/ping`), 'share')).toBe(true);
    expect(hostAllowed(new URL(`${URL_}/rest/v1/rpc/submit_usage`), 'usage')).toBe(true);
    expect(hostAllowed(new URL('https://other.supabase.co/rest/v1/rpc/ping'), 'share')).toBe(false);
    expect(hostAllowed(new URL(`${URL_}/rest/v1/rpc/ping`), 'ai')).toBe(false);
  });
});
