// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

/*
 * Migration 0019 (ADR 0016) in PGlite: sync blobs, share links and their images keep bytes, not base64
 * text. The rows of before change in place, the functions give the same base64 as before, the limits
 * still count base64 characters, and a share link stops when the database nears its limit.
 */

const BEFORE = [
  '0001_shares.sql',
  '0002_usage.sql',
  '0003_cleanup.sql',
  '0004_limits.sql',
  '0005_sync.sql',
  '0007_share_images.sql',
  '0017_sync_scale.sql',
  '0018_sync_files.sql',
];
const IV = 'AAAAAAAAAAAAAAAA';
const T = (name: string) => name.padEnd(43, '0');
const DEVICE = (name: string) => name.padEnd(22, '0');
const FILE = '00000000-0000-4000-8000-000000000001';
const made = new Map<number, string>();
/** The base64 of `n` random bytes, as cipher text is: the same text for the same `n`. */
function sealed(n: number): string {
  const text = made.get(n) ?? randomBytes(n).toString('base64');
  made.set(n, text);
  return text;
}
let db: PGlite;
let space: string;
let share: string;

async function asAnon<R>(sql: string, params: unknown[] = []): Promise<R[]> {
  await db.exec('set role anon');
  try {
    return (await db.query<R>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

const list = () =>
  asAnon<{ key: string; payload: string }>('select key, payload from public.sync_list($1, $2, $3, null)', [
    space,
    T('space-token'),
    DEVICE('reader'),
  ]);

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`
    create schema extensions;
    create role anon;
    create role authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  for (const file of BEFORE) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  // Rows of before the change: a blob, a file row, a row that is no base64, and a share with an image.
  [{ id: space } = { id: '' }] = await asAnon<{ id: string }>('select public.create_sync_space($1) as id', [
    T('space-token'),
  ]);
  const put = 'select public.sync_put($1, $2, $3, $4, $5, $6)';
  await asAnon(put, [space, T('space-token'), DEVICE('a'), T('k1'), sealed(3000), IV]);
  await asAnon(put, [space, T('space-token'), DEVICE('a'), T('k2'), 'not base64!', IV]);
  await asAnon('select public.sync_put_file($1, $2, $3, $4, $5, $6, $7)', [
    space,
    T('space-token'),
    DEVICE('a'),
    T('k3'),
    IV,
    FILE,
    100,
  ]);
  [{ id: share } = { id: '' }] = await asAnon<{ id: string }>(
    'select public.create_share($1, $2, $3, 14) as id',
    [sealed(600), IV, T('owner')],
  );
  await asAnon('select public.add_share_image($1, $2, 0, $3, $4)', [share, T('owner'), sealed(900), IV]);
  await db.exec(readFileSync('supabase/migrations/0019_sealed_bytes.sql', 'utf8'));
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('0019_sealed_bytes', () => {
  test('the rows of before keep their bytes, and the functions give the same base64 again', async () => {
    const sizes = (
      await db.query<{ key: string; bytes: number }>(
        'select key, octet_length(payload) as bytes from sync_blobs order by key',
      )
    ).rows;
    expect(sizes).toEqual([
      { key: T('k1'), bytes: 3000 },
      { key: T('k2'), bytes: 'not base64!'.length },
      { key: T('k3'), bytes: 16 },
    ]);
    expect(await list()).toEqual([
      { key: T('k1'), payload: sealed(3000) },
      { key: T('k2'), payload: Buffer.from('not base64!').toString('base64') },
      { key: T('k3'), payload: FILE },
    ]);
    const [got] = await asAnon<{ payload: string }>('select payload from public.get_share($1)', [share]);
    expect(got?.payload).toBe(sealed(600));
    const [image] = await asAnon<{ payload: string }>('select payload from public.get_share_image($1, 0)', [
      share,
    ]);
    expect(image?.payload).toBe(sealed(900));
  });

  test('a new blob keeps three quarters of its base64 size, and its size still counts base64', async () => {
    const big = sealed(300_000);
    await asAnon('select public.sync_put($1, $2, $3, $4, $5, $6)', [
      space,
      T('space-token'),
      DEVICE('a'),
      T('k4'),
      big,
      IV,
    ]);
    const [row] = (
      await db.query<{ stored: number; size: number }>(
        'select pg_column_size(payload) as stored, size from sync_blobs where key = $1',
        [T('k4')],
      )
    ).rows;
    expect(row?.size).toBe(big.length);
    expect(row?.stored).toBeLessThanOrEqual(300_004);
    expect((await list()).find((b) => b.key === T('k4'))?.payload).toBe(big);
    const known = await asAnon<{ id: string }>('select id from public.sync_files_known($1)', [
      JSON.stringify([{ space, id: FILE, size: 100 }]),
    ]);
    expect(known).toEqual([{ id: FILE }]);
  });

  test('a link still holds at most 27,000,000 base64 characters of text and images', async () => {
    const [{ id } = { id: '' }] = await asAnon<{ id: string }>(
      'select public.create_share($1, $2, $3, 14) as id',
      [sealed(750_000), IV, T('owner')],
    );
    const add = (n: number, bytes: number) =>
      asAnon('select public.add_share_image($1, $2, $3, $4, $5)', [id, T('owner'), n, sealed(bytes), IV]);
    // 1,000,000 + 9 × 2,800,000 = 26,200,000 characters. One more 2,800,000 goes over.
    for (let n = 0; n < 9; n += 1) await add(n, 2_100_000);
    await expect(add(9, 2_100_000)).rejects.toThrow('share too large');
    await expect(add(9, 600_000)).resolves.toHaveLength(1);
  }, 30_000);

  test('a share link stops when the database nears its limit, as sync does', async () => {
    const [original] = (
      await db.query<{ def: string }>("select pg_get_functiondef('public.sync_server_full'::regproc) as def")
    ).rows;
    await db.exec(
      'create or replace function public.sync_server_full(p_more bigint) returns boolean language sql as $$ select true $$',
    );
    try {
      await expect(
        asAnon('select public.create_share($1, $2, $3, 14)', [sealed(30), IV, T('owner')]),
      ).rejects.toThrow('server full');
      await expect(
        asAnon('select public.add_share_image($1, $2, 1, $3, $4)', [share, T('owner'), sealed(30), IV]),
      ).rejects.toThrow('server full');
    } finally {
      await db.exec(original?.def ?? '');
    }
  });

  test('the anon role cannot call the helpers, and each function sets pg_temp last on its path', async () => {
    await expect(asAnon("select public.vlo_b64('\\x00'::bytea)")).rejects.toThrow(/permission denied/);
    await expect(asAnon('select public.vlo_b64_length(3)')).rejects.toThrow(/permission denied/);
    const rows = (
      await db.query<{ name: string; config: string[] | null }>(
        `select p.proname as name, p.proconfig as config from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('vlo_b64', 'vlo_b64_length', 'sync_list', 'sync_put',
           'sync_put_file', 'sync_files_known', 'create_share', 'get_share', 'add_share_image', 'get_share_image')`,
      )
    ).rows;
    expect(rows).toHaveLength(10);
    for (const row of rows) expect(row.config?.find((c) => c.startsWith('search_path='))).toMatch(/pg_temp$/);
  });
});
