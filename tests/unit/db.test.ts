import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Dexie } from 'dexie';
import { db, VloDb, type Item, type Project, type Snapshot } from '@/lib/db';

function project(id: string): Project {
  return {
    id,
    title: 'Salt',
    templates: ['poetry'],
    aiMode: 'pen',
    createdAt: 1,
    updatedAt: 1,
    settings: { snapshotEveryMinutes: 10, aliasAiRequests: false, streaksEnabled: false, restDays: [] },
  };
}

/** A project as Vlo stored it before version 6, with one template. */
function legacyProject(id: string): Omit<Project, 'templates'> & { template: 'poetry' } {
  const row: Partial<Project> = project(id);
  delete row.templates;
  return { ...(row as Omit<Project, 'templates'>), template: 'poetry' };
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
  test('version 11 has the Phase 1 tables, the music, the template views, the network log, the shares, the Codex, research, the sync clock, the item versions and the authorship record', () => {
    expect(db.name).toBe('vlo');
    expect(db.verno).toBe(11);
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'appMeta',
      'audioFiles',
      'authorship',
      'cardLinks',
      'cards',
      'codex',
      'itemTexts',
      'itemVersions',
      'items',
      'lifeStages',
      'networkLog',
      'people',
      'projects',
      'research',
      'sequences',
      'sessions',
      'shares',
      'snapshots',
      'submissions',
      'syncClock',
      'threads',
    ]);
  });

  test('opening a version 4 database keeps its network log, and adds the shares table', async () => {
    const name = 'vlo-upgrade-test-4';
    const old = new Dexie(name);
    old.version(4).stores({
      projects: 'id, updatedAt',
      items: 'id, projectId, [projectId+parentId]',
      snapshots: 'id, itemId, [itemId+createdAt], projectId',
      sessions: 'id, projectId',
      itemTexts: 'itemId, projectId',
      appMeta: 'key',
      audioFiles: 'id, addedAt',
      cards: 'id, projectId, itemId',
      threads: 'id, projectId',
      cardLinks: 'id, projectId, fromCardId, toCardId',
      lifeStages: 'id, projectId',
      sequences: 'id, projectId',
      people: 'id, projectId',
      submissions: 'id, projectId',
      networkLog: 'id, at',
    });
    await old.open();
    await old.table('projects').add(legacyProject('kept'));
    await old
      .table('networkLog')
      .add({ id: 'n1', at: 5, host: 'api.groq.com', path: '/x', purpose: 'ai', bytesSent: 3, status: 200 });
    old.close();

    const upgraded = new VloDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(11);
    expect((await upgraded.networkLog.get('n1'))?.host).toBe('api.groq.com');
    await upgraded.shares.add({
      id: 'sh1',
      projectId: 'kept',
      itemIds: ['a'],
      title: 'Salt',
      createdAt: 6,
      expiresAt: 7,
      ownerToken: 'token',
      key: 'key',
      revoked: false,
      comments: [],
      commentsReadAt: 0,
    });
    expect((await upgraded.shares.where('projectId').equals('kept').first())?.title).toBe('Salt');
    await upgraded.delete();
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
    await old.table('projects').add(legacyProject('kept'));
    await old.table('items').add(item('a', 'kept', null, 'a0'));
    old.close();

    const upgraded = new VloDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(11);
    expect((await upgraded.projects.get('kept'))?.title).toBe('Salt');
    expect((await upgraded.projects.get('kept'))?.templates).toEqual(['poetry']);
    expect(await upgraded.items.count()).toBe(1);
    await upgraded.audioFiles.add({
      id: 'f1',
      name: 'Rain tape',
      type: 'audio/wav',
      size: 4,
      duration: 1,
      addedAt: 2,
      data: new TextEncoder().encode('RIFF').buffer,
    });
    expect((await upgraded.audioFiles.orderBy('addedAt').first())?.name).toBe('Rain tape');
    await upgraded.delete();
  });

  test('opening a version 2 database keeps its rows and music, and adds the template view tables', async () => {
    const name = 'vlo-upgrade-test-2';
    const old = new Dexie(name);
    old.version(2).stores({
      projects: 'id, updatedAt',
      items: 'id, projectId, [projectId+parentId]',
      snapshots: 'id, itemId, [itemId+createdAt], projectId',
      sessions: 'id, projectId',
      itemTexts: 'itemId, projectId',
      appMeta: 'key',
      audioFiles: 'id, addedAt',
    });
    await old.open();
    await old.table('projects').add(legacyProject('kept'));
    await old.table('items').add(item('a', 'kept', null, 'a0'));
    await old.table('audioFiles').add({
      id: 'f1',
      name: 'Rain tape',
      type: 'audio/wav',
      size: 4,
      duration: 1,
      addedAt: 2,
      data: new ArrayBuffer(4),
    });
    old.close();

    const upgraded = new VloDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(11);
    expect((await upgraded.projects.get('kept'))?.title).toBe('Salt');
    expect(await upgraded.items.count()).toBe(1);
    expect(await upgraded.audioFiles.count()).toBe(1);
    await upgraded.cards.add({
      id: 'c1',
      projectId: 'kept',
      itemId: 'a',
      title: 'Storm',
      x: -40,
      y: 16,
      color: 'amber',
    });
    await upgraded.sequences.add({
      id: 's1',
      projectId: 'kept',
      name: 'Chapbook',
      itemIds: ['a'],
      createdAt: 3,
    });
    expect((await upgraded.cards.where('itemId').equals('a').first())?.title).toBe('Storm');
    expect((await upgraded.sequences.where('projectId').equals('kept').first())?.name).toBe('Chapbook');
    await upgraded.delete();
  });

  test('opening a version 5 database puts each project template in a list', async () => {
    const name = 'vlo-upgrade-test-5';
    const old = new Dexie(name);
    old.version(5).stores({
      projects: 'id, updatedAt',
      items: 'id, projectId, [projectId+parentId]',
      snapshots: 'id, itemId, [itemId+createdAt], projectId',
      sessions: 'id, projectId',
      itemTexts: 'itemId, projectId',
      appMeta: 'key',
      audioFiles: 'id, addedAt',
      cards: 'id, projectId, itemId',
      threads: 'id, projectId',
      cardLinks: 'id, projectId, fromCardId, toCardId',
      lifeStages: 'id, projectId',
      sequences: 'id, projectId',
      people: 'id, projectId',
      submissions: 'id, projectId',
      networkLog: 'id, at',
      shares: 'id, projectId, createdAt',
    });
    await old.open();
    await old
      .table('projects')
      .bulkAdd([
        legacyProject('poems'),
        { ...legacyProject('memoir'), template: 'memoir' },
        { ...legacyProject('odd') },
      ]);
    // A row with no template at all becomes a novel.
    await old.table('projects').update('odd', { template: undefined });
    await old.table('items').add(item('a', 'poems', null, 'a0'));
    old.close();

    const upgraded = new VloDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(11);
    const rows = await upgraded.projects.toArray();
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('poems')?.templates).toEqual(['poetry']);
    expect(byId.get('memoir')?.templates).toEqual(['memoir']);
    expect(byId.get('odd')?.templates).toEqual(['novel']);
    for (const row of rows) expect(row).not.toHaveProperty('template');
    expect(await upgraded.items.count()).toBe(1);
    await upgraded.delete();
  });

  test('opening a version 7 database counts the characters of Chinese and Japanese projects', async () => {
    const name = 'vlo-upgrade-test-7';
    const old = new Dexie(name);
    old.version(7).stores({
      projects: 'id, updatedAt',
      items: 'id, projectId, [projectId+parentId]',
      snapshots: 'id, itemId, [itemId+createdAt], projectId',
      sessions: 'id, projectId',
      itemTexts: 'itemId, projectId',
      appMeta: 'key',
      audioFiles: 'id, addedAt',
      cards: 'id, projectId, itemId',
      threads: 'id, projectId',
      cardLinks: 'id, projectId, fromCardId, toCardId',
      lifeStages: 'id, projectId',
      sequences: 'id, projectId',
      people: 'id, projectId',
      submissions: 'id, projectId',
      networkLog: 'id, at',
      shares: 'id, projectId, createdAt',
      codex: 'id, projectId',
      research: 'id, projectId',
    });
    await old.open();
    const ja = project('ja');
    await old
      .table('projects')
      .bulkAdd([{ ...ja, settings: { ...ja.settings, language: 'ja' } }, project('en')]);
    // Version 7 counted words in every language: 東京へ行く。 was 2 words.
    await old.table('items').bulkAdd([
      { ...item('a', 'ja', null, 'a0'), wordCount: 2 },
      { ...item('b', 'en', null, 'a0'), wordCount: 2 },
    ]);
    await old.table('itemTexts').bulkAdd([
      { itemId: 'a', projectId: 'ja', text: '東京へ行く。\n\nNotes\n1. 注意', updatedAt: 1 },
      { itemId: 'b', projectId: 'en', text: '東京へ行く。', updatedAt: 1 },
    ]);
    old.close();

    const upgraded = new VloDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(11);
    expect((await upgraded.items.get('a'))?.wordCount).toBe(5);
    expect((await upgraded.items.get('b'))?.wordCount).toBe(2);
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
