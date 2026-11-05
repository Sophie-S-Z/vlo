import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openTargets } from '@/features/binder/tree';
import { createProject } from '@/features/library/projects';
import { TEMPLATES } from '@/features/library/templates';
import { DEFAULT_GOAL, goalsOf, setGoals } from '@/features/progress/progress';
import { db, type Item } from '@/lib/db';

/* Plan Task C9 (F21): the goal settings and the item that a tile opens. */

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

describe('setGoals', () => {
  it('keeps goals and streaks off by default, and turning them on starts at 500 words', async () => {
    const { project } = await createProject({ title: 'Debt', template: 'novel' });
    expect(goalsOf(project.settings)).toEqual({ streaksEnabled: false, goalWordsPerDay: 500, restDays: [] });
    expect(project.settings.goalWordsPerDay).toBeUndefined();
    await setGoals(project.id, { streaksEnabled: true });
    expect((await db.projects.get(project.id))?.settings).toMatchObject({
      streaksEnabled: true,
      goalWordsPerDay: DEFAULT_GOAL,
    });
  });

  it('keeps the goal of last time when the writer turns goals off and on', async () => {
    const { project } = await createProject({ title: 'Debt', template: 'novel' });
    await setGoals(project.id, { streaksEnabled: true, goalWordsPerDay: 750 });
    await setGoals(project.id, { streaksEnabled: false });
    await setGoals(project.id, { streaksEnabled: true });
    expect((await db.projects.get(project.id))?.settings.goalWordsPerDay).toBe(750);
  });

  it('sorts the rest days and drops a repeat or a wrong day', async () => {
    const { project } = await createProject({ title: 'Debt', template: 'novel' });
    await setGoals(project.id, { restDays: [6, 0, 6, 9, 2.5] });
    expect((await db.projects.get(project.id))?.settings.restDays).toEqual([0, 6]);
  });

  it('turns one rest day on or off inside the write, so quick taps keep each day', async () => {
    const { project } = await createProject({ title: 'Debt', template: 'novel' });
    await Promise.all([1, 2, 3].map((day) => setGoals(project.id, { toggleRestDay: day })));
    expect((await db.projects.get(project.id))?.settings.restDays).toEqual([1, 2, 3]);
    await setGoals(project.id, { toggleRestDay: 2 });
    expect((await db.projects.get(project.id))?.settings.restDays).toEqual([1, 3]);
  });

  it('refuses a goal outside 1 to 100,000 words', async () => {
    const { project } = await createProject({ title: 'Debt', template: 'novel' });
    for (const goal of [0, -5, 1.5, 100_001])
      await expect(setGoals(project.id, { goalWordsPerDay: goal })).rejects.toThrow(
        'Type a goal from 1 to 100,000 words.',
      );
  });
});

describe('openTargets', () => {
  const item = (id: string, kind: Item['kind'], parentId: string | null, order: string): Item => ({
    id,
    projectId: 'p',
    parentId,
    kind,
    title: id,
    status: 'idea',
    order,
    wordCount: 0,
    createdAt: 0,
    updatedAt: 0,
  });
  const items = [
    item('part', 'part', null, 'a'),
    item('ch1', 'chapter', 'part', 'a'),
    item('ch2', 'chapter', 'part', 'b'),
    item('s1', 'scene', 'ch2', 'a'),
    item('empty', 'chapter', null, 'b'),
    item('note', 'note', null, 'c'),
  ];
  const targets = openTargets(items, TEMPLATES.novel.editorKind);

  it('opens a scene or note itself, and a folder opens its first scene', () => {
    expect(targets.get('s1')?.id).toBe('s1');
    expect(targets.get('note')?.id).toBe('note');
    expect(targets.get('part')?.id).toBe('s1');
    expect(targets.get('ch2')?.id).toBe('s1');
  });

  it('opens nothing for a folder with no scene, and never a scene outside it', () => {
    expect(targets.get('ch1')).toBeUndefined();
    expect(targets.get('empty')).toBeUndefined();
    expect(targets.get('gone')).toBeUndefined();
  });
});
