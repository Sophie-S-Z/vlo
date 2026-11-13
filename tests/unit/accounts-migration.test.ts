// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

/*
 * Phase 18 Task A1 (decisions A1 to A7): migration 0008 in PGlite. The app calls each function through
 * PostgREST as the anon role, or as the authenticated role with the account in the JWT. Here a small
 * `auth` schema stands in for Supabase Auth: `auth.uid()` reads the `sub` claim, as Supabase does.
 */

const MIGRATIONS = [
  '0001_shares.sql',
  '0002_usage.sql',
  '0003_cleanup.sql',
  '0004_limits.sql',
  '0005_sync.sql',
  '0006_rooms.sql',
  '0007_share_images.sql',
  '0008_accounts.sql',
];
const T = (name: string) => name.padEnd(43, '0');
const INSTALL = (name: string) => name.padEnd(22, '0');
const IV = 'AAAAAAAAAAAAAAAA';
const WRAPPED = 'A'.repeat(64);
const SALT = `${'B'.repeat(22)}==`;
const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';
let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(`
    create schema extensions;
    create role anon;
    create role authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      created_at timestamptz not null default now(),
      last_sign_in_at timestamptz,
      raw_app_meta_data jsonb not null default '{}'
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid to anon, authenticated;
  `);
  for (const file of MIGRATIONS) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    reset role;
    select set_config('request.jwt.claim.sub', '', false);
    delete from app_feedback; delete from app_pings; delete from sync_vaults; delete from app_owners;
    delete from sync_spaces; delete from usage_reports; delete from auth.users;
    insert into auth.users (id, email, raw_app_meta_data) values
      ('${ALICE}', 'alice@example.com', '{"provider":"email"}'),
      ('${BOB}', 'bob@example.com', '{"provider":"google"}');
  `);
});

/** Runs SQL as the anon role, or as an account of the authenticated role. */
async function as<T>(who: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const role = who === 'anon' ? 'anon' : 'authenticated';
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who === 'anon' ? '' : who]);
  await db.exec(`set role ${role}`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function newSpace(token = T('space')): Promise<string> {
  const [row] = await as<{ id: string }>('anon', 'select public.create_sync_space($1) as id', [token]);
  if (!row) throw new Error('No space.');
  return row.id;
}

const putVault = (who: string, space: string, token = T('space')) =>
  as(who, 'select public.vault_put($1, $2, $3, $4, $5, 600000)', [space, token, WRAPPED, IV, SALT]);

const count = (who: string, install: string, device = 'phone', installed = false) =>
  as(who, "select public.daily_count($1, '0.1.0', $2, $3)", [install, device, installed]);

const feedback = (who: string, install: string, message = 'More fonts, please.', kind = 'idea') =>
  as<{ id: string }>(
    who,
    "select public.send_feedback($1, $2, $3, 4, '', '0.1.0', 'computer', 'settings') as id",
    [install, kind, message],
  );

describe('sync vaults (decision A1)', () => {
  test('an account saves and reads its own vault, and another account sees none of it', async () => {
    const space = await newSpace();
    await putVault(ALICE, space);
    const [mine] = await as<{ space_id: string; wrapped: string; rounds: number }>(
      ALICE,
      'select * from public.vault_get()',
    );
    expect(mine).toMatchObject({ space_id: space, wrapped: WRAPPED, rounds: 600000 });
    expect(await as(BOB, 'select * from public.vault_get()')).toEqual([]);
  });

  test('a vault needs the space token, a sign-in, and a key of the right shape', async () => {
    const space = await newSpace();
    await expect(putVault(ALICE, space, T('wrong'))).rejects.toThrow('unknown space');
    await expect(putVault('anon', space)).rejects.toThrow(/permission denied/);
    await expect(
      as(ALICE, 'select public.vault_put($1, $2, $3, $4, $5, 600000)', [
        space,
        T('space'),
        'short',
        IV,
        SALT,
      ]),
    ).rejects.toThrow('bad wrapped key');
    await expect(
      as(ALICE, 'select public.vault_put($1, $2, $3, $4, $5, 1000)', [space, T('space'), WRAPPED, IV, SALT]),
    ).rejects.toThrow('bad rounds');
  });

  test('a vault goes with its space, and vault_delete keeps the space', async () => {
    const space = await newSpace();
    await putVault(ALICE, space);
    await as(ALICE, 'select public.vault_delete()');
    expect((await db.query('select 1 from sync_spaces')).rows).toHaveLength(1);
    await putVault(ALICE, space);
    await as('anon', 'select public.delete_sync_space($1, $2)', [space, T('space')]);
    expect(await as(ALICE, 'select * from public.vault_get()')).toEqual([]);
  });

  test('delete_my_account removes the account, its space and its vault, and keeps other rows', async () => {
    const space = await newSpace();
    await putVault(ALICE, space);
    await count(ALICE, INSTALL('a'));
    await feedback(ALICE, INSTALL('a'));
    await as(ALICE, 'select public.delete_my_account()');
    expect((await db.query('select id from auth.users')).rows).toEqual([{ id: BOB }]);
    expect((await db.query('select 1 from sync_spaces')).rows).toHaveLength(0);
    expect((await db.query('select user_id from app_pings')).rows).toEqual([{ user_id: null }]);
    expect((await db.query('select user_id from app_feedback')).rows).toEqual([{ user_id: null }]);
  });
});

describe('the daily count (decision A3)', () => {
  test('one row for each install and day, with the account of a signed-in device', async () => {
    await count('anon', INSTALL('a'));
    await count('anon', INSTALL('a'), 'tablet');
    await count(ALICE, INSTALL('a'), 'tablet', true);
    await count('anon', INSTALL('a'));
    const rows = (await db.query('select install, user_id, device, installed from app_pings')).rows;
    expect(rows).toEqual([{ install: INSTALL('a'), user_id: ALICE, device: 'phone', installed: false }]);
  });

  test('refuses an install id, a version or a device of the wrong shape', async () => {
    await expect(count('anon', 'short')).rejects.toThrow('bad install');
    await expect(count('anon', INSTALL('a'), 'fridge')).rejects.toThrow('bad device');
    await expect(
      as('anon', "select public.daily_count($1, 'x y', 'phone', false)", [INSTALL('a')]),
    ).rejects.toThrow('bad version');
  });

  test('the anon role cannot read the counts', async () => {
    await count('anon', INSTALL('a'));
    await expect(as('anon', 'select * from app_pings')).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, 'select * from app_pings')).rejects.toThrow(/permission denied/);
  });

  test('the cleanup removes counts older than 400 days', async () => {
    await count('anon', INSTALL('a'));
    await db.query(
      "insert into app_pings (install, day, app_version, device) values ($1, vlo_today() - 401, '0.1.0', 'phone')",
      [INSTALL('b')],
    );
    expect((await db.query<{ n: number }>('select public.cleanup_pings() as n')).rows[0]?.n).toBe(1);
    await expect(as('anon', 'select public.cleanup_pings()')).rejects.toThrow(/permission denied/);
  });
});

describe('feedback (decision A5)', () => {
  test('takes a message from anyone, with the account of a signed-in writer', async () => {
    await feedback('anon', INSTALL('a'));
    await feedback(BOB, INSTALL('b'), 'It froze on export.', 'problem');
    const rows = (await db.query('select kind, user_id, status, rating from app_feedback order by kind'))
      .rows;
    expect(rows).toEqual([
      { kind: 'idea', user_id: null, status: 'new', rating: 4 },
      { kind: 'problem', user_id: BOB, status: 'new', rating: 4 },
    ]);
  });

  test('refuses an empty or long message, a bad kind or rating, and an 11th message in a day', async () => {
    await expect(feedback('anon', INSTALL('a'), '   ')).rejects.toThrow('empty message');
    await expect(feedback('anon', INSTALL('a'), 'x'.repeat(4001))).rejects.toThrow('message too large');
    await expect(feedback('anon', INSTALL('a'), 'Hi', 'spam')).rejects.toThrow('bad kind');
    await expect(
      as('anon', "select public.send_feedback($1, 'idea', 'Hi', 9, '', '0.1.0', 'phone', '')", [
        INSTALL('a'),
      ]),
    ).rejects.toThrow('bad rating');
    for (let i = 0; i < 10; i++) await feedback('anon', INSTALL('a'));
    await expect(feedback('anon', INSTALL('a'))).rejects.toThrow('feedback limit');
    await feedback('anon', INSTALL('b'));
  });
});

describe('the owner page (decision A6)', () => {
  beforeEach(async () => {
    await db.query('insert into app_owners (user_id) values ($1)', [ALICE]);
  });

  test('only an owner reads the reports', async () => {
    expect((await as<{ ok: boolean }>(ALICE, 'select public.is_owner() as ok'))[0]?.ok).toBe(true);
    expect((await as<{ ok: boolean }>(BOB, 'select public.is_owner() as ok'))[0]?.ok).toBe(false);
    for (const sql of [
      'select public.owner_summary()',
      'select * from public.owner_daily(30)',
      'select * from public.owner_accounts()',
      'select * from public.owner_feedback()',
    ]) {
      await expect(as(BOB, sql)).rejects.toThrow('not owner');
      await expect(as('anon', sql)).rejects.toThrow(/permission denied/);
    }
  });

  test('the summary counts accounts, active devices, sync, feedback and weekly reports', async () => {
    await count('anon', INSTALL('a'), 'phone', true);
    await count(BOB, INSTALL('b'), 'computer');
    await db.query(
      "insert into app_pings (install, day, app_version, device) values ($1, vlo_today() - 10, '0.0.9', 'tablet')",
      [INSTALL('c')],
    );
    await putVault(BOB, await newSpace());
    await feedback('anon', INSTALL('a'));
    await as('anon', "select public.submit_usage('2026-W45', '0.1.0', $1::jsonb)", [
      JSON.stringify({
        features_used: ['board', 'backup'],
        templates_used: ['poetry'],
        words_added_band: '1-249',
      }),
    ]);
    const [row] = await as<{ s: Record<string, unknown> }>(ALICE, 'select public.owner_summary() as s');
    expect(row?.s).toMatchObject({
      accounts: 2,
      active_1d: 2,
      active_7d: 2,
      active_30d: 3,
      accounts_active_30d: 1,
      syncing: 1,
      installed: 1,
      devices: { phone: 1, computer: 1, tablet: 1 },
      feedback: { new: 1 },
      feedback_kinds: { idea: 1 },
      ratings: 1,
      reports: 1,
      features: { board: 1, backup: 1 },
      templates: { poetry: 1 },
      words: { '1-249': 1 },
    });
  });

  test('daily rows, accounts and feedback, and the owner sets a status and a note', async () => {
    await count(BOB, INSTALL('b'));
    const [sent] = await feedback(BOB, INSTALL('b'));
    const days = await as<{ devices: number; accounts: number; new_accounts: number }>(
      ALICE,
      'select * from public.owner_daily(7)',
    );
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toMatchObject({ devices: 1, accounts: 1, new_accounts: 2 });
    const people = await as<{ email: string; devices: number; feedback: number; provider: string }>(
      ALICE,
      'select * from public.owner_accounts()',
    );
    expect(people[0]).toMatchObject({
      email: 'bob@example.com',
      devices: 1,
      feedback: 1,
      provider: 'google',
    });
    await as(ALICE, "select public.owner_set_feedback($1, 'planned', 'In the next phase.')", [sent?.id]);
    await expect(as(ALICE, "select public.owner_set_feedback($1, 'lost', null)", [sent?.id])).rejects.toThrow(
      'bad status',
    );
    const [item] = await as<{ status: string; note: string; email: string }>(
      ALICE,
      'select * from public.owner_feedback()',
    );
    expect(item).toMatchObject({ status: 'planned', note: 'In the next phase.', email: 'bob@example.com' });
  });
});

test('each new function sets pg_temp last on its path, and no role reads a new table', async () => {
  const rows = (
    await db.query<{ name: string; config: string[] | null }>(
      "select p.proname as name, p.proconfig as config from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'",
    )
  ).rows;
  for (const row of rows) expect(row.config?.find((c) => c.startsWith('search_path='))).toMatch(/pg_temp$/);
  for (const table of ['app_owners', 'sync_vaults', 'app_pings', 'app_feedback'])
    for (const who of ['anon', ALICE])
      await expect(as(who, `select * from ${table}`)).rejects.toThrow(/permission denied/);
});
