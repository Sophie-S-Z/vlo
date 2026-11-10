import { clock } from '@/lib/clock';
import { db, readViewRows, viewTables, type Item, type Project } from '@/lib/db';
import { newId } from '@/lib/ids';
import { deleteItemDoc } from '@/lib/itemDocName';
import { countUnit, recountItems } from '@/lib/wordcount';
import { READ_AT_ONCE, readItemUpdates, writeItemUpdate } from '@/lib/ydocs';
import { deleteProject } from '@/features/library/projects';
import { remapNameMarks } from '@/features/people/markAll';
import { copyViews } from './views';
import {
  backupFileName,
  holdsText,
  readBackup,
  writeBackup,
  type Backup,
  type BackupMusic,
  type BackupResearch,
} from './file';

/*
 * Backup and import on this device (spec section 9, plan Task B8). The backup reads every row and every
 * item's stored text. The import checks the whole file first, then stores the text, then the rows in
 * one transaction, so a failed import leaves no half project in the Library.
 */

async function inBatches<T, R>(values: readonly T[], run: (value: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < values.length; i += READ_AT_ONCE)
    out.push(...(await Promise.all(values.slice(i, i + READ_AT_ONCE).map(run))));
  return out;
}

/** Reads a project, its rows, its text, its research files and, if asked, the writer's music. */
export async function collectBackup(projectId: string, options: { music: boolean }): Promise<Backup> {
  const rows = await db.transaction(
    'r',
    [
      db.projects,
      db.items,
      db.snapshots,
      db.itemVersions,
      db.sessions,
      db.itemTexts,
      db.audioFiles,
      db.research,
      ...viewTables(),
    ],
    async () => ({
      project: await db.projects.get(projectId),
      items: await db.items.where('projectId').equals(projectId).toArray(),
      snapshots: await db.snapshots.where('projectId').equals(projectId).toArray(),
      versions: await db.itemVersions.where('projectId').equals(projectId).toArray(),
      sessions: await db.sessions.where('projectId').equals(projectId).toArray(),
      itemTexts: await db.itemTexts.where('projectId').equals(projectId).toArray(),
      music: options.music ? await db.audioFiles.orderBy('addedAt').toArray() : [],
      research: await db.research.where('projectId').equals(projectId).sortBy('addedAt'),
      views: await readViewRows(projectId),
    }),
  );
  if (!rows.project) throw new Error('The project is not on this device.');
  const project = rows.project;
  const textItems = rows.items.filter((item) => holdsText(project, item.kind));
  const updates = await readItemUpdates(textItems.map((item) => item.id));
  const music = await Promise.all(
    rows.music.map(async ({ data, ...info }): Promise<BackupMusic> => ({
      info,
      data: data instanceof Blob ? await data.arrayBuffer() : data,
    })),
  );
  const research = await Promise.all(
    rows.research.map(async ({ data, ...info }): Promise<BackupResearch> =>
      data ? { info, data: await data.arrayBuffer() } : { info },
    ),
  );
  return {
    createdAt: clock.now(),
    project,
    items: rows.items,
    snapshots: rows.snapshots,
    versions: rows.versions,
    sessions: rows.sessions,
    itemTexts: rows.itemTexts,
    updates: new Map(updates),
    music,
    research,
    views: rows.views,
  };
}

export interface BackupFile {
  name: string;
  bytes: Uint8Array;
}

/** Makes the backup file of a project and records the backup date. */
export async function backUpProject(projectId: string, options: { music: boolean }): Promise<BackupFile> {
  const backup = await collectBackup(projectId, options);
  const bytes = await writeBackup(backup);
  // The backup date is not a change to the writing, so the project keeps its place in the Library.
  await db.projects.update(projectId, { lastBackupAt: backup.createdAt });
  return { name: backupFileName(backup.project.title, new Date(backup.createdAt)), bytes };
}

export { readBackup };

/** How an import stores a backup. */
export type ImportMode =
  /** No project on this device has the backup's id: store it as it is. */
  | 'same'
  /** Remove the project with the backup's id, then store the backup in its place. */
  | 'replace'
  /** Store the backup as a new project, with new ids, next to the one with the same id. */
  | 'copy';

/** The project on this device that has the backup's id, if any. */
export function projectWithId(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

/** The backup with new ids for the project and every row, and "(copy)" after the title. */
function asCopy(backup: Backup): Backup {
  const projectId = newId();
  const ids = new Map(backup.items.map((item) => [item.id, newId()]));
  const itemId = (old: string) => ids.get(old) ?? old;
  const copied = copyViews(backup.views, projectId, itemId);
  // Each private-name mark in the text names a person by id, so it moves to the new id too.
  const marks = (update: Uint8Array) =>
    backup.views.people.length === 0 ? update : remapNameMarks(update, copied.personId);
  return {
    ...backup,
    project: { ...backup.project, id: projectId, title: `${backup.project.title} (copy)` },
    items: backup.items.map((item): Item => ({
      ...item,
      id: itemId(item.id),
      projectId,
      parentId: item.parentId === null ? null : itemId(item.parentId),
      ...(item.memory?.lifeStageId === undefined
        ? {}
        : { memory: { ...item.memory, lifeStageId: copied.lifeStageId(item.memory.lifeStageId) } }),
    })),
    snapshots: backup.snapshots.map((s) => ({
      ...s,
      id: newId(),
      projectId,
      itemId: itemId(s.itemId),
      state: marks(s.state),
    })),
    versions: backup.versions.map((v) => ({
      ...v,
      id: newId(),
      projectId,
      itemId: itemId(v.itemId),
      state: marks(v.state),
    })),
    sessions: backup.sessions.map((s) => ({ ...s, id: newId(), projectId })),
    research: backup.research.map((r) => ({ ...r, info: { ...r.info, id: newId(), projectId } })),
    itemTexts: backup.itemTexts.map((t) => ({ ...t, projectId, itemId: itemId(t.itemId) })),
    updates: new Map([...backup.updates].map(([old, update]) => [itemId(old), marks(update)])),
    views: copied.views,
  };
}

/** Stores a checked backup. Returns the id of the project in the Library. */
export async function importBackup(source: Backup, mode: ImportMode): Promise<string> {
  const backup = mode === 'copy' ? asCopy(source) : source;
  if (mode === 'replace') await deleteProject(backup.project.id, { keepShares: true });
  const now = clock.now();
  const written: string[] = [];
  try {
    await inBatches([...backup.updates], async ([itemId, update]) => {
      // A database left from an earlier delete must not merge into the backup's text.
      await deleteItemDoc(itemId);
      written.push(itemId);
      await writeItemUpdate(itemId, update, now);
    });
    await db.transaction(
      'rw',
      [
        db.projects,
        db.items,
        db.snapshots,
        db.itemVersions,
        db.sessions,
        db.itemTexts,
        db.audioFiles,
        db.research,
        ...viewTables(),
      ],
      async () => {
        // The file is a backup of this state, so the project counts as backed up when the file was made.
        await db.projects.add({ ...backup.project, lastBackupAt: backup.createdAt || now });
        // A backup made before Chinese and Japanese counted characters (F38) holds word counts.
        const { language } = backup.project.settings;
        await db.items.bulkAdd(
          countUnit(language) === 'words'
            ? backup.items
            : recountItems(backup.items, backup.itemTexts, language),
        );
        await db.snapshots.bulkAdd(backup.snapshots);
        await db.itemVersions.bulkAdd(backup.versions);
        await db.sessions.bulkAdd(backup.sessions);
        await db.itemTexts.bulkPut(backup.itemTexts);
        await db.cards.bulkAdd(backup.views.cards);
        await db.threads.bulkAdd(backup.views.threads);
        await db.cardLinks.bulkAdd(backup.views.cardLinks);
        await db.lifeStages.bulkAdd(backup.views.lifeStages);
        await db.sequences.bulkAdd(backup.views.sequences);
        await db.people.bulkAdd(backup.views.people);
        await db.submissions.bulkAdd(backup.views.submissions);
        await db.codex.bulkAdd(backup.views.codex);
        await db.research.bulkAdd(
          backup.research.map(({ info, data }) =>
            data ? { ...info, data: new Blob([data], { type: info.type }) } : info,
          ),
        );
        // Music belongs to the device, not the project. A file that is already here stays as it is.
        const known = new Set(await db.audioFiles.toCollection().primaryKeys());
        await db.audioFiles.bulkAdd(
          backup.music.filter((m) => !known.has(m.info.id)).map((m) => ({ ...m.info, data: m.data })),
        );
      },
    );
  } catch (error) {
    await Promise.all(written.map((itemId) => deleteItemDoc(itemId).catch(() => undefined)));
    throw error;
  }
  return backup.project.id;
}
