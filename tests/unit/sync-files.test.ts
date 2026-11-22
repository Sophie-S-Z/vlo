import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SyncSpace } from '@/features/sync/space';

/* Scaling fix 5 (ADR 0014): the requests of a device to the file store. */

const space = {
  spaceId: '11111111-1111-4111-8111-111111111111',
  token: 'space-token'.padEnd(43, '0'),
  deviceId: 'device-this-00000000',
} as SyncSpace;
const ID = '22222222-2222-4222-8222-222222222222';
let calls: { url: string; init: RequestInit }[];
let reply: Response;

async function files() {
  vi.resetModules();
  return import('@/features/sync/files');
}

beforeEach(() => {
  calls = [];
  reply = new Response(null, { status: 200 });
  vi.stubGlobal('fetch', (url: URL, init: RequestInit) => {
    calls.push({ url: url.toString(), init });
    return Promise.resolve(reply);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the file store of sync', () => {
  test('a build with no store has none, and the names and payloads of the store are clear', async () => {
    const { filesReady, inFileStore, storedFile } = await files();
    expect(filesReady()).toBe(false);
    expect(['file:a', 'image:b', 'version:c'].every(inFileStore)).toBe(true);
    expect(['rows:p1', 'text:s1'].some(inFileStore)).toBe(false);
    expect(storedFile(ID)).toBe(true);
    expect(storedFile('AAAA+/==')).toBe(false);
  });

  test('a put sends the bytes with the token and the IV, and a get gives them back as base64', async () => {
    vi.stubEnv('VITE_FILES_URL', 'https://files.example');
    const { filesReady, getFile, putFile } = await files();
    expect(filesReady()).toBe(true);
    await putFile(space, 'key', { payload: 'AQID', iv: 'AAAAAAAAAAAAAAAA' });
    const [put] = calls;
    expect(put?.url).toBe(`https://files.example/v1/${space.spaceId}/${space.deviceId}/key`);
    expect(put?.init).toMatchObject({
      method: 'PUT',
      headers: { Authorization: `Bearer ${space.token}`, 'X-Vlo-Iv': 'AAAAAAAAAAAAAAAA' },
    });
    expect([...(put?.init.body as Uint8Array)]).toEqual([1, 2, 3]);
    reply = new Response(new Uint8Array([1, 2, 3]));
    expect(await getFile(space, ID)).toBe('AQID');
    expect(calls[1]?.url).toBe(`https://files.example/v1/${space.spaceId}/${ID}`);
    reply = new Response(null, { status: 404 });
    expect(await getFile(space, ID)).toBeNull();
  });

  test('a refusal of the store is a ShareError of its kind', async () => {
    vi.stubEnv('VITE_FILES_URL', 'https://files.example');
    const { putFile } = await files();
    reply = Response.json({ message: 'files full' }, { status: 400 });
    await expect(putFile(space, 'key', { payload: 'AQID', iv: 'AAAAAAAAAAAAAAAA' })).rejects.toMatchObject({
      kind: 'limit',
    });
  });
});
