import { afterEach, beforeEach, expect, test } from 'vitest';
import { clockText } from '@/features/focus/SessionTimer';
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

test('a stopwatch has no planned end, and closing it records the real end (Ellipsus October 2026)', async () => {
  const start = now;
  const session = await startSession('p', null);
  expect(session).toMatchObject({ startedAt: start, endedAt: start });
  now += 95 * 60_000;
  await endSession(session.id, 1_200, 0);
  expect(await db.sessions.get(session.id)).toMatchObject({ endedAt: start + 95 * 60_000 });
});

test('the timer shows minutes and seconds, and hours from one hour', () => {
  expect(clockText(600_000)).toBe('10:00');
  // Time left rounds up, so 0:00 shows only at the end. Time gone rounds down.
  expect(clockText(59_001)).toBe('1:00');
  expect(clockText(59_999, 'down')).toBe('0:59');
  expect(clockText(3_725_000, 'down')).toBe('1:02:05');
  expect(clockText(-5)).toBe('0:00');
});
