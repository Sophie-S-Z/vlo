// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

/*
 * Phase 18 Task A1 (decisions A1 to A7): migrations 0008, 0009 (the live owner page), 0010 (places), 0011
 * (profiles) and 0012 (the leaderboard) in PGlite. The app calls each function through
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
  '0009_live_owner.sql',
  '0010_places.sql',
  '0011_profiles.sql',
  '0012_leaderboard.sql',
];
const T = (name: string) => name.padEnd(43, '0');
const INSTALL = (name: string) => name.padEnd(22, '0');
/** A sync key of the shape that Vlo makes: 32 bytes in base64url. */
const KEY = T('sync-key');
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
    delete from shares; delete from sprint_rooms;
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
  as(who, 'select public.vault_put($1, $2, $3)', [space, token, KEY]);

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
    const [mine] = await as<{ space_id: string; key: string }>(ALICE, 'select * from public.vault_get()');
    expect(mine).toMatchObject({ space_id: space, key: KEY });
    expect(await as(BOB, 'select * from public.vault_get()')).toEqual([]);
  });

  test('a vault needs the space token, a sign-in, and a key of the right shape', async () => {
    const space = await newSpace();
    await expect(putVault(ALICE, space, T('wrong'))).rejects.toThrow('unknown space');
    await expect(putVault('anon', space)).rejects.toThrow(/permission denied/);
    await expect(
      as(ALICE, 'select public.vault_put($1, $2, $3)', [space, T('space'), 'short']),
    ).rejects.toThrow('bad key');
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
      name: null,
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

const PHOTO = `data:image/webp;base64,${'A'.repeat(100)}==`;
const putProfile = (who: string, name: string, photo: string | null = null, bio = '') =>
  as(who, "select public.profile_put($1, ' Ada ', '', $2, $3)", [name, bio, photo]);

describe('profiles (migration 0011)', () => {
  test('an account saves and reads its own profile, and another account sees none of it', async () => {
    await putProfile(ALICE, '  Alice Lovelace ', PHOTO, 'Line one.\nLine two.');
    const [mine] = await as(ALICE, 'select name, called, pen_name, bio, photo from public.profile_get()');
    expect(mine).toEqual({
      name: 'Alice Lovelace',
      called: 'Ada',
      pen_name: '',
      bio: 'Line one.\nLine two.',
      photo: PHOTO,
    });
    expect(await as(BOB, 'select * from public.profile_get()')).toEqual([]);
    // A second save replaces the whole profile, so a null photo removes it.
    await putProfile(ALICE, 'Alice');
    expect(await as(ALICE, 'select name, photo from public.profile_get()')).toEqual([
      { name: 'Alice', photo: null },
    ]);
  });

  test('refuses an empty or long name, a control character, a large photo and the anon role', async () => {
    await expect(putProfile(ALICE, '   ')).rejects.toThrow('bad name');
    await expect(putProfile(ALICE, 'x'.repeat(81))).rejects.toThrow('bad name');
    await expect(putProfile(ALICE, 'Al\u0007ice')).rejects.toThrow('bad name');
    await expect(putProfile(ALICE, 'Alice', null, 'x'.repeat(1001))).rejects.toThrow('bad bio');
    await expect(putProfile(ALICE, 'Alice', 'data:image/png;base64,AAAA')).rejects.toThrow('bad photo');
    await expect(putProfile(ALICE, 'Alice', `data:image/jpeg;base64,${'A'.repeat(60000)}`)).rejects.toThrow(
      'bad photo',
    );
    await expect(putProfile('anon', 'Alice')).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, 'select public.vlo_check_text($1, 5, false, $2)', ['a', 'b'])).rejects.toThrow(
      /permission denied/,
    );
  });

  test('the profile goes with its account, and the owner page shows the name', async () => {
    await db.query('insert into app_owners (user_id) values ($1)', [ALICE]);
    await putProfile(BOB, 'Bob Byron');
    const people = await as<{ email: string; name: string | null }>(
      ALICE,
      'select email, name from public.owner_accounts() order by email',
    );
    expect(people).toEqual([
      { email: 'alice@example.com', name: null },
      { email: 'bob@example.com', name: 'Bob Byron' },
    ]);
    await as(BOB, 'select public.delete_my_account()');
    expect((await db.query('select 1 from profiles')).rows).toHaveLength(0);
  });
});

/** The UTC day in SQL, which every role may read. */
const TODAY = "(now() at time zone 'utc')::date";

describe('live words on the owner page (migration 0009)', () => {
  beforeEach(async () => {
    await db.query('insert into app_owners (user_id) values ($1)', [ALICE]);
  });

  /** A count with the words of the device's local day, its total words and its projects. */
  const words = (who: string, install: string, added: number, total: number, offset = 0) =>
    as(
      who,
      `select public.daily_count($1, '0.1.0', 'computer', false, ${TODAY} + ${String(offset)}, $2, $3, 2)`,
      [install, added, total],
    );

  test('a new count replaces the numbers of the day, and an old app keeps them', async () => {
    await words('anon', INSTALL('a'), 100, 5000);
    await words('anon', INSTALL('a'), 340, 5240);
    await count('anon', INSTALL('a'));
    const rows = (await db.query('select words, words_total, projects from app_pings')).rows;
    expect(rows).toEqual([{ words: 340, words_total: 5240, projects: 2 }]);
  });

  test('refuses a day far from today and numbers out of range', async () => {
    await expect(words('anon', INSTALL('a'), 1, 1, 2)).rejects.toThrow('bad day');
    await expect(words('anon', INSTALL('a'), -1, 1)).rejects.toThrow('bad words');
    await expect(words('anon', INSTALL('a'), 1, 200_000_000)).rejects.toThrow('bad words');
  });

  test('two devices of one account count its words once, and each writer adds to the day', async () => {
    await words(BOB, INSTALL('b1'), 300, 9000);
    await words(BOB, INSTALL('b2'), 250, 9000);
    await words('anon', INSTALL('c'), 50, 700);
    const [today] = (
      await as<{ words: number; writers: number; devices: number }>(
        ALICE,
        'select * from public.owner_daily(3)',
      )
    ).slice(-1);
    expect(today).toMatchObject({ words: 350, writers: 2, devices: 3 });
    const [row] = await as<{ s: Record<string, unknown> }>(ALICE, 'select public.owner_summary() as s');
    expect(row?.s).toMatchObject({ now: 2, words_total: 9700, projects: 4 });
    const people = await as<{ email: string; words_30d: number; words_total: number; days_30d: number }>(
      ALICE,
      'select * from public.owner_accounts()',
    );
    expect(people.find((p) => p.email === 'bob@example.com')).toMatchObject({
      words_30d: 300,
      words_total: 9000,
      days_30d: 1,
    });
  });

  test("the owner's today sets the last day of the page", async () => {
    await words('anon', INSTALL('a'), 80, 80, 1);
    const days = await as<{ words: number }>(ALICE, `select * from public.owner_daily(2, ${TODAY} + 1)`);
    expect(days.map((d) => d.words)).toEqual([0, 80]);
    await expect(as(ALICE, `select * from public.owner_daily(2, ${TODAY} - 3)`)).rejects.toThrow('bad day');
  });
});

describe('places and signed-out visitors (migration 0010)', () => {
  beforeEach(async () => {
    await db.query('insert into app_owners (user_id) values ($1)', [ALICE]);
  });

  /** A count with a place, as the app sends it on the first count of a day. */
  const placed = (
    who: string,
    install: string,
    country: string,
    region: string | null,
    city: string | null,
  ) =>
    as(who, `select public.daily_count($1, '0.1.0', 'computer', false, ${TODAY}, 0, 0, 0, $2, $3, $4)`, [
      install,
      country,
      region,
      city,
    ]);
  const visitors = async () =>
    (await as<{ v: Record<string, unknown> }>(ALICE, 'select public.owner_visitors() as v'))[0]?.v;

  test('keeps the place of the day, and a value of the wrong shape becomes null', async () => {
    await placed('anon', INSTALL('a'), 'NZ', 'AUK', 'Auckland');
    await count('anon', INSTALL('a'));
    await placed('anon', INSTALL('b'), 'nz', 'AUK', 'Auckland');
    await placed('anon', INSTALL('c'), 'US', 'TOOLONG', 'San|Jose');
    const rows = (await db.query('select install, country, region, city from app_pings order by install'))
      .rows;
    expect(rows).toEqual([
      { install: INSTALL('a'), country: 'NZ', region: 'AUK', city: 'Auckland' },
      { install: INSTALL('b'), country: null, region: null, city: null },
      { install: INSTALL('c'), country: 'US', region: null, city: null },
    ]);
  });

  test('counts signed-out devices and the newest place of each device', async () => {
    await placed('anon', INSTALL('a'), 'NZ', 'AUK', 'Auckland');
    await placed('anon', INSTALL('b'), 'NZ', 'AUK', 'Auckland');
    await placed(BOB, INSTALL('c'), 'US', 'CA', 'San Jose');
    // A device that signed in on another day of the week is not signed out for the week. Its newest
    // place is from that day, because today's count has none.
    await count('anon', INSTALL('c'));
    await db.query(
      "insert into app_pings (install, day, user_id, app_version, device, country) values ($1, vlo_today() - 3, $2, '0.1.0', 'phone', 'FR')",
      [INSTALL('d'), BOB],
    );
    await count('anon', INSTALL('d'));
    expect(await visitors()).toEqual({
      signed_out_1d: 3,
      signed_out_7d: 2,
      signed_out_30d: 2,
      located: 4,
      countries: { FR: 1, NZ: 2, US: 1 },
      regions: { 'NZ-AUK': 2, 'US-CA': 1 },
      cities: { 'NZ|AUK|Auckland': 2, 'US|CA|San Jose': 1 },
    });
  });

  test('only an owner reads the visitors', async () => {
    await expect(as(BOB, 'select public.owner_visitors()')).rejects.toThrow('not owner');
    await expect(as('anon', 'select public.owner_visitors()')).rejects.toThrow(/permission denied/);
  });
});

test('each new function sets pg_temp last on its path, and no role reads a new table', async () => {
  const rows = (
    await db.query<{ name: string; config: string[] | null }>(
      "select p.proname as name, p.proconfig as config from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'",
    )
  ).rows;
  for (const row of rows) expect(row.config?.find((c) => c.startsWith('search_path='))).toMatch(/pg_temp$/);
  for (const table of ['app_owners', 'sync_vaults', 'app_pings', 'app_feedback', 'profiles'])
    for (const who of ['anon', ALICE])
      await expect(as(who, `select * from ${table}`)).rejects.toThrow(/permission denied/);
});

describe('the leaderboard (migration 0012)', () => {
  const CAROL = '00000000-0000-4000-8000-00000000000c';

  beforeEach(async () => {
    await db.query("insert into auth.users (id, email) values ($1, 'carol@example.com')", [CAROL]);
  });

  /** A count of words on a day, today in UTC unless the SQL of `day` says else, written straight to the table. */
  const ping = (user: string | null, install: string, words: number, day = TODAY) =>
    db.query(
      `insert into app_pings (install, day, user_id, app_version, device, words) values ($1, ${day}, $2, '0.1.0', 'computer', $3)`,
      [install, user, words],
    );

  const board = (who: string, period: string) =>
    as<{ place: number; name: string; photo: string | null; words: number; me: boolean }>(
      who,
      `select * from public.leaderboard($1, ${TODAY})`,
      [period],
    );

  test('ranks the writers of a period by their words, and counts the devices of an account once', async () => {
    await as(ALICE, "select public.profile_put('Alice Lovelace', '', 'A. L. Quill', '', $1)", [PHOTO]);
    await as(BOB, "select public.profile_put('Bob Byron', 'Bobby', '', '', null)");
    await as(CAROL, "select public.profile_put('Carol Ann Duffy', '', '', '', null)");
    await ping(ALICE, INSTALL('a1'), 300);
    await ping(ALICE, INSTALL('a2'), 250);
    await ping(BOB, INSTALL('b'), 500);
    await ping(CAROL, INSTALL('c'), 0);
    // Last year, so no board of this year holds it.
    await ping(CAROL, INSTALL('c'), 9000, `date_trunc('year', ${TODAY})::date - 1`);
    // A device with no account is not on the board.
    await ping(null, INSTALL('d'), 800);

    expect(await board(ALICE, 'day')).toEqual([
      { place: 1, name: 'Bobby', photo: null, words: 500, me: false },
      { place: 2, name: 'A. L. Quill', photo: PHOTO, words: 300, me: true },
    ]);
    expect((await board(BOB, 'year')).map((r) => [r.name, r.words, r.me])).toEqual([
      ['Bobby', 500, true],
      ['A. L. Quill', 300, false],
    ]);
  });

  test('a writer can leave the board and come back', async () => {
    await as(ALICE, "select public.profile_put('Alice', '', '', '', null)");
    await ping(ALICE, INSTALL('a'), 100);
    expect(await as(ALICE, 'select public.leaderboard_show() as on')).toEqual([{ on: true }]);
    expect(await as(ALICE, 'select public.leaderboard_show(false) as on')).toEqual([{ on: false }]);
    expect(await board(BOB, 'week')).toEqual([]);
    await as(ALICE, 'select public.leaderboard_show(true)');
    expect((await board(BOB, 'month')).map((r) => r.name)).toEqual(['Alice']);
    // An account with no profile is never on the board.
    expect(await as(CAROL, 'select public.leaderboard_show(true) as on')).toEqual([{ on: false }]);
  });

  test('refuses the anon role and a period that is not a day, a week, a month or a year', async () => {
    await expect(board(ALICE, 'decade')).rejects.toThrow('bad period');
    await expect(board('anon', 'day')).rejects.toThrow(/permission denied/);
  });
});
