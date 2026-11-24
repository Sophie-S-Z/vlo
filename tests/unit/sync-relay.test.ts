// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

/*
 * Plan Task I5 (roadmap F49, decisions R8 and R9): the sync relay of migration 0005 in PGlite, called as
 * the anon role, as the app calls it through PostgREST. The setup is the one of migrations.test.ts.
 */

const MIGRATIONS = [
  '0001_shares.sql',
  '0002_usage.sql',
  '0003_cleanup.sql',
  '0004_limits.sql',
  '0005_sync.sql',
  '0007_share_images.sql',
  '0017_sync_scale.sql',
  '0018_sync_files.sql',
  '0019_sealed_bytes.sql',
];
const IV = 'AAAAAAAAAAAAAAAA';
/** A payload as the app sends it: base64. */
const B = (text: string) => btoa(text);
/** A token, device id or key of the shape that Vlo makes. */
const T = (name: string) => name.padEnd(43, '0');
const DEVICE = (name: string) => name.padEnd(22, '0');
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
  await db.exec('reset role; delete from sync_spaces;');
});

async function asAnon<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec('set role anon');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

async function newSpace(token = T('space-token')): Promise<string> {
  const [row] = await asAnon<{ id: string }>('select public.create_sync_space($1) as id', [token]);
  if (!row) throw new Error('No space.');
  return row.id;
}

const put = (space: string, device: string, key: string, payload = B('cipher'), token = T('space-token')) =>
  asAnon<{ at: Date }>('select public.sync_put($1, $2, $3, $4, $5, $6) as at', [
    space,
    token,
    device,
    key,
    payload,
    IV,
  ]);

const list = (
  space: string,
  device: string | null,
  since: Date | null = null,
  token = T('space-token'),
  seen: { device: string; key: string; at: string }[] | null = null,
) =>
  asAnon<{ device: string; key: string; payload: string; updated_at: Date }>(
    'select * from public.sync_list($1, $2, $3, $4, $5)',
    [space, token, device, since, seen === null ? null : JSON.stringify(seen)],
  );

const FILE = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const putFile = (
  space: string,
  device: string,
  key: string,
  file: string,
  size: number,
  token = T('space-token'),
) =>
  asAnon<{ at: Date }>('select public.sync_put_file($1, $2, $3, $4, $5, $6, $7) as at', [
    space,
    token,
    device,
    key,
    IV,
    file,
    size,
  ]);

const known = (files: { space: string; id: string; size: number }[]) =>
  asAnon<{ space: string; id: string }>('select * from public.sync_files_known($1)', [JSON.stringify(files)]);

const blobs = async () =>
  (
    await db.query<{ device: string; key: string; payload: string }>(
      'select device, key, public.vlo_b64(payload) as payload from sync_blobs',
    )
  ).rows;

describe('0005_sync', () => {
  test('the anon role cannot read or write the tables, or run the cleanup and the token check', async () => {
    await expect(asAnon('select * from sync_spaces')).rejects.toThrow(/permission denied/);
    await expect(asAnon('select * from sync_blobs')).rejects.toThrow(/permission denied/);
    await expect(asAnon('select public.cleanup_sync()')).rejects.toThrow(/permission denied/);
    const space = await newSpace();
    await expect(asAnon('select public.sync_open($1, $2)', [space, T('space-token')])).rejects.toThrow(
      /permission denied/,
    );
  });

  test('the space keeps only the hash of its token', async () => {
    const space = await newSpace(T('secret'));
    const [row] = (
      await db.query<{ token_hash: string }>('select token_hash from sync_spaces where id = $1', [space])
    ).rows;
    expect(row?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.token_hash).not.toContain('secret');
    await expect(newSpace('short')).rejects.toThrow('bad token');
  });

  test('a wrong token gets no rows and changes nothing', async () => {
    const space = await newSpace();
    await put(space, DEVICE('a'), T('k1'));
    const wrong = T('not-the-token');
    await expect(put(space, DEVICE('b'), T('k2'), B('x'), wrong)).rejects.toThrow('unknown space');
    await expect(list(space, null, null, wrong)).rejects.toThrow('unknown space');
    for (const call of [
      'select public.sync_drop($1, $2, $3, $4)',
      'select public.leave_sync($1, $2, $3)',
      'select public.delete_sync_space($1, $2)',
      'select * from public.sync_devices($1, $2)',
    ]) {
      const args = [space, wrong, DEVICE('a'), T('k1')].slice(0, (call.match(/\$/g) ?? []).length);
      await expect(asAnon(call, args)).rejects.toThrow('unknown space');
    }
    expect(await blobs()).toEqual([{ device: DEVICE('a'), key: T('k1'), payload: B('cipher') }]);
  });

  test('a put replaces the blob of its device and key, and a read skips the own device', async () => {
    const space = await newSpace();
    const [first] = await put(space, DEVICE('a'), T('k1'), B('one'));
    await put(space, DEVICE('a'), T('k1'), B('two'));
    await put(space, DEVICE('b'), T('k1'), B('other'));
    expect((await blobs()).map((b) => b.payload).sort()).toEqual([B('other'), B('two')]);
    expect((await list(space, DEVICE('a'))).map((b) => b.payload)).toEqual([B('other')]);
    expect((await list(space, DEVICE('b'))).map((b) => b.payload)).toEqual([B('two')]);
    expect(first?.at).toBeInstanceOf(Date);
    const devices = await asAnon<{ device: string; size: bigint | number }>(
      'select * from public.sync_devices($1, $2)',
      [space, T('space-token')],
    );
    expect(devices.map((d) => [d.device, Number(d.size)])).toEqual([
      [DEVICE('a'), 4],
      [DEVICE('b'), 8],
    ]);
  });

  test('sync_list gives the blobs from p_since on, oldest first, and stops after 8 MB', async () => {
    const space = await newSpace();
    const big = 'x'.repeat(2_800_000);
    for (const key of ['k1', 'k2', 'k3', 'k4']) await put(space, DEVICE('a'), T(key), big);
    await db.query("update sync_blobs set updated_at = now() - interval '1 hour' where key = $1", [T('k1')]);
    const all = await list(space, null);
    // 2.8 MB times 3 passes 8 MB, so the read stops after the third blob.
    expect(all.map((b) => b.key)).toEqual([T('k1'), T('k2'), T('k3')]);
    const last = all.at(-1)?.updated_at ?? null;
    const next = await list(space, null, last);
    expect(next.map((b) => b.key)).toContain(T('k4'));
    const recent = await list(space, null, new Date(Date.now() - 60_000));
    expect(recent.map((b) => b.key)).not.toContain(T('k1'));
  });

  test('sync_list skips the blobs that the read names as seen, until they change', async () => {
    const space = await newSpace();
    await put(space, DEVICE('a'), T('k1'), B('one'));
    await put(space, DEVICE('a'), T('k2'), B('two'));
    expect(await list(space, DEVICE('b'))).toHaveLength(2);
    // The relay keeps microseconds, and a JavaScript Date keeps milliseconds, so the test reads the relay's text.
    const exact = (
      await db.query<{ device: string; key: string; at: string }>(
        `select device, key, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at
         from sync_blobs`,
      )
    ).rows;
    expect(await list(space, DEVICE('b'), null, T('space-token'), exact)).toEqual([]);
    await put(space, DEVICE('a'), T('k2'), B('two again'));
    const next = await list(space, DEVICE('b'), null, T('space-token'), exact);
    expect(next.map((b) => b.payload)).toEqual([B('two again')]);
    await expect(
      list(space, DEVICE('b'), null, T('space-token'), Array(1001).fill(exact[0])),
    ).rejects.toThrow('bad seen');
  });

  test('a sixth device, a blob over the limit, a full space and a full server fail with their own errors', async () => {
    const space = await newSpace();
    for (const name of ['a', 'b', 'c', 'd', 'e']) await put(space, DEVICE(name), T('k'));
    await expect(put(space, DEVICE('f'), T('k'))).rejects.toThrow('device limit');
    // A device of the five can still add keys.
    await put(space, DEVICE('a'), T('k2'));
    await expect(put(space, DEVICE('a'), T('k3'), 'x'.repeat(2_800_001))).rejects.toThrow('blob too large');
    await db.query('update sync_blobs set size = 99999999 where device = $1 and key = $2', [
      DEVICE('b'),
      T('k'),
    ]);
    await expect(put(space, DEVICE('a'), T('k3'), B('xx'))).rejects.toThrow('space full');
    await db.query('update sync_blobs set size = 49999999 where device = $1 and key = $2', [
      DEVICE('b'),
      T('k'),
    ]);
    await expect(put(space, DEVICE('a'), T('k3'), B('xx'))).rejects.toThrow('space full');
    // A replacement counts the new size in place of the old one.
    await expect(put(space, DEVICE('b'), T('k'), B('small'))).resolves.toHaveLength(1);
    // Other spaces' data alone stops nothing. The size of the whole database does.
    const other = await newSpace(T('other'));
    await db.query('update sync_blobs set size = 40000000');
    await put(other, DEVICE('z'), T('k'), 'x'.repeat(12), T('other'));
    const [original] = (
      await db.query<{ def: string }>("select pg_get_functiondef('public.sync_server_full'::regproc) as def")
    ).rows;
    await db.exec(
      'create or replace function public.sync_server_full(p_more bigint) returns boolean language sql as $$ select true $$',
    );
    try {
      await expect(put(other, DEVICE('z'), T('k2'), B('x'), T('other'))).rejects.toThrow('server full');
      // A put that makes a blob smaller still goes through.
      await expect(put(other, DEVICE('z'), T('k'), B('x'), T('other'))).resolves.toHaveLength(1);
    } finally {
      await db.exec(original?.def ?? '');
    }
    await expect(put(space, 'bad id', T('k'))).rejects.toThrow('bad device');
    await expect(put(space, DEVICE('a'), 'bad key')).rejects.toThrow('bad key');
  });

  test('the project makes at most 20 new spaces in an hour', async () => {
    for (let i = 0; i < 20; i++) await newSpace(T(`t${String(i)}`));
    await expect(newSpace(T('one-more'))).rejects.toThrow('server busy');
  });

  test('leave_sync deletes only that device, and delete_sync_space deletes the space', async () => {
    const space = await newSpace();
    await put(space, DEVICE('a'), T('k1'));
    await put(space, DEVICE('b'), T('k1'));
    await asAnon('select public.leave_sync($1, $2, $3)', [space, T('space-token'), DEVICE('a')]);
    expect((await blobs()).map((b) => b.device)).toEqual([DEVICE('b')]);
    await asAnon('select public.sync_drop($1, $2, $3, $4)', [space, T('space-token'), DEVICE('b'), T('k1')]);
    expect(await blobs()).toEqual([]);
    await asAnon('select public.delete_sync_space($1, $2)', [space, T('space-token')]);
    expect((await db.query('select * from sync_spaces')).rows).toEqual([]);
  });

  test('the cleanup deletes a space with no use for 90 days, with its blobs, and keeps a space in use', async () => {
    const old = await newSpace(T('old'));
    const used = await newSpace(T('used'));
    await put(old, DEVICE('a'), T('k'), B('cipher'), T('old'));
    await db.query("update sync_spaces set used_at = now() - interval '91 days'");
    // A use marks the space again.
    await list(used, null, null, T('used'));
    const [{ count } = { count: 0 }] = (
      await db.query<{ count: number }>('select public.cleanup_sync() as count')
    ).rows;
    expect(count).toBe(1);
    expect((await db.query<{ id: string }>('select id from sync_spaces')).rows.map((r) => r.id)).toEqual([
      used,
    ]);
    expect(await blobs()).toEqual([]);
  });

  test('the authenticated role runs no sync function, and each sets pg_temp last on its path', async () => {
    await db.exec('set role authenticated');
    try {
      await expect(db.query('select public.create_sync_space($1)', [T('a')])).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec('reset role');
    }
    const rows = (
      await db.query<{ config: string[] | null }>(
        "select p.proconfig as config from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like '%sync%')",
      )
    ).rows;
    expect(rows).toHaveLength(14);
    for (const row of rows) expect(row.config?.find((c) => c.startsWith('search_path='))).toMatch(/pg_temp$/);
  });
});

describe('0018_sync_files', () => {
  test('a file row sends its id, and a put of text in its place makes it a row in Postgres again', async () => {
    const space = await newSpace();
    await putFile(space, DEVICE('a'), T('k1'), FILE(1), 1000);
    expect((await list(space, DEVICE('b'))).map((b) => b.payload)).toEqual([FILE(1)]);
    const file = async () =>
      (await db.query<{ file: boolean }>('select file from sync_blobs where key = $1', [T('k1')])).rows[0]
        ?.file;
    expect(await file()).toBe(true);
    await put(space, DEVICE('a'), T('k1'), B('cipher'));
    expect(await file()).toBe(false);
    await expect(putFile(space, DEVICE('a'), T('k2'), FILE(2), 1, T('wrong'))).rejects.toThrow(
      'unknown space',
    );
    await expect(putFile(space, DEVICE('a'), T('k2'), FILE(2), 3_000_001)).rejects.toThrow('blob too large');
    await expect(putFile(space, DEVICE('a'), 'bad key', FILE(2), 1)).rejects.toThrow('bad key');
  });

  test('files have their own limits, and do not count for the limits of the rows in Postgres', async () => {
    const space = await newSpace();
    await putFile(space, DEVICE('a'), T('k1'), FILE(1), 3_000_000);
    await db.query('update sync_blobs set size = 199999999');
    await expect(putFile(space, DEVICE('a'), T('k2'), FILE(2), 2)).rejects.toThrow('files full');
    // A replacement counts the new size in place of the old one.
    await expect(putFile(space, DEVICE('a'), T('k1'), FILE(3), 5)).resolves.toHaveLength(1);
    await db.query('update sync_blobs set size = 199999999');
    // 200 MB of files leave the 50 MB of text free, and a read of the text does not stop at the files.
    await put(space, DEVICE('a'), T('k2'), 'x'.repeat(2_800_000));
    expect((await list(space, DEVICE('b'))).map((b) => b.key)).toEqual([T('k1'), T('k2')]);
    // All files together stop at 9 GB.
    const other = await newSpace(T('other'));
    for (let i = 0; i < 45; i++)
      await db.query(
        `insert into sync_blobs (space_id, device, key, payload, iv, size, file)
         values ($1, $2, $3, uuid_send($4::uuid), $5, 199999999, true)`,
        [other, DEVICE('z'), T(`f${String(i)}x`), FILE(100 + i), IV],
      );
    await expect(putFile(space, DEVICE('b'), T('k9'), FILE(9), 1)).rejects.toThrow('files full');
  });

  test('sync_check answers for a token, and sync_files_known names only the files that a row uses with their size', async () => {
    const space = await newSpace();
    const check = (token: string) =>
      asAnon<{ ok: boolean }>('select public.sync_check($1, $2) as ok', [space, token]);
    expect(await check(T('space-token'))).toEqual([{ ok: true }]);
    expect(await check(T('wrong'))).toEqual([{ ok: false }]);
    await putFile(space, DEVICE('a'), T('k1'), FILE(1), 100);
    await putFile(space, DEVICE('a'), T('k2'), FILE(2), 200);
    expect(
      await known([
        { space, id: FILE(1), size: 100 },
        { space, id: FILE(2), size: 999 },
        { space, id: FILE(3), size: 1 },
      ]),
    ).toEqual([{ space, id: FILE(1) }]);
    await asAnon('select public.sync_drop($1, $2, $3, $4)', [space, T('space-token'), DEVICE('a'), T('k1')]);
    expect(await known([{ space, id: FILE(1), size: 100 }])).toEqual([]);
    await expect(
      known(Array.from({ length: 1001 }, () => ({ space, id: FILE(1), size: 1 }))),
    ).rejects.toThrow('bad files');
  });

  test('the anon role cannot run the checks of a put by themselves', async () => {
    const space = await newSpace();
    await expect(
      asAnon('select public.sync_put_checks($1, $2, $3, $4)', [space, DEVICE('a'), T('k'), IV]),
    ).rejects.toThrow(/permission denied/);
  });
});
