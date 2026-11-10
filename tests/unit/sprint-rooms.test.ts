// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

/*
 * Plan Task K7 (roadmap F60, decision K7): the sprint rooms of migration 0006 in PGlite, called as the
 * anon role, as the app calls them through PostgREST. The setup is the one of migrations.test.ts.
 */

const MIGRATIONS = [
  '0001_shares.sql',
  '0002_usage.sql',
  '0003_cleanup.sql',
  '0004_limits.sql',
  '0005_sync.sql',
  '0006_rooms.sql',
];
/** A member id of the shape that Vlo makes: 16 bytes in base64url. */
const M = (name: string) => name.padEnd(22, '0');
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
  await db.exec('reset role; delete from sprint_rooms;');
});

async function asAnon<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec('set role anon');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

interface Standing {
  nickname: string;
  words: number;
  mine: boolean;
}

async function newRoom(): Promise<string> {
  const [row] = await asAnon<{ code: string }>('select public.room_create() as code');
  if (!row) throw new Error('No room.');
  return row.code;
}

const join = (code: string, member: string, nickname: string) =>
  asAnon<Standing>('select * from public.room_join($1, $2, $3)', [code, member, nickname]);
const post = (code: string, member: string, words: number) =>
  asAnon<Standing>('select * from public.room_post($1, $2, $3)', [code, member, words]);

describe('0006_rooms', () => {
  test('the anon role cannot read or write the tables, or run the helpers and the cleanup', async () => {
    await expect(asAnon('select * from sprint_rooms')).rejects.toThrow(/permission denied/);
    await expect(asAnon('select * from sprint_members')).rejects.toThrow(/permission denied/);
    await expect(asAnon('select public.cleanup_rooms()')).rejects.toThrow(/permission denied/);
    const code = await newRoom();
    await expect(asAnon('select public.room_open($1)', [code])).rejects.toThrow(/permission denied/);
    await expect(asAnon('select * from public.room_standings($1, $2)', [code, M('a')])).rejects.toThrow(
      /permission denied/,
    );
  });

  test('a code is six letters with no I or O, and the room ends after 24 hours', async () => {
    const code = await newRoom();
    expect(code).toMatch(/^[A-HJ-NP-Z]{6}$/);
    const [room] = (
      await db.query<{ hours: number }>(
        'select extract(epoch from expires_at - created_at) / 3600 as hours from sprint_rooms where code = $1',
        [code],
      )
    ).rows;
    expect(Number(room?.hours)).toBe(24);
  });

  test('the standings give nicknames and words, most words first, and never a member id', async () => {
    const code = await newRoom();
    await join(code, M('a'), 'Ana');
    await join(code, M('b'), 'Ben');
    await post(code, M('a'), 120);
    const standings = await post(code, M('b'), 300);
    expect(standings).toEqual([
      { nickname: 'Ben', words: 300, mine: true },
      { nickname: 'Ana', words: 120, mine: false },
    ]);
    // A second join changes the nickname and keeps the words.
    expect(await join(code, M('a'), 'Ana P')).toEqual([
      { nickname: 'Ben', words: 300, mine: false },
      { nickname: 'Ana P', words: 120, mine: true },
    ]);
  });

  test('a room holds at most 20 writers', async () => {
    const code = await newRoom();
    for (let i = 0; i < 20; i += 1) await join(code, M(`m${String(i)}-`), `Writer ${String(i)}`);
    await expect(join(code, M('late'), 'Late')).rejects.toThrow('room full');
    // A writer who is in the room can still join again.
    await expect(join(code, M('m3-'), 'Three')).resolves.toHaveLength(20);
  });

  test('an old code, a wrong code and a member who did not join get "unknown room"', async () => {
    const code = await newRoom();
    await join(code, M('a'), 'Ana');
    await db.exec(`update sprint_rooms set expires_at = now() - interval '1 minute' where code = '${code}'`);
    await expect(join(code, M('b'), 'Ben')).rejects.toThrow('unknown room');
    await expect(post(code, M('a'), 10)).rejects.toThrow('unknown room');
    const other = await newRoom();
    await expect(post(other, M('a'), 10)).rejects.toThrow('unknown room');
    await expect(join('ABCDEI', M('a'), 'Ana')).rejects.toThrow('unknown room');
    await expect(join(other.toLowerCase(), M('a'), 'Ana')).rejects.toThrow('unknown room');
  });

  test('each value is checked: the member id, the nickname and the words', async () => {
    const code = await newRoom();
    await expect(join(code, 'short', 'Ana')).rejects.toThrow('bad member');
    for (const nickname of ['', ' Ana', 'Ana ', 'A'.repeat(25), 'An\na'])
      await expect(join(code, M('a'), nickname)).rejects.toThrow('bad nickname');
    await join(code, M('a'), 'Ana');
    await expect(post(code, M('a'), -1)).rejects.toThrow('bad words');
    await expect(post(code, M('a'), 1_000_001)).rejects.toThrow('bad words');
  });

  test('at most 60 new rooms in an hour, and the cleanup removes ended rooms with their writers', async () => {
    const code = await newRoom();
    await join(code, M('a'), 'Ana');
    await db.exec(
      "insert into sprint_rooms (code) select 'AAAA' || chr(65 + i / 24) || chr(65 + i % 24) from generate_series(0, 58) i on conflict do nothing",
    );
    await expect(newRoom()).rejects.toThrow('server busy');
    await db.exec(`update sprint_rooms set expires_at = now() - interval '1 minute' where code = '${code}'`);
    const [done] = (await db.query<{ n: number }>('select public.cleanup_rooms() as n')).rows;
    expect(done?.n).toBe(1);
    const [left] = (await db.query<{ n: number }>('select count(*)::int as n from sprint_members')).rows;
    expect(left?.n).toBe(0);
  });
});
