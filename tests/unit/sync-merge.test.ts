import { expect, test } from 'vitest';
import { clockKey } from '@/features/sync/clock';
import { mergeRows, type Version } from '@/features/sync/merge';

/* Plan Task I6 (decision R6): the newer change of a row wins, and no day loses words. */

const card = (id: string, at: number, title?: string): Version => ({
  table: 'cards',
  id,
  at,
  ...(title === undefined ? {} : { row: { id, projectId: 'p', title } }),
});
const project = (at: number, title: string, wordsByDay: Record<string, number>): Version => ({
  table: 'projects',
  id: 'p',
  at,
  row: { id: 'p', title, settings: { streaksEnabled: true, wordsByDay } },
});
const side = (...versions: Version[]) => new Map(versions.map((v) => [clockKey(v.table, v.id), v]));

test('the newer change wins: an edit, a delete newer than an edit, and an edit newer than a delete', () => {
  const local = side(card('a', 5, 'Mine'), card('b', 5, 'Mine'), card('c', 9), card('d', 5, 'Mine'));
  const plan = mergeRows(local, [
    card('a', 7, 'Theirs'),
    card('b', 3, 'Old'),
    card('c', 12, 'Back again'),
    card('d', 6),
    card('e', 1, 'New'),
  ]);
  expect(plan.take).toEqual([
    card('a', 7, 'Theirs'),
    card('c', 12, 'Back again'),
    card('d', 6),
    card('e', 1, 'New'),
  ]);
  expect(plan.keep).toEqual([]);
  expect(plan.revive).toEqual([]);
});

test('a project row keeps the larger count of each day, whichever row wins', () => {
  const mine = project(5, 'Salt', { '2026-11-08': 300, '2026-11-09': 40 });
  const older = project(3, 'Old title', { '2026-11-07': 90, '2026-11-09': 120 });
  const days = { '2026-11-08': 300, '2026-11-09': 120, '2026-11-07': 90 };
  // This device's row is newer: it keeps its title and takes the other device's days.
  const kept = mergeRows(side(mine), [older]);
  expect(kept.take).toEqual([]);
  expect(kept.keep[0]?.at).toBe(5);
  expect(kept.keep[0]?.row).toMatchObject({
    title: 'Salt',
    settings: { streaksEnabled: true, wordsByDay: days },
  });
  // The other device's row is newer: its title wins, with the days of both.
  const taken = mergeRows(side(mine), [project(8, 'Salt and iron', { '2026-11-09': 120, '2026-11-07': 90 })]);
  expect(taken.take[0]?.row).toMatchObject({ title: 'Salt and iron', settings: { wordsByDay: days } });
  // Nothing to take when this device has every day already.
  expect(mergeRows(side(mine), [project(2, 'Salt', { '2026-11-08': 10 })])).toEqual({
    take: [],
    keep: [],
    revive: [],
  });
});

test('a delete loses to an edit that it never saw, and the row keeps its project', () => {
  const edited = card('a', 7, 'Mine');
  const mine = project(6, 'Salt', {});
  const plan = mergeRows(side(edited, card('b', 5, 'Mine'), mine), [
    { ...card('a', 9), seen: 5 },
    { ...card('b', 9), seen: 5 },
    { table: 'projects', id: 'p', at: 9, seen: 6 },
  ]);
  // The delete saw the change of "b" at 5, so it wins there.
  expect(plan.take).toEqual([{ ...card('b', 9), seen: 5 }]);
  expect(plan.revive).toEqual([edited, mine]);
});
