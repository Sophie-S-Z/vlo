import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { changeTemplates, createProject } from '@/features/library/projects';
import { misfits } from '@/features/library/templates';
import { db } from '@/lib/db';
import { item } from './export-fixtures';

/* Change templates later (roadmap F35, plan Task G5, decision P3). */

describe('misfits', () => {
  const novel = [
    item('c', 'chapter', 'Chapter 1'),
    item('s', 'scene', 'Scene 1', 'c'),
    item('n', 'note', 'Note'),
  ];

  test('adding a template never blocks', () => {
    expect(misfits(novel, ['novel', 'memoir', 'poetry', 'open'])).toEqual([]);
  });

  test('removing poetry blocks on each poem, and on nothing else', () => {
    const items = [item('p', 'poem', 'Salt'), item('g', 'page', 'Letter'), item('n', 'note', 'Note')];
    expect(misfits(items, ['open']).map((i) => i.title)).toEqual(['Salt']);
  });

  test('a kind that the other templates share stays: a part, a note', () => {
    const items = [item('pt', 'part', 'Part'), item('m', 'memory', 'Coast', 'pt'), item('n', 'note', 'Note')];
    expect(misfits(items, ['memoir', 'poetry']).map((i) => i.title)).toEqual([]);
    expect(misfits(items, ['poetry']).map((i) => i.title)).toEqual(['Coast']);
  });

  test('a place that the new templates do not allow blocks too: a folder inside a folder', () => {
    const items = [item('a', 'part', 'Outer'), item('b', 'part', 'Inner', 'a')];
    expect(misfits(items, ['novel', 'open'])).toEqual([]);
    expect(misfits(items, ['novel']).map((i) => i.title)).toEqual(['Inner']);
  });
});

describe('changeTemplates', () => {
  beforeEach(async () => {
    await db.open();
  });
  afterEach(async () => {
    await db.delete();
  });

  test('saves a change that fits, in the order of the templates', async () => {
    const { project } = await createProject({ title: 'Salt', templates: ['novel'] });
    expect(await changeTemplates(project.id, ['open', 'novel'])).toEqual([]);
    expect((await db.projects.get(project.id))?.templates).toEqual(['novel', 'open']);
  });

  test('changes nothing while items do not fit, and gives those items', async () => {
    const { project } = await createProject({ title: 'Salt', templates: ['novel'] });
    const blocking = await changeTemplates(project.id, ['memoir']);
    expect(blocking.map((i) => i.title)).toEqual(['Chapter 1', 'Scene 1']);
    expect((await db.projects.get(project.id))?.templates).toEqual(['novel']);
  });
});
