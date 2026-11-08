import { afterEach, beforeEach, expect, test } from 'vitest';
import { endSession, projectTotals, startSession } from '@/features/focus/sessions';
import { createProject } from '@/features/library/projects';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';

const realNow = clock.now.bind(clock);
let now = 1_000_000;

beforeEach(async () => {
  await db.open();
  clock.now = () => now;
  Object.defineProperty(navigator, 'storage', { configurable: true, value: {} });
});
afterEach(async () => {
  clock.now = realNow;
  Reflect.deleteProperty(navigator, 'storage');
  await db.delete();
});

test('a session records when it started and ended and the words it added', async () => {
  const session = await startSession('p', 25);
  expect(session).toMatchObject({ projectId: 'p', startedAt: 1_000_000, endedAt: 1_000_000 + 25 * 60_000 });
  now += 20 * 60_000;
  await endSession(session.id, 312, 1);
  expect(await db.sessions.get(session.id)).toMatchObject({
    startedAt: 1_000_000,
    endedAt: 1_000_000 + 20 * 60_000,
    wordsAdded: 312,
    poemsAdded: 1,
  });
});

test('deleting words never records a negative session', async () => {
  const session = await startSession('p', 10);
  await endSession(session.id, -40, -1);
  expect(await db.sessions.get(session.id)).toMatchObject({ wordsAdded: 0, poemsAdded: 0 });
});

test('projectTotals sums word counts and counts poems', async () => {
  const { project, firstItemId } = await createProject({ title: 'Salt', templates: ['poetry'] });
  await db.items.update(firstItemId, { wordCount: 12 });
  expect(await projectTotals(project.id)).toEqual({ words: 12, poems: 1 });
});
