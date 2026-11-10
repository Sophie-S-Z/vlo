import JSZip from 'jszip';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { exportRecord, flushEntry, noteChange } from '@/features/authorship/record';
import { verifyRecord } from '@/features/authorship/verify';
import { backUpProject, collectBackup, importBackup, readBackup } from '@/features/backup/backup';
import { BACKUP_VERSION, BackupError, backupFileName, writeBackup } from '@/features/backup/file';
import { backupDue, backupLabel, daysBetween } from '@/features/backup/reminder';
import { safariDevice } from '@/features/backup/safari';
import { DEFAULT_BOOK } from '@/features/book/book';
import { DOC_SCHEMA } from '@/features/editor/docSchema';
import { updateToJson } from '@/features/export/read';
import { createProject } from '@/features/library/projects';
import { clock } from '@/lib/clock';
import { db, type Item } from '@/lib/db';
import { readItemUpdate, writeItemUpdate } from '@/lib/ydocs';
import { POEM_TEXT, poemUpdate, proseUpdate } from './export-fixtures';

/* Full-project backup and import (spec section 9 and the backup round-trip test of section 15, plan Task B8). */

const NBSP = ' ';

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
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
});

/** A novel with text in each scene, a snapshot, a writing session and plain-text copies. */
async function novelWithText() {
  const { project } = await createProject({
    title: 'Salt Year',
    templates: ['novel'],
    authorName: 'Ada Marlow',
  });
  const items = await db.items.where('projectId').equals(project.id).toArray();
  const scenes = items.filter((i) => i.kind === 'scene');
  const texts = ['The harbour  lights came on one by one.', 'The gulls slept.'];
  for (const [index, scene] of scenes.entries()) {
    await writeItemUpdate(scene.id, proseUpdate([texts[index % texts.length] ?? '']), 1);
    await db.itemTexts.put({
      itemId: scene.id,
      projectId: project.id,
      text: texts[index % 2] ?? '',
      updatedAt: 5,
    });
  }
  const first = scenes[0];
  if (!first) throw new Error('The novel has no scene.');
  await db.snapshots.add({
    id: `snap-${project.id}`,
    projectId: project.id,
    itemId: first.id,
    label: 'Before the storm',
    createdAt: 10,
    state: proseUpdate(['An older line.']),
    text: 'An older line.',
  });
  await db.itemVersions.add({
    id: `version-${project.id}`,
    projectId: project.id,
    itemId: first.id,
    name: 'Darker ending',
    createdAt: 11,
    updatedAt: 12,
    state: proseUpdate(['The storm wins.']),
    text: 'The storm wins.',
  });
  noteChange(project.id, 'typed', 40, 2);
  await flushEntry(project.id);
  await db.sessions.add({
    id: `session-${project.id}`,
    projectId: project.id,
    startedAt: 1,
    endedAt: 2,
    wordsAdded: 8,
    poemsAdded: 0,
    target: 500,
  });
  await db.projects.update(project.id, { 'settings.challenge': { month: '2026-11', words: 50_000 } });
  return { project: (await db.projects.get(project.id)) ?? project, scenes };
}

async function rowsOf(projectId: string) {
  const sortById = <T extends { id: string }>(rows: T[]) => rows.sort((a, b) => a.id.localeCompare(b.id));
  return {
    project: await db.projects.get(projectId),
    items: sortById(await db.items.where('projectId').equals(projectId).toArray()),
    snapshots: sortById(await db.snapshots.where('projectId').equals(projectId).toArray()),
    versions: sortById(await db.itemVersions.where('projectId').equals(projectId).toArray()),
    sessions: sortById(await db.sessions.where('projectId').equals(projectId).toArray()),
    authorship: sortById(await db.authorship.where('projectId').equals(projectId).toArray()),
    itemTexts: (await db.itemTexts.where('projectId').equals(projectId).toArray()).sort((a, b) =>
      a.itemId.localeCompare(b.itemId),
    ),
  };
}

async function textOf(itemId: string): Promise<string> {
  return JSON.stringify(updateToJson(await readItemUpdate(itemId)));
}

describe('Backup file', () => {
  test('holds project.json, the Yjs text and a readable copy of each item, and each snapshot', async () => {
    const { project, scenes } = await novelWithText();
    const { name, bytes } = await backUpProject(project.id, { music: false });
    expect(name).toMatch(/^Salt Year backup \d{4}-\d{2}-\d{2}\.vlo\.zip$/);
    const zip = await JSZip.loadAsync(bytes);
    const manifest = JSON.parse((await zip.file('project.json')?.async('string')) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(manifest.format).toBe('vlo-backup');
    expect(manifest.version).toBe(BACKUP_VERSION);
    expect(manifest.docSchema).toBe(DOC_SCHEMA);
    for (const scene of scenes) {
      expect(zip.file(`items/${scene.id}.yjs`)).not.toBeNull();
      expect(zip.file(`items/${scene.id}.md`)).not.toBeNull();
    }
    expect(await zip.file(`items/${scenes[0]?.id ?? ''}.md`)?.async('string')).toContain(
      'The harbour  lights came on one by one.',
    );
    // Chapters hold only their scenes, so they have no text file.
    const chapter = (await db.items.where('projectId').equals(project.id).toArray()).find(
      (i) => i.kind === 'chapter',
    );
    expect(zip.file(`items/${chapter?.id ?? ''}.yjs`)).toBeNull();
    expect(zip.file(`snapshots/snap-${project.id}.yjs`)).not.toBeNull();
    // The snapshot bytes live in their own file, not in the JSON.
    expect((manifest.snapshots as Record<string, unknown>[])[0]).not.toHaveProperty('state');
    expect(Object.keys(zip.files).some((f) => f.startsWith('music/'))).toBe(false);
  });

  test('records the backup date and keeps the project in its place in the Library', async () => {
    const { project } = await novelWithText();
    vi.spyOn(clock, 'now').mockReturnValue(project.updatedAt + 5000);
    await backUpProject(project.id, { music: false });
    const after = await db.projects.get(project.id);
    expect(after?.lastBackupAt).toBe(project.updatedAt + 5000);
    expect(after?.updatedAt).toBe(project.updatedAt);
  });

  test('the readable copy of a poem keeps every leading space as a no-break space', async () => {
    const { project } = await createProject({ title: 'Tide', templates: ['poetry'] });
    const poem = (await db.items.where('projectId').equals(project.id).toArray()).find(
      (i) => i.kind === 'poem',
    );
    if (!poem) throw new Error('No poem.');
    await writeItemUpdate(poem.id, poemUpdate(), 1);
    const zip = await JSZip.loadAsync((await backUpProject(project.id, { music: false })).bytes);
    const markdown = (await zip.file(`items/${poem.id}.md`)?.async('string')) ?? '';
    const indented = POEM_TEXT.split('\n').find((line) => line.startsWith('    '));
    expect(indented).toBeDefined();
    expect(markdown).toContain(`${NBSP.repeat(4)}${(indented ?? '').trimStart()}`);
  });

  test('names the file after the project title and the local date', () => {
    expect(backupFileName('Salt: Year?', new Date(2026, 10, 4, 23, 59))).toBe(
      'Salt Year backup 2026-11-04.vlo.zip',
    );
    expect(backupFileName('   ', new Date(2026, 0, 2))).toBe('Vlo export backup 2026-01-02.vlo.zip');
  });
});

describe('Backup round trip', () => {
  test('a backup imported after a delete gives identical text and identical rows', async () => {
    const { project, scenes } = await novelWithText();
    // The packet's letter and bio (F53) and the book settings (F51) go with the project.
    await db.projects.update(project.id, {
      settings: {
        ...project.settings,
        packet: { letter: 'Dear editors,', bio: 'I write by the sea.' },
        book: { ...DEFAULT_BOOK, trim: '6x9', chapter: 'modern', dedication: 'For Ada.' },
      },
    });
    // A poem form (F56) is an item field, so it goes with the item.
    await db.items.update(scenes[0]?.id ?? '', { form: 'sonnet' });
    const before = await rowsOf(project.id);
    const texts = await Promise.all(scenes.map((s) => textOf(s.id)));
    const { bytes } = await backUpProject(project.id, { music: false });
    const backedUp = (await db.projects.get(project.id))?.lastBackupAt;

    const { deleteProject } = await import('@/features/library/projects');
    await deleteProject(project.id);
    expect(await db.projects.get(project.id)).toBeUndefined();

    const backup = await readBackup(bytes);
    expect(await importBackup(backup, 'same')).toBe(project.id);
    const after = await rowsOf(project.id);
    expect(after.items).toEqual(before.items);
    expect(after.snapshots).toEqual(before.snapshots);
    expect(after.versions).toEqual(before.versions);
    expect(after.sessions).toEqual(before.sessions);
    expect(after.authorship).toEqual(before.authorship);
    expect(after.authorship).toHaveLength(1);
    expect(after.itemTexts).toEqual(before.itemTexts);
    // The imported project counts as backed up when the file was made.
    expect(after.project).toEqual({ ...before.project, lastBackupAt: backedUp });
    for (const [index, scene] of scenes.entries()) {
      expect(await textOf(scene.id)).toBe(texts[index]);
      // The stored update is the same text, character by character.
      const doc = new Y.Doc();
      Y.applyUpdate(doc, await readItemUpdate(scene.id));
      expect(doc.getXmlFragment('default').toJSON()).toContain(
        index % 2 === 0 ? 'The harbour  lights' : 'The gulls slept.',
      );
      doc.destroy();
    }
  });

  // Plan Task H9 (roadmap F38): a backup from before the change holds word counts.
  test('a Japanese backup counts characters when it goes in', async () => {
    const { project, scenes } = await novelWithText();
    const scene = scenes[0];
    if (!scene) throw new Error('The novel has no scene.');
    await db.projects.update(project.id, { settings: { ...project.settings, language: 'ja' } });
    await db.itemTexts.update(scene.id, { text: '東京へ行く。' });
    await db.items.update(scene.id, { wordCount: 2 });
    const backup = await readBackup((await backUpProject(project.id, { music: false })).bytes);

    const copyId = await importBackup(backup, 'copy');
    const copied = await db.items.where('projectId').equals(copyId).toArray();
    expect(copied.find((i) => i.title === scene.title && i.wordCount === 5)).toBeDefined();
  });

  test('replace puts the backup in place of the project, and drops what came after it', async () => {
    const { project, scenes } = await novelWithText();
    const { bytes } = await backUpProject(project.id, { music: false });
    const first = scenes[0];
    if (!first) throw new Error('No scene.');
    await writeItemUpdate(first.id, proseUpdate(['A line written after the backup.']), 2);
    const extra: Item = { ...first, id: 'item-after', title: 'After', order: 'a9' };
    await db.items.add(extra);

    // A share link of the project: its key and owner token live only on this device.
    await db.shares.add({
      id: 'link-1',
      projectId: project.id,
      itemIds: [first.id],
      title: 'Scene 1',
      createdAt: 1,
      expiresAt: Date.now() + 86_400_000,
      ownerToken: 'owner-token',
      key: 'share-key',
      revoked: false,
      comments: [],
      commentsReadAt: 0,
    });

    await importBackup(await readBackup(bytes), 'replace');
    expect(await db.shares.get('link-1')).toMatchObject({ ownerToken: 'owner-token', key: 'share-key' });
    expect(await db.items.get('item-after')).toBeUndefined();
    expect(await textOf(first.id)).toContain('The harbour  lights');
    expect(await textOf(first.id)).not.toContain('after the backup');
    expect(await db.projects.count()).toBe(1);
  });

  test('a replace that fails puts the device copy back (architecture review finding 4)', async () => {
    const { project, scenes } = await novelWithText();
    const { bytes } = await backUpProject(project.id, { music: false });
    const first = scenes[0];
    if (!first) throw new Error('No scene.');
    await writeItemUpdate(first.id, proseUpdate(['A line written after the backup.']), 2);
    await db.items.add({ ...first, id: 'item-after', title: 'After', order: 'a9' });
    const items = await db.items.where('projectId').equals(project.id).count();

    // The first write of the rows fails, as on a full disk. The write that puts the device copy back works.
    vi.spyOn(db.snapshots, 'bulkAdd').mockRejectedValueOnce(new Error('QuotaExceededError'));
    await expect(importBackup(await readBackup(bytes), 'replace')).rejects.toThrow('QuotaExceededError');

    expect(await db.projects.get(project.id)).toMatchObject({ title: 'Salt Year' });
    expect(await db.items.where('projectId').equals(project.id).count()).toBe(items);
    expect(await db.items.get('item-after')).toBeDefined();
    expect(await textOf(first.id)).toContain('after the backup');
    expect(await db.snapshots.where('projectId').equals(project.id).count()).toBe(1);
  });

  test('a copy gets new ids, keeps the tree and the text, and sits next to the original', async () => {
    const { project, scenes } = await novelWithText();
    const { bytes } = await backUpProject(project.id, { music: false });
    const copyId = await importBackup(await readBackup(bytes), 'copy');
    expect(copyId).not.toBe(project.id);
    expect(await db.projects.count()).toBe(2);
    const copy = await rowsOf(copyId);
    const original = await rowsOf(project.id);
    expect(copy.project?.title).toBe('Salt Year (copy)');
    expect(copy.items).toHaveLength(original.items.length);
    expect(copy.items.some((i) => original.items.some((o) => o.id === i.id))).toBe(false);
    // Each parent is an item of the copy, in the same shape as the original tree.
    const shape = (rows: Item[]) => {
      const byId = new Map(rows.map((r) => [r.id, r]));
      return rows
        .map((r) => `${r.title}<${r.parentId === null ? '' : (byId.get(r.parentId)?.title ?? 'missing')}`)
        .sort();
    };
    expect(shape(copy.items)).toEqual(shape(original.items));
    const copyScenes = copy.items
      .filter((i) => i.kind === 'scene')
      .sort((a, b) => a.order.localeCompare(b.order));
    const scenesInOrder = [...scenes].sort((a, b) => a.order.localeCompare(b.order));
    for (const [index, scene] of copyScenes.entries())
      expect(await textOf(scene.id)).toBe(await textOf(scenesInOrder[index]?.id ?? ''));
    expect(copy.snapshots[0]?.itemId).toBe(copyScenes.find((s) => s.title === scenes[0]?.title)?.id);
    expect(copy.versions[0]?.itemId).toBe(copy.snapshots[0]?.itemId);
    expect(copy.versions[0]?.id).not.toBe(original.versions[0]?.id);
    // The copy's authorship record still checks: no hash covers the project.
    expect(copy.authorship[0]?.hash).toBe(original.authorship[0]?.hash);
    expect(await verifyRecord((await exportRecord(copyId)) ?? '')).toMatchObject({ ok: true });
    expect(copy.itemTexts.every((t) => copy.items.some((i) => i.id === t.itemId))).toBe(true);
  });

  test('music goes in only when the writer asks, and an import adds only the files that are not here', async () => {
    const { project } = await novelWithText();
    const data = new Uint8Array([1, 2, 3, 4]).buffer;
    await db.audioFiles.add({
      id: 'song-1',
      name: 'Rain',
      type: 'audio/mpeg',
      size: 4,
      duration: 3,
      addedAt: 1,
      data,
    });
    const without = await JSZip.loadAsync((await backUpProject(project.id, { music: false })).bytes);
    expect(without.file('music/song-1')).toBeNull();
    const { bytes } = await backUpProject(project.id, { music: true });
    const zip = await JSZip.loadAsync(bytes);
    expect([...((await zip.file('music/song-1')?.async('uint8array')) ?? [])]).toEqual([1, 2, 3, 4]);

    await db.audioFiles.clear();
    const backup = await readBackup(bytes);
    await importBackup(backup, 'copy');
    const song = await db.audioFiles.get('song-1');
    expect(song?.name).toBe('Rain');
    expect([...new Uint8Array(song?.data as ArrayBuffer)]).toEqual([1, 2, 3, 4]);
    // A second import keeps the file that is already here.
    await importBackup(backup, 'copy');
    expect(await db.audioFiles.count()).toBe(1);
  });

  test('a failed import leaves no project and no stored text behind', async () => {
    const { project, scenes } = await novelWithText();
    const backup = await collectBackup(project.id, { music: false });
    const copy = await readBackup(await writeBackup(backup));
    // Two items with one id make the row write fail after the text is stored.
    const broken = { ...copy, items: [...copy.items, { ...copy.items[0] } as Item] };
    await expect(importBackup(broken, 'copy')).rejects.toThrow();
    expect(await db.projects.count()).toBe(1);
    const names = (await indexedDB.databases()).map((d) => d.name).filter((n) => n?.startsWith('vlo-item-'));
    expect(names.sort()).toEqual(scenes.map((s) => `vlo-item-${s.id}`).sort());
  });
});

describe('Reading a backup', () => {
  async function backupZip(): Promise<JSZip> {
    const { project } = await novelWithText();
    return JSZip.loadAsync((await backUpProject(project.id, { music: false })).bytes);
  }

  async function manifestOf(zip: JSZip): Promise<Record<string, unknown>> {
    return JSON.parse((await zip.file('project.json')?.async('string')) ?? '{}') as Record<string, unknown>;
  }

  async function withManifest(zip: JSZip, change: (m: Record<string, unknown>) => void): Promise<Uint8Array> {
    const manifest = await manifestOf(zip);
    change(manifest);
    zip.file('project.json', JSON.stringify(manifest));
    return zip.generateAsync({ type: 'uint8array' });
  }

  const reads = (bytes: Uint8Array) => readBackup(bytes);

  /** The first row of a list in the manifest. */
  function row(manifest: Record<string, unknown>, key: string): Record<string, unknown> {
    const first = (manifest[key] as Record<string, unknown>[] | undefined)?.[0];
    if (!first) throw new Error(`The manifest has no ${key}.`);
    return first;
  }

  test('refuses a file that is not a Vlo backup', async () => {
    await expect(reads(new TextEncoder().encode('just text'))).rejects.toThrow(
      'This file is not a Vlo backup. A backup is a .vlo.zip file that Vlo made.',
    );
    const other = new JSZip();
    other.file('word/document.xml', '<w:document/>');
    await expect(reads(await other.generateAsync({ type: 'uint8array' }))).rejects.toBeInstanceOf(
      BackupError,
    );
  });

  test('refuses a backup from a newer Vlo, by its format or by the schema of its text', async () => {
    const zip = await backupZip();
    await expect(reads(await withManifest(zip, (m) => (m.version = BACKUP_VERSION + 1)))).rejects.toThrow(
      /A newer version of Vlo/,
    );

    const fresh = await backupZip();
    const manifest = await manifestOf(fresh);
    const scene = (manifest.items as Item[]).find((i) => i.kind === 'scene');
    const doc = new Y.Doc();
    doc.getMap('vlo').set('schema', DOC_SCHEMA + 1);
    fresh.file(`items/${scene?.id ?? ''}.yjs`, Y.encodeStateAsUpdate(doc));
    await expect(reads(await fresh.generateAsync({ type: 'uint8array' }))).rejects.toThrow(
      /A newer version of Vlo/,
    );
  });

  test('names a missing or damaged item text', async () => {
    const zip = await backupZip();
    const scene = ((await manifestOf(zip)).items as Item[]).find((i) => i.kind === 'scene');
    zip.remove(`items/${scene?.id ?? ''}.yjs`);
    await expect(reads(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(
      `This backup file is damaged. The text of “${scene?.title ?? ''}” is missing.`,
    );
    zip.file(`items/${scene?.id ?? ''}.yjs`, new Uint8Array([255, 1, 2, 3, 4, 5]));
    await expect(reads(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(
      /Vlo cannot read the text of/,
    );
  });

  test('reads a version 2 backup with one template as a list of one', async () => {
    const zip = await backupZip();
    const bytes = await withManifest(zip, (m) => {
      m.version = 2;
      const project = m.project as Record<string, unknown>;
      delete project.templates;
      project.template = 'novel';
    });
    const backup = await reads(bytes);
    expect(backup.project.templates).toEqual(['novel']);
    expect(backup.project).not.toHaveProperty('template');
  });

  test('keeps a mix of templates in template order, and refuses an empty or unknown one', async () => {
    const zip = await backupZip();
    const mixed = await reads(
      await withManifest(zip, (m) => ((m.project as Record<string, unknown>).templates = ['open', 'novel'])),
    );
    expect(mixed.project.templates).toEqual(['novel', 'open']);
    for (const templates of [[], ['story'], ['novel', 'novel'], 'novel']) {
      const fresh = await backupZip();
      await expect(
        reads(
          await withManifest(fresh, (m) => ((m.project as Record<string, unknown>).templates = templates)),
        ),
      ).rejects.toThrow(/has a wrong template/);
    }
  });

  test('refuses rows that do not fit together', async () => {
    const cases: [string, (m: Record<string, unknown>) => void, RegExp][] = [
      [
        'a missing parent',
        (m) => ((m.items as Item[])[1] = { ...(m.items as Item[])[1], parentId: 'nowhere' } as Item),
        /parent that is not in it/,
      ],
      [
        'a loop',
        (m) => {
          const items = m.items as Item[];
          const [a, b] = items;
          if (a && b) {
            a.parentId = b.id;
            b.parentId = a.id;
          }
        },
        /form a loop/,
      ],
      ['another project', (m) => (row(m, 'sessions').projectId = 'other'), /belongs to another project/],
      ['an unsafe id', (m) => (row(m, 'items').id = '../../etc'), /has a wrong id/],
      ['a wrong order', (m) => (row(m, 'items').order = ''), /has a wrong order/],
      ['a wrong kind', (m) => (row(m, 'items').kind = 'script'), /has a wrong kind/],
      ['a wrong Craft switch', (m) => (row(m, 'items').craft = 'yes'), /has a wrong Craft switch/],
      ['a wrong poem form', (m) => (row(m, 'items').form = 'limerick'), /has a wrong poem form/],
      ['a version name of no text', (m) => (row(m, 'items').versionName = 42), /has no versionName/],
      ['an empty version name', (m) => (row(m, 'items').versionName = ' '), /has a wrong version name/],
      [
        'a wrong day of words',
        (m) => {
          const project = m.project as { settings: Record<string, unknown> };
          project.settings.wordsByDay = { '5 November': 300 };
        },
        /The project settings are wrong/,
      ],
      [
        'a packet letter that is not text',
        (m) => {
          const project = m.project as { settings: Record<string, unknown> };
          project.settings.packet = { letter: 42, bio: '' };
        },
        /The project settings are wrong/,
      ],
      [
        'a book with a trim that Vlo does not know',
        (m) => {
          const project = m.project as { settings: Record<string, unknown> };
          project.settings.book = { ...DEFAULT_BOOK, trim: '4x6' };
        },
        /The project settings are wrong/,
      ],
      ['a missing project', (m) => (m.project = null), /It has no project/],
      ['a snapshot of no item', (m) => (row(m, 'snapshots').itemId = 'gone'), /A snapshot has no item/],
      ['a version of no item', (m) => (row(m, 'versions').itemId = 'gone'), /A version has no item/],
      ['a version with no name', (m) => (row(m, 'versions').name = ' '), /A version has a wrong name/],
      [
        'an authorship entry with no hash',
        (m) => delete row(m, 'authorship').hash,
        /An authorship entry has no hash/,
      ],
    ];
    for (const [, change, message] of cases) {
      const zip = await backupZip();
      await expect(reads(await withManifest(zip, change))).rejects.toThrow(message);
    }
  });
});

describe('Backup reminder', () => {
  const DAY = 86_400_000;
  const now = new Date(2026, 10, 20, 12).getTime();

  test('counts calendar days in the device time zone', () => {
    expect(
      daysBetween(new Date(2026, 10, 19, 23, 59).getTime(), new Date(2026, 10, 20, 0, 1).getTime()),
    ).toBe(1);
    expect(daysBetween(now, now)).toBe(0);
  });

  test('labels the last backup on the card', () => {
    expect(backupLabel({}, now)).toBe('No backup yet');
    expect(backupLabel({ lastBackupAt: now - 1000 }, now)).toBe('Backed up today');
    expect(backupLabel({ lastBackupAt: now - DAY }, now)).toBe('Backed up yesterday');
    expect(backupLabel({ lastBackupAt: now - 9 * DAY }, now)).toBe('Backed up 9 days ago');
  });

  test('reminds after 7 days without a backup, only when the writing changed', () => {
    expect(backupDue({ createdAt: now - 6 * DAY, updatedAt: now }, now)).toBe(false);
    expect(backupDue({ createdAt: now - 7 * DAY, updatedAt: now }, now)).toBe(true);
    expect(backupDue({ createdAt: 0, updatedAt: now - DAY, lastBackupAt: now - 8 * DAY }, now)).toBe(true);
    expect(backupDue({ createdAt: 0, updatedAt: now - 9 * DAY, lastBackupAt: now - 8 * DAY }, now)).toBe(
      false,
    );
    expect(backupDue({ createdAt: 0, updatedAt: now, lastBackupAt: now - 2 * DAY }, now)).toBe(false);
  });
});

describe('Safari install steps', () => {
  const mac =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const chromeMac =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const chromeIos =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';
  const firefoxIos =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15';

  test('shows the Mac steps in Safari on a Mac, and the Home Screen steps on an iPhone or iPad', () => {
    expect(safariDevice({ userAgent: mac, maxTouchPoints: 0, installed: false })).toBe('mac');
    expect(safariDevice({ userAgent: iphone, maxTouchPoints: 5, installed: false })).toBe('ios');
    // An iPad asks for the desktop site, so only its touch screen tells it apart from a Mac.
    expect(safariDevice({ userAgent: mac, maxTouchPoints: 5, installed: false })).toBe('ios');
  });

  test('shows no steps in other browsers or in the installed app', () => {
    expect(safariDevice({ userAgent: chromeMac, maxTouchPoints: 0, installed: false })).toBeNull();
    expect(safariDevice({ userAgent: chromeIos, maxTouchPoints: 5, installed: false })).toBeNull();
    expect(safariDevice({ userAgent: firefoxIos, maxTouchPoints: 5, installed: false })).toBeNull();
    expect(safariDevice({ userAgent: mac, maxTouchPoints: 0, installed: true })).toBeNull();
  });
});

describe('share links and backups (plan Task E1, Review Focus 5)', () => {
  test('a backup holds no share key and no owner token, and an import lists no share link', async () => {
    const { project } = await novelWithText();
    const key = 'K'.repeat(43);
    const ownerToken = 'T'.repeat(43);
    await db.shares.add({
      id: 'share-1',
      projectId: project.id,
      itemIds: [],
      title: project.title,
      createdAt: 1,
      expiresAt: 2,
      ownerToken,
      key,
      revoked: false,
      comments: [],
      commentsReadAt: 0,
    });
    const file = await backUpProject(project.id, { music: false });
    const zip = await JSZip.loadAsync(file.bytes);
    for (const name of Object.keys(zip.files)) {
      const text = await zip.file(name)?.async('string');
      expect(text ?? '').not.toContain(key);
      expect(text ?? '').not.toContain(ownerToken);
      expect(text ?? '').not.toContain('share-1');
    }
    const copyId = await importBackup(await readBackup(file.bytes), 'copy');
    expect(await db.shares.where('projectId').equals(copyId).count()).toBe(0);
  });
});
