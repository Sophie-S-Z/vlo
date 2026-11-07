// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

/*
 * Plan Task E1 (spec section 11): the 4 Supabase migrations run in PGlite, a real Postgres in WebAssembly.
 * Each call goes as the anon role, as a browser's call through PostgREST does. Supabase gives the
 * `extensions` schema, the `anon` and `authenticated` roles, and default grants that let both roles run
 * each new function, so the setup adds them first.
 */

const MIGRATIONS = ['0001_shares.sql', '0002_usage.sql', '0003_cleanup.sql', '0004_limits.sql'];
/** A 12-byte IV in base64. */
const IV = 'AAAAAAAAAAAAAAAA';
/** An owner token of the length that Vlo makes: 32 bytes in base64url. */
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
  await db.exec('reset role; delete from share_comments; delete from shares; delete from usage_reports;');
});

/** Runs `sql` as the anon role and gives the rows. */
async function asAnon<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec('set role anon');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

async function newShare(days = 14, token = T('owner-token'), payload = 'cipher'): Promise<string> {
  const [row] = await asAnon<{ id: string }>('select public.create_share($1, $2, $3, $4) as id', [
    payload,
    IV,
    token,
    days,
  ]);
  if (!row) throw new Error('No share.');
  return row.id;
}

describe('0001_shares', () => {
  test('the anon role cannot read or write the tables', async () => {
    await expect(asAnon('select * from shares')).rejects.toThrow(/permission denied/);
    await expect(asAnon('select * from share_comments')).rejects.toThrow(/permission denied/);
    await expect(
      asAnon("insert into shares (owner_token_hash, payload, iv, expires_at) values ('h', 'p', 'i', now())"),
    ).rejects.toThrow(/permission denied/);
  });

  test('create_share stores the hash of the owner token and refuses a bad expiry or a large payload', async () => {
    const id = await newShare(7, T('secret-token'));
    const [stored] = (
      await db.query<{ owner_token_hash: string; days: number }>(
        'select owner_token_hash, round(extract(epoch from expires_at - created_at) / 86400) as days from shares where id = $1',
        [id],
      )
    ).rows;
    expect(stored?.owner_token_hash).not.toContain('secret-token');
    expect(stored?.owner_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(stored?.days)).toBe(7);
    await expect(newShare(3)).rejects.toThrow('bad expiry');
    await expect(newShare(14, T('t'), 'x'.repeat(2_800_001))).rejects.toThrow('payload too large');
    await expect(newShare(14, T('t'), 'x'.repeat(2_800_000))).resolves.toMatch(/-/);
  });

  test('get_share gives the payload while active, and no payload once expired or revoked', async () => {
    const id = await newShare();
    const [ok] = await asAnon<{ payload: string; status: string }>('select * from public.get_share($1)', [
      id,
    ]);
    expect(ok).toMatchObject({ payload: 'cipher', status: 'ok' });

    await db.query("update shares set expires_at = now() - interval '1 day' where id = $1", [id]);
    const [expired] = await asAnon<{ payload: string | null; iv: string | null; status: string }>(
      'select * from public.get_share($1)',
      [id],
    );
    expect(expired).toMatchObject({ payload: null, iv: null, status: 'expired' });

    const other = await newShare(14, T('tok'));
    const [wrong] = await asAnon<{ revoked: boolean }>('select public.revoke_share($1, $2) as revoked', [
      other,
      T('not-the-token'),
    ]);
    expect(wrong?.revoked).toBe(false);
    const [right] = await asAnon<{ revoked: boolean }>('select public.revoke_share($1, $2) as revoked', [
      other,
      T('tok'),
    ]);
    expect(right?.revoked).toBe(true);
    const [revoked] = await asAnon<{ payload: string | null; status: string }>(
      'select * from public.get_share($1)',
      [other],
    );
    expect(revoked).toMatchObject({ payload: null, status: 'revoked' });
  });

  test('comments: a limit of 500, a size limit, and none on a revoked or expired share', async () => {
    const id = await newShare();
    await asAnon('select public.add_comment($1, $2, $3)', [id, 'c', IV]);
    const listed = await asAnon<{ payload: string }>('select * from public.list_comments($1)', [id]);
    expect(listed.map((c) => c.payload)).toEqual(['c']);
    await expect(
      asAnon('select public.add_comment($1, $2, $3)', [id, 'x'.repeat(20_001), IV]),
    ).rejects.toThrow('comment too large');
    await db.query(
      "insert into share_comments (share_id, payload, iv) select $1, 'c', 'iv' from generate_series(1, 499)",
      [id],
    );
    await expect(asAnon('select public.add_comment($1, $2, $3)', [id, 'c', IV])).rejects.toThrow(
      'comment limit reached',
    );

    const gone = await newShare(14, T('tok'));
    await asAnon('select public.revoke_share($1, $2)', [gone, T('tok')]);
    await expect(asAnon('select public.add_comment($1, $2, $3)', [gone, 'c', IV])).rejects.toThrow(
      'share unavailable',
    );
    expect(await asAnon('select * from public.list_comments($1)', [gone])).toEqual([]);
  });

  test('ping answers 1 for the keepalive workflow', async () => {
    expect(await asAnon<{ ping: number }>('select public.ping()')).toEqual([{ ping: 1 }]);
  });
});

describe('0002_usage', () => {
  const submit = (report: unknown, week = '2026-W45') =>
    asAnon('select public.submit_usage($1, $2, $3::jsonb)', [week, '0.5.0', JSON.stringify(report)]);

  test('takes a report with the allowed keys and bands', async () => {
    await submit({
      templates_used: ['novel'],
      words_added_band: '1000-4999',
      poems_added_band: '0',
      features_used: ['export-docx'],
      ai_mode_counts: { pen: 2 },
      error_codes: { 'export-failed': 1 },
    });
    expect((await db.query('select * from usage_reports')).rows).toHaveLength(1);
    await expect(asAnon('select * from usage_reports')).rejects.toThrow(/permission denied/);
  });

  test('refuses a key outside the allowlist, a band outside the list, a bad week and 4,097 bytes', async () => {
    await expect(submit({ title: 'My novel' })).rejects.toThrow('key not allowed');
    await expect(submit({ words_added_band: '17' })).rejects.toThrow('bad band');
    await expect(submit({ poems_added_band: 'many' })).rejects.toThrow('bad band');
    await expect(submit({}, 'last week')).rejects.toThrow('bad week');
    await expect(submit(['not', 'an', 'object'])).rejects.toThrow('bad report');
    // Postgres measures the jsonb text, {"features_used": ["…"]}, which is 23 bytes plus the padding.
    await expect(submit({ features_used: ['x'.repeat(4096 - 23 + 1)] })).rejects.toThrow('report too large');
    await expect(submit({ features_used: ['x'.repeat(4096 - 23)] })).resolves.toHaveLength(1);
  });
});

describe('0003_cleanup', () => {
  test('deletes a share 30 days after it expired, with its comments, and keeps a newer one', async () => {
    const old = await newShare();
    const recent = await newShare();
    await asAnon('select public.add_comment($1, $2, $3)', [old, 'c', IV]);
    await db.query("update shares set expires_at = now() - interval '31 days' where id = $1", [old]);
    await db.query("update shares set expires_at = now() - interval '29 days' where id = $1", [recent]);
    const [run] = (await db.query<{ count: number }>('select public.cleanup_shares() as count')).rows;
    expect(run?.count).toBe(1);
    const left = (await db.query<{ id: string }>('select id from shares')).rows.map((r) => r.id);
    expect(left).toEqual([recent]);
    expect((await db.query('select * from share_comments')).rows).toEqual([]);
  });

  test('the anon role cannot run the cleanup', async () => {
    await expect(asAnon('select public.cleanup_shares()')).rejects.toThrow(/permission denied/);
  });
});

describe('0004_limits', () => {
  test('create_share, add_comment and revoke_share refuse an IV or owner token of the wrong shape', async () => {
    const make = (iv: string, token: string, payload = 'cipher') =>
      asAnon('select public.create_share($1, $2, $3, 14)', [payload, iv, token]);
    await expect(make('iv', T('a'))).rejects.toThrow('bad iv');
    await expect(make(`${IV}x`, T('a'))).rejects.toThrow('bad iv');
    await expect(make(IV, 'short')).rejects.toThrow('bad owner token');
    await expect(make(IV, `${T('a')}<`)).rejects.toThrow('bad owner token');
    await expect(make(IV, T('a'), '')).rejects.toThrow('bad payload');
    const id = await newShare();
    await expect(
      asAnon('select public.add_comment($1, $2, $3)', [id, 'c', 'x'.repeat(5000)]),
    ).rejects.toThrow('bad iv');
    await expect(asAnon('select public.add_comment($1, $2, $3)', [id, '', IV])).rejects.toThrow(
      'bad payload',
    );
    const [stopped] = await asAnon<{ revoked: boolean }>('select public.revoke_share($1, $2) as revoked', [
      id,
      'x'.repeat(100_000),
    ]);
    expect(stopped?.revoked).toBe(false);
  });

  test('the project takes at most 120 new links and 600 new comments in an hour', async () => {
    await db.query(
      "insert into shares (owner_token_hash, payload, iv, expires_at) select 'h', 'p', 'i', now() + interval '1 day' from generate_series(1, 119)",
    );
    const last = await newShare();
    await expect(newShare()).rejects.toThrow('server busy');
    await db.query("update shares set created_at = now() - interval '61 minutes'");
    const next = await newShare();

    await db.query(
      "insert into share_comments (share_id, payload, iv) select $1, 'c', 'iv' from generate_series(1, 300)",
      [last],
    );
    await db.query(
      "insert into share_comments (share_id, payload, iv) select $1, 'c', 'iv' from generate_series(1, 299)",
      [next],
    );
    const third = await newShare();
    await asAnon('select public.add_comment($1, $2, $3)', [third, 'c', IV]);
    await expect(asAnon('select public.add_comment($1, $2, $3)', [third, 'c', IV])).rejects.toThrow(
      'server busy',
    );
  });

  test('the project holds at most 300 MB of sealed text', async () => {
    // Postgres compresses the repeated letters, so the test database stays small.
    await db.query(
      "insert into shares (owner_token_hash, payload, iv, expires_at, created_at) select 'h', repeat('x', 2800000), 'i', now() + interval '1 day', now() - interval '2 hours' from generate_series(1, 107)",
    );
    // 107 links of 2.8 MB hold 299.6 MB. Then 300 KB more fits, and 100 KB after it does not.
    await expect(newShare(14, T('a'), 'x'.repeat(300_000))).resolves.toMatch(/-/);
    await expect(newShare(14, T('a'), 'x'.repeat(100_001))).rejects.toThrow('server full');
    await expect(newShare(14, T('a'), 'x'.repeat(1000))).resolves.toMatch(/-/);
  }, 30_000);

  test('the project takes at most 2,000 usage reports in a week', async () => {
    await db.query(
      "insert into usage_reports (week, app_version, report) select '2026-W45', '0.1.0', '{}'::jsonb from generate_series(1, 1999)",
    );
    const submit = () => asAnon('select public.submit_usage($1, $2, $3::jsonb)', ['2026-W45', '0.1.0', '{}']);
    await expect(submit()).resolves.toHaveLength(1);
    await expect(submit()).rejects.toThrow('server busy');
    await db.query("update usage_reports set created_at = now() - interval '8 days'");
    await expect(submit()).resolves.toHaveLength(1);
  });

  test('the authenticated role runs no function, and every function sets pg_temp last on its path', async () => {
    await db.exec('set role authenticated');
    try {
      await expect(db.query("select public.create_share('c', $1, $2, 14)", [IV, T('a')])).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.query('select public.cleanup_shares()')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
    const rows = (
      await db.query<{ name: string; config: string[] | null }>(
        "select p.proname as name, p.proconfig as config from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'",
      )
    ).rows;
    expect(rows.map((r) => r.name).sort()).toEqual([
      'add_comment',
      'cleanup_shares',
      'create_share',
      'get_share',
      'list_comments',
      'ping',
      'revoke_share',
      'submit_usage',
      'usage_cap',
    ]);
    for (const row of rows) expect(row.config?.find((c) => c.startsWith('search_path='))).toMatch(/pg_temp$/);
  });
});
