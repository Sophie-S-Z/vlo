import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Standing } from '@/features/sprints/room';

/*
 * Plan Task K7 (roadmap F60, decision K7, Review Focus 5): sprints, month challenges and the sprint room.
 * The room's SQL limits are in sprint-rooms.test.ts.
 */

type Modules = typeof import('@/features/sprints/room') &
  typeof import('@/features/sprints/sprint') &
  typeof import('@/features/focus/sessions') &
  typeof import('@/features/progress/progress') & {
    createProject: typeof import('@/features/library/projects').createProject;
    db: typeof import('@/lib/db').db;
  };
let m: Modules;
let calls: { name: string; body: Record<string, unknown> }[] = [];
let answer: () => Response = () => Response.json([]);

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://vlo-test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  calls = [];
  answer = () => Response.json([]);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: URL | string, init: RequestInit) => {
      calls.push({
        name: url.toString().split('/').at(-1) ?? '',
        body: JSON.parse(init.body as string) as Record<string, unknown>,
      });
      return Promise.resolve(answer());
    }),
  );
  m = {
    ...(await import('@/features/sprints/room')),
    ...(await import('@/features/sprints/sprint')),
    ...(await import('@/features/focus/sessions')),
    ...(await import('@/features/progress/progress')),
    createProject: (await import('@/features/library/projects')).createProject,
    db: (await import('@/lib/db')).db,
  };
  await m.db.open();
  Object.defineProperty(navigator, 'storage', { configurable: true, value: {} });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'storage');
  await m.db.delete();
});

describe('sprints', () => {
  test('a sprint keeps its target and counts only the words of its own time', async () => {
    const { project, firstItemId } = await m.createProject({ title: 'Salt', templates: ['novel'] });
    await m.db.items.update(firstItemId, { wordCount: 900 });
    const start = await m.projectTotals(project.id);
    const session = await m.startSession(project.id, 15, 500);
    await m.db.items.update(firstItemId, { wordCount: 1420 });
    expect(await m.closeSession(project.id, session.id, start)).toBe(520);
    expect(await m.db.sessions.get(session.id)).toMatchObject({ target: 500, wordsAdded: 520 });
    // A plain session has no target.
    expect(await m.startSession(project.id, 10)).not.toHaveProperty('target');
  });
});

describe('month challenges', () => {
  const record = {
    '2026-10-31': 400,
    '2026-11-01': 300,
    '2026-11-02': -50,
    '2026-11-10': 200,
    '2026-12-01': 9,
  };

  test('the month sums the days of its own month, and a day under 0 counts as 0', () => {
    const days = m.monthDays(record, '2026-11');
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual({ day: '2026-11-01', words: 300 });
    expect(days[1]).toEqual({ day: '2026-11-02', words: 0 });
    expect(m.monthDays({}, '2028-02')).toHaveLength(29);
    const state = m.challengeState({ month: '2026-11', words: 1000 }, record, '2026-11-10');
    expect(state.total).toBe(500);
    // 500 left, plus today's 200, over the 21 days from today to the 30th.
    expect(state.perDay).toBe(Math.ceil(700 / 21));
    expect(m.challengeState({ month: '2026-11', words: 400 }, record, '2026-11-10').perDay).toBeNull();
    expect(m.challengeState({ month: '2026-10', words: 1000 }, record, '2026-11-10').perDay).toBeNull();
  });

  test('a challenge saves with its month, ends, and refuses a wrong month or target', async () => {
    const { project } = await m.createProject({ title: 'Salt', templates: ['novel'] });
    await m.setGoals(project.id, { challenge: { month: '2026-11', words: 50_000 } });
    expect((await m.db.projects.get(project.id))?.settings.challenge).toEqual({
      month: '2026-11',
      words: 50_000,
    });
    await expect(m.setGoals(project.id, { challenge: { month: '2026-13', words: 10 } })).rejects.toThrow(
      'Pick a month.',
    );
    await expect(m.setGoals(project.id, { challenge: { month: '2026-11', words: 0 } })).rejects.toThrow(
      RangeError,
    );
    await m.setGoals(project.id, { challenge: null });
    expect((await m.db.projects.get(project.id))?.settings).not.toHaveProperty('challenge');
  });
});

describe('the sprint room', () => {
  test('each request holds only the code, the member id, the nickname and the count', async () => {
    answer = () => Response.json('KXMQRT');
    const code = await m.createRoom();
    const standings: Standing[] = [{ nickname: 'Ana', words: 0, mine: true }];
    answer = () => Response.json(standings);
    const { room } = await m.joinRoom(` ${code.toLowerCase().slice(0, 3)}-${code.slice(3)} `, '  Ana \n P ');
    expect(room).toMatchObject({ code: 'KXMQRT', nickname: 'Ana P' });
    expect(room.member).toMatch(/^[A-Za-z0-9_-]{22}$/);
    await m.postWords(room, 320);
    expect(calls).toEqual([
      { name: 'room_create', body: {} },
      { name: 'room_join', body: { p_code: 'KXMQRT', p_member: room.member, p_nickname: 'Ana P' } },
      { name: 'room_post', body: { p_code: 'KXMQRT', p_member: room.member, p_words: 320 } },
    ]);
    const log = await m.db.networkLog.toArray();
    expect(log.map((e) => e.purpose)).toEqual(['room', 'room', 'room']);
  });

  test('a wrong code or nickname sends nothing, and a full room and an old code say why', async () => {
    await expect(m.joinRoom('ABC', 'Ana')).rejects.toThrow('A room code is six letters.');
    await expect(m.joinRoom('ABCDEF', '   ')).rejects.toThrow('Type a nickname of 1 to 24 characters.');
    await expect(m.joinRoom('ABCDEF', 'A'.repeat(25))).rejects.toThrow(RangeError);
    expect(calls).toEqual([]);
    const refuse = (message: string) => async () => {
      answer = () => Response.json({ message }, { status: 400 });
      try {
        await m.joinRoom('ABCDEF', 'Ana');
      } catch (error) {
        return m.roomMessage(error);
      }
      return '';
    };
    expect(await refuse('room full')()).toBe('This room is full. A room holds 20 writers.');
    expect(await refuse('unknown room')()).toBe(
      'No room has this code now. A room ends 24 hours after someone makes it.',
    );
  });
});
