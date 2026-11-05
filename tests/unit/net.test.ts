import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { hostAllowed, LOG_LIMIT, logRequest, vloFetch } from '@/lib/net';

/* Plan Task D1 (F25): the only way out of the app, and its log. */

beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await db.delete();
});

describe('hostAllowed', () => {
  const ok = (url: string, purpose: Parameters<typeof hostAllowed>[1]) => hostAllowed(new URL(url), purpose);

  it('lets each purpose reach its own hosts only', () => {
    expect(ok('https://api.anthropic.com/v1/messages', 'ai')).toBe(true);
    expect(ok('https://openrouter.ai/api/v1/chat/completions', 'ai')).toBe(true);
    expect(ok('https://huggingface.co/mlc-ai/x', 'ai')).toBe(false);
    expect(ok('https://huggingface.co/mlc-ai/x', 'model-download')).toBe(true);
    expect(ok('https://cdn-lfs.hf.co/x', 'model-download')).toBe(true);
    expect(ok('https://api.anthropic.com/v1/messages', 'model-download')).toBe(false);
  });

  it('refuses plain http, a lookalike host and a wrong port', () => {
    expect(ok('http://api.anthropic.com/v1/messages', 'ai')).toBe(false);
    expect(ok('https://api.anthropic.com.evil.example/v1', 'ai')).toBe(false);
    expect(ok('https://evilhf.co/x', 'model-download')).toBe(false);
    expect(ok('http://localhost:11434/v1/models', 'ai')).toBe(true);
    expect(ok('http://localhost:1234/v1/models', 'ai')).toBe(true);
    expect(ok('http://localhost:8080/v1/models', 'ai')).toBe(false);
  });

  it('refuses every share and usage request until Phase 5', () => {
    expect(ok('https://example.supabase.co/rest/v1/shares', 'share')).toBe(false);
    expect(ok('https://example.supabase.co/rest/v1/usage', 'usage')).toBe(false);
  });
});

describe('vloFetch', () => {
  it('logs the host, path, purpose, bytes and status, and never the query, a header or the body', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetch);
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'Mira found the ledger' }] });
    await vloFetch('https://api.groq.com/openai/v1/chat/completions?key=secret', {
      purpose: 'ai',
      headers: { authorization: 'Bearer sk-secret' },
      body,
    });
    expect(fetch).toHaveBeenCalledOnce();
    const entries = await db.networkLog.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      host: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      purpose: 'ai',
      bytesSent: new TextEncoder().encode(body).byteLength,
      status: 200,
    });
    expect(JSON.stringify(entries)).not.toMatch(/secret|ledger|Bearer/);
  });

  it('sends no cookies or referrer', async () => {
    const fetch = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetch);
    await vloFetch('https://api.anthropic.com/v1/messages', { purpose: 'ai', body: '{}' });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  });

  it('refuses a host that the purpose does not list, before any request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(vloFetch('https://example.com/collect', { purpose: 'ai', body: 'x' })).rejects.toThrow(
      'Vlo does not send ai requests to example.com.',
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(await db.networkLog.count()).toBe(0);
  });

  it('logs a failed request as "error" and passes the failure on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(vloFetch('http://localhost:11434/v1/models', { purpose: 'ai' })).rejects.toThrow(
      'Failed to fetch',
    );
    expect(await db.networkLog.toArray()).toMatchObject([{ host: 'localhost:11434', status: 'error' }]);
  });

  it('keeps the newest entries when the log is full', async () => {
    await db.networkLog.bulkAdd(
      Array.from({ length: LOG_LIMIT }, (_, i) => ({
        id: `old-${String(i)}`,
        at: i,
        host: 'huggingface.co',
        path: '/x',
        purpose: 'model-download' as const,
        bytesSent: 0,
        status: 200,
      })),
    );
    await logRequest('https://huggingface.co/mlc-ai/model/resolve/main/params.bin', 'model-download', 200);
    expect(await db.networkLog.count()).toBe(LOG_LIMIT);
    expect(await db.networkLog.get('old-0')).toBeUndefined();
    expect((await db.networkLog.orderBy('at').last())?.path).toBe('/mlc-ai/model/resolve/main/params.bin');
  });
});
