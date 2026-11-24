import { describe, expect, test, vi } from 'vitest';

/* Migration 0020 (ADR 0016): a load of the leaderboard brings each photo once, and keeps it for the next load. */

const calls = vi.hoisted(() => ({ args: [] as Record<string, unknown>[], rows: [] as unknown[] }));
vi.mock('@/features/account/auth', () => ({
  accountRpc: (_name: string, args: Record<string, unknown>) => {
    calls.args.push(args);
    return Promise.resolve(calls.rows);
  },
}));

const { leaderboard } = await import('@/features/account/leaderboard');
const row = (name: string, photo: string | null, photoId: string | null) => ({
  place: 1,
  name,
  photo,
  photo_id: photoId,
  words: 10,
  me: false,
});

describe('the leaderboard photos', () => {
  test('a later load names the photos that it has, and fills them in from the last load', async () => {
    calls.rows = [row('Ada', 'data:ada', 'id-ada'), row('Basho', null, null)];
    expect(await leaderboard('day', '2026-11-24')).toEqual([
      { place: 1, name: 'Ada', photo: 'data:ada', words: 10, me: false },
      { place: 1, name: 'Basho', photo: null, words: 10, me: false },
    ]);
    expect(calls.args[0]).not.toHaveProperty('p_have');

    calls.rows = [row('Ada', null, 'id-ada')];
    expect((await leaderboard('day', '2026-11-24'))[0]?.photo).toBe('data:ada');
    expect(calls.args[1]).toMatchObject({ p_have: ['id-ada'] });

    // A new photo comes with a new id, and the old one leaves the list.
    calls.rows = [row('Ada', 'data:ada-2', 'id-ada-2')];
    expect((await leaderboard('day', '2026-11-24'))[0]?.photo).toBe('data:ada-2');
    await leaderboard('day', '2026-11-24');
    expect(calls.args[3]).toMatchObject({ p_have: ['id-ada-2'] });
  });

  test('a server from before migration 0020 gives no ids, and gets no list', async () => {
    calls.args = [];
    calls.rows = [{ place: 1, name: 'Ada', photo: 'data:ada', words: 10, me: false }];
    await leaderboard('week', '2026-11-24');
    await leaderboard('week', '2026-11-24');
    expect(calls.args[1]).not.toHaveProperty('p_have');
  });
});
