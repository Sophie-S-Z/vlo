import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Dexie } from 'dexie';
import { db, VloDb, type Item, type Project, type Snapshot } from '@/lib/db';

function project(id: string): Project {
  return {
    id,
    title: 'Salt',
    template: 'poetry',
    aiMode: 'pen',
    createdAt: 1,
    updatedAt: 1,
    settings: { snapshotEveryMinutes: 10, aliasAiRequests: false, streaksEnabled: false, restDays: [] },
  };
}

function item(id: string, projectId: string, parentId: string | null, order: string): Item {
  return {
    id,
    projectId,
    parentId,
    kind: 'poem',
    title: id,
    status: 'draft',
    order,
    wordCount: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe('Vlo database', () => {
  test('version 2 has the six Phase 1 tables and the music files table', () => {
    expect(db.name).toBe('vlo');
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'appMeta',
      'audioFiles',
      'itemTexts',
      'items',
      'projects',
      'sessions',
      'snapshots',
    ]);
  });

  test('opening a version 1 database keeps its rows and adds the music files table', async () => {
    const name = 'vlo-upgrade-test';
    const old = new Dexie(name);
    old.version(1).stores({
      projects: 'id, updatedAt',
      items: 'id, projectId, [projectId+parentId]',
      snapshots: 'id, itemId, [itemId+createdAt], projectId',
      sessions: 'id, projectId',
      itemTexts: 'itemId, projectId',
      appMeta: 'key',
    });
    await old.open();
    await old.table('projects').add(project('kept'));
    await old.table('items').add(item('a', 'kept', null, 'a0'));
    old.close();

    const upgraded = new VloDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(2);
    expect((await upgraded.projects.get('kept'))?.title).toBe('Salt');
    expect(await upgraded.items.count()).toBe(1);
    await upgraded.audioFiles.add({
      id: 'f1',
      name: 'Rain tape',
      type: 'audio/wav',
      size: 4,
      duration: 1,
      addedAt: 2,
      data: new Blob(['RIFF'], { type: 'audio/wav' }),
    });
    expect((await upgraded.audioFiles.orderBy('addedAt').first())?.name).toBe('Rain tape');
    await upgraded.delete();
  });

  test('children of a parent come back by project and parent', async () => {
    await db.projects.add(project('p1'));
    await db.items.bulkAdd([
      item('a', 'p1', null, 'a0'),
      item('b', 'p1', 'a', 'a0'),
      item('c', 'p1', 'a', 'a1'),
      item('d', 'p2', 'a', 'a0'),
    ]);
    const children = await db.items.where({ projectId: 'p1', parentId: 'a' }).toArray();
    expect(children.map((i) => i.id).sort()).toEqual(['b', 'c']);
  });

  test('top-level items (parentId null) come back by project', async () => {
    await db.items.bulkAdd([item('a', 'p1', null, 'a0'), item('b', 'p1', 'a', 'a0')]);
    const roots = (await db.items.where('projectId').equals('p1').toArray()).filter(
      (i) => i.parentId === null,
    );
    expect(roots.map((i) => i.id)).toEqual(['a']);
  });

  test('a snapshot state round-trips byte for byte', async () => {
    const state = new Uint8Array([0, 1, 2, 250, 255, 7]);
    const snap: Snapshot = {
      id: 's1',
      projectId: 'p1',
      itemId: 'a',
      createdAt: 5,
      state,
      text: 'Salt on the sill.',
    };
    await db.snapshots.add(snap);
    const back = await db.snapshots.get('s1');
    // jsdom and Node have separate Uint8Array classes, so check the tag, not instanceof.
    expect(Object.prototype.toString.call(back?.state)).toBe('[object Uint8Array]');
    expect([...(back?.state ?? [])]).toEqual([...state]);
  });
});
