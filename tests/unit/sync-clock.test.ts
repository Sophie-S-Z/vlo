import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { onLocalChange, remoteTransaction } from '@/features/sync/clock';
import { clock } from '@/lib/clock';
import { db, type Card } from '@/lib/db';

/* Plan Task I6 (roadmap F49, ADR 0008): the middleware stamps each change to a synced table. */

const card = (id: string, projectId = 'p'): Card => ({ id, projectId, title: id, x: 0, y: 0, color: 'sky' });

let now = 1000;

beforeEach(async () => {
  await db.open();
  now = 1000;
  vi.spyOn(clock, 'now').mockImplementation(() => now);
});

afterEach(async () => {
  onLocalChange(null);
  await db.delete();
});

const entries = async () =>
  (await db.syncClock.toArray()).map(({ key, projectId, at, gone }) => ({
    key,
    projectId,
    at,
    ...(gone ? { gone } : {}),
  }));

test('a put, a bulk put and a delete by project in one transaction each get a stamp', async () => {
  const changed = vi.fn();
  onLocalChange(changed);
  await db.transaction('rw', db.cards, db.projects, async () => {
    await db.cards.put(card('c1'));
    await db.cards.bulkPut([card('c2'), card('c3', 'q')]);
    now = 2000;
    await db.cards.where('projectId').equals('p').delete();
  });
  expect(await entries()).toEqual([
    { key: 'cards:c1', projectId: 'p', at: 2000, gone: true },
    { key: 'cards:c2', projectId: 'p', at: 2000, gone: true },
    { key: 'cards:c3', projectId: 'q', at: 1000 },
  ]);
  expect(changed).toHaveBeenCalled();
  // A project's own row is its project. A clear reads its keys first.
  await db.projects.put({ id: 'p' } as never);
  await db.cards.clear();
  expect((await db.syncClock.get('projects:p'))?.projectId).toBe('p');
  expect((await db.syncClock.get('cards:c3'))?.gone).toBe(true);
});

test('a failed transaction, a merge and a table that does not sync record nothing', async () => {
  await expect(
    db.transaction('rw', db.cards, async () => {
      await db.cards.put(card('c1'));
      throw new Error('stop');
    }),
  ).rejects.toThrow('stop');
  await remoteTransaction(db, [db.cards, db.syncClock], async () => {
    await db.cards.put(card('c2'));
  });
  await db.itemTexts.put({ itemId: 'i', projectId: 'p', text: '', updatedAt: 0 });
  expect(await db.syncClock.count()).toBe(0);
  expect(await db.cards.count()).toBe(1);
});
