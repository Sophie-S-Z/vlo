import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { addItem } from '@/features/binder/items';
import { createProject } from '@/features/library/projects';
import {
  addStage,
  byTheme,
  cleanThemes,
  deleteStage,
  moveStage,
  setMemory,
  themesOf,
  updateStage,
} from '@/features/timeline/memories';
import { db, type Item } from '@/lib/db';
import { sortByOrder } from '@/lib/order';

/* Memory Timeline data (spec 8.2, plan Task C4): memory dates, themes and life stages. */

beforeEach(async () => {
  await db.open();
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: () => Promise.resolve(true) },
  });
});
afterEach(async () => {
  Reflect.deleteProperty(navigator, 'storage');
  await db.delete();
});

async function memoir() {
  const { project } = await createProject({ title: 'Salt Kitchen', template: 'memoir' });
  const first = (await db.items.where('projectId').equals(project.id).toArray()).find(
    (i) => i.kind === 'memory',
  );
  if (!first) throw new Error('The memoir starter has no memory.');
  return { project, first };
}

describe('memories', () => {
  test('a memory takes a date, themes and a life stage, and each can be cleared', async () => {
    const { project, first } = await memoir();
    const before = (await db.projects.get(project.id))?.updatedAt ?? 0;
    await setMemory(first.id, { date: '1994-07', themes: [' Food ', 'family', 'food', ''] });
    let item = await db.items.get(first.id);
    expect(item?.memory).toEqual({ date: '1994-07', themes: ['Food', 'family'] });
    expect((await db.projects.get(project.id))?.updatedAt).toBeGreaterThanOrEqual(before);

    const stage = await addStage(project.id, {
      name: 'Childhood',
      start: '1988',
      end: '1999',
      color: 'sage',
    });
    await setMemory(first.id, { lifeStageId: stage.id });
    item = await db.items.get(first.id);
    expect(item?.memory?.lifeStageId).toBe(stage.id);

    await setMemory(first.id, { date: null, lifeStageId: null });
    item = await db.items.get(first.id);
    expect(item?.memory).toEqual({ themes: ['Food', 'family'] });
  });

  test('a wrong date is refused, and the memory stays as it was', async () => {
    const { first } = await memoir();
    await setMemory(first.id, { date: '1994' });
    await expect(setMemory(first.id, { date: '1994-02-30' })).rejects.toThrow('date');
    expect((await db.items.get(first.id))?.memory?.date).toBe('1994');
  });

  test('themes: the list of a project, and the memories under each theme once', async () => {
    const { project, first } = await memoir();
    const second = await addItem(project.id, null, 'memory', 'The bakery');
    const third = await addItem(project.id, null, 'memory', 'The flood');
    await setMemory(first.id, { themes: ['Food', 'Family'] });
    await setMemory(second.id, { themes: ['food'] });
    await setMemory(third.id, { date: '2001' });
    // Binder order: the page passes memories in that order.
    const items = sortByOrder(await db.items.where('projectId').equals(project.id).toArray());

    expect(themesOf(items)).toEqual(['Family', 'Food']);
    const groups = byTheme(items.filter((i): i is Item => i.kind === 'memory'));
    expect(groups.map((g) => [g.theme, g.memories.map((m) => m.title)])).toEqual([
      ['Family', ['Memory 1']],
      ['Food', ['Memory 1', 'The bakery']],
      [null, ['The flood']],
    ]);
    expect(cleanThemes(['a', 'A', ' b '])).toEqual(['a', 'b']);
  });
});

describe('life stages', () => {
  test('add, rename, recolor, reorder and delete; a delete leaves memories in place', async () => {
    const { project, first } = await memoir();
    const one = await addStage(project.id, { name: 'Childhood', start: '1988', end: '1999', color: 'sage' });
    const two = await addStage(project.id, {
      name: 'College',
      start: '2006-09',
      end: '2010-06',
      color: 'sky',
    });
    const names = async () =>
      sortByOrder(await db.lifeStages.where('projectId').equals(project.id).toArray()).map((s) => s.name);
    expect(await names()).toEqual(['Childhood', 'College']);

    await updateStage(one.id, { name: 'Early years', color: 'amber', start: '1987-03' });
    expect(await db.lifeStages.get(one.id)).toMatchObject({
      name: 'Early years',
      color: 'amber',
      start: '1987-03',
    });
    await expect(updateStage(one.id, { end: '1980' })).rejects.toThrow('end');
    await expect(updateStage(one.id, { start: 'soon' })).rejects.toThrow('date');
    await expect(
      addStage(project.id, { name: ' ', start: '1990', end: '1991', color: 'sage' }),
    ).rejects.toThrow('name');

    await moveStage(two.id, -1);
    expect(await names()).toEqual(['College', 'Early years']);

    await setMemory(first.id, { date: '1990', lifeStageId: one.id });
    await deleteStage(one.id);
    expect(await names()).toEqual(['College']);
    expect((await db.items.get(first.id))?.memory).toEqual({ date: '1990', themes: [] });
  });
});
