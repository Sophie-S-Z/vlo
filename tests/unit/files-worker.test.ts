// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import worker, { GRACE, MAX_FILE, SWEEP_MARK, sweep, type Env } from '../../workers/files/index';

/* Scaling fix 5 (ADR 0014): the Worker of the file store, with a bucket in memory and a fake Supabase. */

const SPACE = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'space-token'.padEnd(43, '0');
const DEVICE = 'device-a'.padEnd(22, '0');
const KEY = 'key'.padEnd(43, '0');
const IV = 'AAAAAAAAAAAAAAAA';

interface Stored {
  bytes: Uint8Array<ArrayBuffer>;
  uploaded: Date;
}

class FakeBucket {
  readonly objects = new Map<string, Stored>();
  now = Date.now();
  put(key: string, value: ArrayBuffer | string) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
    this.objects.set(key, { bytes, uploaded: new Date(this.now) });
    return Promise.resolve();
  }
  get(key: string) {
    const o = this.objects.get(key);
    return Promise.resolve(
      o ? { body: new Response(o.bytes).body as ReadableStream, size: o.bytes.length } : null,
    );
  }
  delete(keys: string | string[]) {
    for (const key of [keys].flat()) this.objects.delete(key);
    return Promise.resolve();
  }
  list({ limit, startAfter = '' }: { limit: number; startAfter?: string }) {
    const after = [...this.objects]
      .filter(([key]) => key > startAfter)
      .sort(([a], [b]) => a.localeCompare(b));
    const objects = after
      .slice(0, limit)
      .map(([key, o]) => ({ key, size: o.bytes.length, uploaded: o.uploaded }));
    return Promise.resolve({ objects, truncated: after.length > limit });
  }
}

let bucket: FakeBucket;
let env: Env;
/** The Supabase functions that the Worker calls, by name. */
let functions: Record<string, (args: Record<string, unknown>) => unknown>;

beforeEach(() => {
  bucket = new FakeBucket();
  env = { FILES: bucket, SUPABASE_URL: 'https://project.supabase.co', SUPABASE_KEY: 'sb_publishable_x' };
  functions = {
    sync_check: (args) => args.p_token === TOKEN,
    sync_put_file: (args) => {
      if (args.p_token !== TOKEN) throw new Error('unknown space');
      return '2026-11-22T10:00:00.000000+00:00';
    },
    sync_files_known: () => [],
  };
  vi.stubGlobal('fetch', (url: string, init: { body: string }) => {
    const name = new URL(url).pathname.split('/').at(-1) ?? '';
    const call = functions[name];
    if (!call) return Promise.resolve(Response.json({ message: 'no function' }, { status: 404 }));
    try {
      return Promise.resolve(Response.json(call(JSON.parse(init.body) as Record<string, unknown>)));
    } catch (error) {
      return Promise.resolve(Response.json({ message: (error as Error).message }, { status: 400 }));
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const putFile = (body: BodyInit, token = TOKEN, path = `/v1/${SPACE}/${DEVICE}/${KEY}`) =>
  worker.fetch(
    new Request(`https://files.example${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'X-Vlo-Iv': IV },
      body,
    }),
    env,
  );
const getFile = (id: string, token = TOKEN) =>
  worker.fetch(
    new Request(`https://files.example/v1/${SPACE}/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
    env,
  );

describe('the file store Worker', () => {
  test('a put stores the file under a new id and registers its true size, and a get gives it back', async () => {
    const calls: Record<string, unknown>[] = [];
    const register = functions.sync_put_file;
    functions.sync_put_file = (args) => {
      calls.push(args);
      return register?.(args);
    };
    const response = await putFile(new Uint8Array([1, 2, 3]));
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const [call] = calls;
    expect(call).toMatchObject({ p_space: SPACE, p_device: DEVICE, p_key: KEY, p_iv: IV, p_size: 3 });
    expect([...bucket.objects.keys()]).toEqual([`${SPACE}/${String(call?.p_file)}`]);
    const file = await getFile(String(call?.p_file));
    expect(file.status).toBe(200);
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  test('a refused put leaves no file, and a get needs the token of the space', async () => {
    const refused = await putFile(new Uint8Array([1]), 'wrong'.padEnd(43, '0'));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ message: 'unknown space' });
    expect(bucket.objects.size).toBe(0);
    const tooLarge = await putFile(new Uint8Array(MAX_FILE + 1));
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({ message: 'blob too large' });
    expect(bucket.objects.size).toBe(0);
    await putFile(new Uint8Array([1]));
    const id = [...bucket.objects.keys()][0]?.split('/')[1] ?? '';
    expect((await getFile(id, 'wrong'.padEnd(43, '0'))).status).toBe(403);
    expect((await getFile('22222222-2222-4222-8222-222222222222')).status).toBe(404);
  });

  test('a path of another shape, and an answer for a browser preflight', async () => {
    expect((await putFile(new Uint8Array([1]), TOKEN, `/v1/not-a-space/${DEVICE}/${KEY}`)).status).toBe(404);
    expect((await putFile(new Uint8Array([1]), TOKEN, `/v2/${SPACE}/${DEVICE}/${KEY}`)).status).toBe(404);
    const preflight = await worker.fetch(
      new Request(`https://files.example/v1/${SPACE}/${DEVICE}/${KEY}`, { method: 'OPTIONS' }),
      env,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, X-Vlo-Iv');
  });
});

describe('the sweep', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  test('deletes old files that no row uses, and keeps used and new files', async () => {
    const now = bucket.now;
    bucket.now = now - GRACE - 1;
    await bucket.put(`${SPACE}/${id(1)}`, 'used');
    await bucket.put(`${SPACE}/${id(2)}`, 'gone');
    await bucket.put('not-a-file', 'x');
    bucket.now = now;
    await bucket.put(`${SPACE}/${id(3)}`, 'new');
    let asked: unknown;
    functions.sync_files_known = (args) => {
      asked = args.p_files;
      return [{ space: SPACE, id: id(1) }];
    };
    await sweep(env, now);
    expect(asked).toEqual([
      { space: SPACE, id: id(1), size: 4 },
      { space: SPACE, id: id(2), size: 4 },
    ]);
    expect([...bucket.objects.keys()].sort()).toEqual([`${SPACE}/${id(1)}`, `${SPACE}/${id(3)}`, SWEEP_MARK]);
  });

  test('goes on where the last run stopped, and starts again after the last file', async () => {
    const now = bucket.now;
    bucket.now = now - GRACE - 1;
    for (let n = 0; n < 5_500; n++) await bucket.put(`${SPACE}/${id(n)}`, 'x');
    bucket.now = now;
    const asked: number[] = [];
    functions.sync_files_known = (args) => {
      asked.push((args.p_files as unknown[]).length);
      return (args.p_files as { space: string; id: string }[]).map(({ space, id }) => ({ space, id }));
    };
    await sweep(env, now);
    expect(asked).toEqual([1000, 1000, 1000, 1000, 1000]);
    const mark = new TextDecoder().decode(bucket.objects.get(SWEEP_MARK)?.bytes);
    expect(mark).toBe(`${SPACE}/${id(4999)}`);
    await sweep(env, now);
    expect(asked.slice(5)).toEqual([500]);
    expect(new TextDecoder().decode(bucket.objects.get(SWEEP_MARK)?.bytes)).toBe('');
    expect(bucket.objects.size).toBe(5_501);
  });
});
