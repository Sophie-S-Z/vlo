// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

/*
 * Phase 16, decision G6: migration 0007 keeps the sealed images of a share link, in PGlite, as the anon
 * role. Only the owner adds an image, a link holds at most 20 MB, and a stopped link gives no image.
 */

const MIGRATIONS = [
  '0001_shares.sql',
  '0002_usage.sql',
  '0003_cleanup.sql',
  '0004_limits.sql',
  '0007_share_images.sql',
];
const IV = 'AAAAAAAAAAAAAAAA';
const T = (name: string) => name.padEnd(43, '0');
let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`
    create schema extensions;
    create role anon;
    create role authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  for (const file of MIGRATIONS) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec('reset role; delete from share_images; delete from shares;');
});

async function asAnon<R>(sql: string, params: unknown[] = []): Promise<R[]> {
  await db.exec('set role anon');
  try {
    return (await db.query<R>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

async function newShare(token = T('owner'), payload = 'cipher'): Promise<string> {
  const [row] = await asAnon<{ id: string }>('select public.create_share($1, $2, $3, 14) as id', [
    payload,
    IV,
    token,
  ]);
  if (!row) throw new Error('No share.');
  return row.id;
}

const add = (id: string, n: number, payload = 'sealed-image', token = T('owner')) =>
  asAnon<{ ok: boolean }>('select public.add_share_image($1, $2, $3, $4, $5) as ok', [
    id,
    token,
    n,
    payload,
    IV,
  ]);

const get = (id: string, n: number) =>
  asAnon<{ payload: string; iv: string }>('select * from public.get_share_image($1, $2)', [id, n]);

describe('0007_share_images', () => {
  test('the anon role cannot read the table', async () => {
    await expect(asAnon('select * from share_images')).rejects.toThrow(/permission denied/);
  });

  test('the owner adds an image, and a reader gets it while the link is open', async () => {
    const id = await newShare();
    expect(await add(id, 0)).toEqual([{ ok: true }]);
    expect(await get(id, 0)).toEqual([{ payload: 'sealed-image', iv: IV }]);
    expect(await get(id, 1)).toEqual([]);
    // A second call for the same number replaces the image.
    await add(id, 0, 'sealed-again');
    expect(await get(id, 0)).toEqual([{ payload: 'sealed-again', iv: IV }]);
  });

  test('only the owner adds an image, and only with a good number, IV and size', async () => {
    const id = await newShare();
    await expect(add(id, 0, 'x', T('not-the-owner'))).rejects.toThrow('share unavailable');
    await expect(add(id, -1)).rejects.toThrow('bad image number');
    await expect(add(id, 200)).rejects.toThrow('bad image number');
    await expect(add(id, 0, '')).rejects.toThrow('bad payload');
    await expect(add(id, 0, 'x'.repeat(2_800_001))).rejects.toThrow('image too large');
    await expect(
      asAnon('select public.add_share_image($1, $2, 0, $3, $4)', [id, T('owner'), 'x', 'short']),
    ).rejects.toThrow('bad iv');
  });

  test('a link holds at most 27,000,000 characters of text and images', async () => {
    const id = await newShare(T('owner'), 'x'.repeat(1_000_000));
    for (let n = 0; n < 9; n += 1) await add(id, n, 'x'.repeat(2_800_000));
    // 1,000,000 + 9 × 2,800,000 = 26,200,000. One more 2,800,000 goes over.
    await expect(add(id, 9, 'x'.repeat(2_800_000))).rejects.toThrow('share too large');
    await expect(add(id, 9, 'x'.repeat(800_000))).resolves.toEqual([{ ok: true }]);
    // A replaced image counts once.
    await expect(add(id, 0, 'x'.repeat(2_800_000))).resolves.toEqual([{ ok: true }]);
  });

  test('the images count toward the 300 MB for all links', async () => {
    const id = await newShare(T('owner'), 'x'.repeat(1_000_000));
    for (let n = 0; n < 9; n += 1) await add(id, n, 'x'.repeat(2_800_000));
    // Fill the server with text up to near its limit, with the table owner's role.
    await db.query(
      "insert into shares (owner_token_hash, payload, iv, expires_at) select md5(g::text), repeat('x', 2700000), $1, now() + interval '1 day' from generate_series(1, 101) g",
      [IV],
    );
    // 273,700,000 of text and 25,200,000 of images: 2,800,000 more goes over 300,000,000, and it would
    // fit if the images did not count.
    await expect(newShare(T('owner'), 'x'.repeat(2_800_000))).rejects.toThrow('server full');
    await expect(newShare(T('owner'), 'x'.repeat(1_000))).resolves.toBeTypeOf('string');
  }, 30_000);

  test('only the anon role and the owner call the functions', async () => {
    const rows = await db.query<{ fn: string; anon: boolean; authenticated: boolean }>(
      `select p.proname as fn,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
       from pg_proc p where p.proname in ('add_share_image', 'get_share_image', 'create_share')
       order by p.proname`,
    );
    expect(rows.rows).toEqual([
      { fn: 'add_share_image', anon: true, authenticated: false },
      { fn: 'create_share', anon: true, authenticated: false },
      { fn: 'get_share_image', anon: true, authenticated: false },
    ]);
  });

  test('a stopped or expired link gives no image and takes no image, and a deleted link deletes its images', async () => {
    const id = await newShare();
    await add(id, 0);
    await asAnon('select public.revoke_share($1, $2)', [id, T('owner')]);
    expect(await get(id, 0)).toEqual([]);
    await expect(add(id, 1)).rejects.toThrow('share unavailable');

    const old = await newShare();
    await add(old, 0);
    await db.query("update shares set expires_at = now() - interval '1 day' where id = $1", [old]);
    expect(await get(old, 0)).toEqual([]);

    await db.query('delete from shares where id = $1', [old]);
    const left = await db.query<{ count: number }>(
      'select count(*)::int as count from share_images where share_id = $1',
      [old],
    );
    expect(left.rows[0]?.count).toBe(0);
  });
});
