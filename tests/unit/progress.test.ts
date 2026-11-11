import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectBackup } from '@/features/backup/backup';
import { readBackup, writeBackup } from '@/features/backup/file';
import { openTargets } from '@/features/binder/tree';
import { createProject } from '@/features/library/projects';
import { TEMPLATES } from '@/features/library/templates';
import { DEFAULT_GOAL, goalsOf, setGoals, todayGoal } from '@/features/progress/progress';
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
    const { project } = await createProject({ title: 'Debt', templates: ['novel'] });
    expect(goalsOf(project.settings)).toEqual({ streaksEnabled: false, goalWordsPerDay: 500, restDays: [] });
    expect(project.settings.goalWordsPerDay).toBeUndefined();
    await setGoals(project.id, { streaksEnabled: true });
    expect((await db.projects.get(project.id))?.settings).toMatchObject({
      streaksEnabled: true,
      goalWordsPerDay: DEFAULT_GOAL,
    });
  });

  it('keeps the goal of last time when the writer turns goals off and on', async () => {
    const { project } = await createProject({ title: 'Debt', templates: ['novel'] });
    await setGoals(project.id, { streaksEnabled: true, goalWordsPerDay: 750 });
    await setGoals(project.id, { streaksEnabled: false });
    await setGoals(project.id, { streaksEnabled: true });
    expect((await db.projects.get(project.id))?.settings.goalWordsPerDay).toBe(750);
  });

  it('sorts the rest days and drops a repeat or a wrong day', async () => {
    const { project } = await createProject({ title: 'Debt', templates: ['novel'] });
    await setGoals(project.id, { restDays: [6, 0, 6, 9, 2.5] });
    expect((await db.projects.get(project.id))?.settings.restDays).toEqual([0, 6]);
  });

  it('turns one rest day on or off inside the write, so quick taps keep each day', async () => {
    const { project } = await createProject({ title: 'Debt', templates: ['novel'] });
    await Promise.all([1, 2, 3].map((day) => setGoals(project.id, { toggleRestDay: day })));
    expect((await db.projects.get(project.id))?.settings.restDays).toEqual([1, 2, 3]);
    await setGoals(project.id, { toggleRestDay: 2 });
    expect((await db.projects.get(project.id))?.settings.restDays).toEqual([1, 3]);
  });

  it('refuses a goal outside 1 to 100,000 words', async () => {
    const { project } = await createProject({ title: 'Debt', templates: ['novel'] });
    for (const goal of [0, -5, 1.5, 100_001])
      await expect(setGoals(project.id, { goalWordsPerDay: goal })).rejects.toThrow(
        'Type a goal from 1 to 100,000 words.',
      );
  });
});

describe('deadline (plan Task H2, F46)', () => {
  it('stores a deadline, removes it, and refuses a wrong date or target', async () => {
    const { project } = await createProject({ title: 'Debt', templates: ['novel'] });
    await setGoals(project.id, { deadline: { date: '2026-12-31', words: 80_000 } });
    expect((await db.projects.get(project.id))?.settings.deadline).toEqual({
      date: '2026-12-31',
      words: 80_000,
    });
    await expect(setGoals(project.id, { deadline: { date: '', words: 80_000 } })).rejects.toThrow(RangeError);
    await expect(setGoals(project.id, { deadline: { date: '2026-12-31', words: 0 } })).rejects.toThrow(
      'Type a target from 1 to 10,000,000 words.',
    );
    await setGoals(project.id, { deadline: null });
    expect((await db.projects.get(project.id))?.settings).not.toHaveProperty('deadline');
  });

  it('goes in a backup, and a damaged deadline fails the check', async () => {
    const { project } = await createProject({ title: 'Debt', templates: ['novel'] });
    await setGoals(project.id, { deadline: { date: '2026-12-31', words: 80_000 } });
    const backup = await collectBackup(project.id, { music: false });
    expect((await readBackup(await writeBackup(backup))).project.settings.deadline).toEqual({
      date: '2026-12-31',
      words: 80_000,
    });
    backup.project.settings.deadline = { date: '31/12/2026', words: 80_000 };
    await expect(readBackup(await writeBackup(backup))).rejects.toThrow('damaged');
  });
});

describe("a goal to cut, and today's goal on the writing screen", () => {
  it('stores the words of the project with a deadline, and the backup check reads them', async () => {
    const { project } = await createProject({ title: 'Debt', templates: ['novel'] });
    await setGoals(project.id, {
      deadline: { date: '2026-12-31', words: 80_000, from: 95_000, since: '2026-11-09' },
    });
    expect((await db.projects.get(project.id))?.settings.deadline).toEqual({
      date: '2026-12-31',
      words: 80_000,
      from: 95_000,
      since: '2026-11-09',
    });
    await expect(
      setGoals(project.id, { deadline: { date: '2026-12-31', words: 80_000, since: '9 Nov' } }),
    ).rejects.toThrow(RangeError);
    await expect(
      setGoals(project.id, { deadline: { date: '2026-12-31', words: 80_000, from: -1 } }),
    ).rejects.toThrow(RangeError);
    const backup = await collectBackup(project.id, { music: false });
    expect((await readBackup(await writeBackup(backup))).project.settings.deadline).toMatchObject({
      from: 95_000,
    });
    backup.project.settings.deadline = { date: '2026-12-31', words: 80_000, from: 1.5 };
    await expect(readBackup(await writeBackup(backup))).rejects.toThrow('damaged');
  });

  it('gives no goal while goals are off, and the words a day with no deadline', async () => {
    const { project } = await createProject({ title: 'Debt', templates: ['novel'] });
    expect(todayGoal(project.settings, 0, '2026-11-09')).toBeNull();
    const on = { ...project.settings, streaksEnabled: true, wordsByDay: { '2026-11-09': 120 } };
    expect(todayGoal(on, 120, '2026-11-09')).toEqual({ goal: 500, done: 120, cut: false });
  });

  it('gives the daily goal of a running deadline, and counts the words removed with a goal to cut', async () => {
    const { project } = await createProject({ title: 'Debt', templates: ['novel'] });
    const settings = {
      ...project.settings,
      streaksEnabled: true,
      // 9 November 2026 to 18 November 2026: 10 writing days.
      deadline: { date: '2026-11-18', words: 9_000, from: 10_000, since: '2026-11-02' },
      wordsByDay: { '2026-11-09': -30 },
    };
    expect(todayGoal(settings, 9_970, '2026-11-09')).toEqual({ goal: 100, done: 30, cut: true });
    // After its date, a day counts the words it adds again.
    expect(todayGoal(settings, 9_970, '2026-11-20')).toEqual({ goal: 500, done: 0, cut: false });
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
