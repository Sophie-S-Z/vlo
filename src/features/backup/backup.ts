import { clock } from '@/lib/clock';
import { bytesBuffer, db, readViewRows, viewTables, VloDb, type Item, type Project } from '@/lib/db';
import { newId } from '@/lib/ids';
import { deleteItemDoc } from '@/lib/itemDocName';
import { recountItems } from '@/lib/wordcount';
import { inBatches, readItemUpdates, remapNodeAttribute, writeItemUpdate } from '@/lib/ydocs';
import { ITEM_LINK } from '@/features/editor/format/itemLink';
import { deleteProject } from '@/features/library/projects';
import { holdsText } from '@/features/library/templates';
import { remapNameMarks } from '@/features/people/markAll';
import { sceneKey } from '@/features/codex/continuity';
import { remapImageIds } from '@/features/images/images';
import { unpackSnapshot } from '@/features/snapshots/packing';
import { copyViews } from './views';
import {
  backupFileName,
  readBackup,
  writeBackup,
  type Backup,
  type BackupImage,
  type BackupMusic,
  type BackupResearch,
} from './file';

/*
 * Backup and import on this device (spec section 9, plan Task B8). The backup reads every row and every
 * item's stored text. The import checks the whole file first, then stores the text, then the rows in
 * one transaction, so a failed import leaves no half project in the Library.
 */

/** Reads a project, its rows, its text, its research files and, if asked, the writer's music. */
export async function collectBackup(
  projectId: string,
  options: { music: boolean },
  database: VloDb = db,
): Promise<Backup> {
  // The time before the reads: an edit while Vlo reads counts as after the backup, so the next save has it.
  const createdAt = clock.now();
  const rows = await database.transaction(
    'r',
    [
      database.projects,
      database.items,
      database.snapshots,
      database.itemVersions,
      database.sessions,
      database.authorship,
      database.itemTexts,
      database.audioFiles,
      database.research,
      database.images,
      database.series,
      ...viewTables(database),
    ],
    async () => ({
      project: await database.projects.get(projectId),
      series: await database.series.where('projectIds').equals(projectId).first(),
      items: await database.items.where('projectId').equals(projectId).toArray(),
      snapshots: await database.snapshots.where('projectId').equals(projectId).toArray(),
      versions: await database.itemVersions.where('projectId').equals(projectId).toArray(),
      sessions: await database.sessions.where('projectId').equals(projectId).toArray(),
      authorship: await database.authorship.where('projectId').equals(projectId).toArray(),
      itemTexts: await database.itemTexts.where('projectId').equals(projectId).toArray(),
      music: options.music ? await database.audioFiles.orderBy('addedAt').toArray() : [],
      research: await database.research.where('projectId').equals(projectId).sortBy('addedAt'),
      images: await database.images.where('projectId').equals(projectId).sortBy('addedAt'),
      views: await readViewRows(projectId, database),
    }),
  );
  const series = rows.series && {
    row: rows.series,
    codex: await database.codex.where('projectId').equals(rows.series.id).toArray(),
  };
  if (!rows.project) throw new Error('The project is not on this device.');
  const project = rows.project;
  const textItems = rows.items.filter((item) => holdsText(project.templates, item.kind));
  const updates = await readItemUpdates(
    textItems.map((item) => item.id),
    database.name,
  );
  const music = await Promise.all(
    rows.music.map(async ({ data, ...info }): Promise<BackupMusic> => ({
      info,
      data: await bytesBuffer(data),
    })),
  );
  const research = await Promise.all(
    rows.research.map(async ({ data, ...info }): Promise<BackupResearch> =>
      data ? { info, data: await bytesBuffer(data) } : { info },
    ),
  );
  const images = await Promise.all(
    rows.images.map(async ({ data, ...info }): Promise<BackupImage> => ({
      info,
      data: await bytesBuffer(data),
    })),
  );
  return {
    createdAt,
    project,
    items: rows.items,
    snapshots: await Promise.all(rows.snapshots.map(unpackSnapshot)),
    versions: rows.versions,
    sessions: rows.sessions,
    authorship: rows.authorship,
    itemTexts: rows.itemTexts,
    updates: new Map(updates),
    music,
    research,
    images,
    views: rows.views,
    ...(series ? { series } : {}),
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

/**
 * The backup with new ids for the project and every row, and "(copy)" after the title. The copy is in no
 * series: it keeps each shared Codex entry of the series as its own.
 */
function asCopy(source: Backup): Backup {
  const { series, ...backup } = source;
  const projectId = newId();
  const ids = new Map(backup.items.map((item) => [item.id, newId()]));
  const itemId = (old: string) => ids.get(old) ?? old;
  const views = series ? { ...backup.views, codex: [...backup.views.codex, ...series.codex] } : backup.views;
  const copied = copyViews(views, projectId, itemId);
  // Each private-name mark in the text names a person by id, so it moves to the new id too. So does each
  // image node, because an image row belongs to one project, and each link to an item (Phase 19, Task F1).
  const imageIds = new Map(backup.images.map((image) => [image.info.id, newId()]));
  const imageId = (old: string) => imageIds.get(old) ?? old;
  const marks = (update: Uint8Array) => {
    const named = backup.views.people.length === 0 ? update : remapNameMarks(update, copied.personId);
    const imaged = imageIds.size === 0 ? named : remapImageIds(named, imageId);
    return remapNodeAttribute(imaged, ITEM_LINK, 'item', itemId);
  };
  // A kept rule 2 mark (F66) names an entry and a scene by id, so it moves to the new ids too.
  const { settings } = backup.project;
  const scenes = (settings.continuity?.scenes ?? []).flatMap((key) => {
    const [entry = '', item = ''] = key.split(':');
    const entryId = copied.entryId(entry);
    return entryId !== null && ids.has(item) ? [sceneKey(entryId, itemId(item))] : [];
  });
  return {
    ...backup,
    project: {
      ...backup.project,
      id: projectId,
      title: `${backup.project.title} (copy)`,
      settings: settings.continuity
        ? { ...settings, continuity: { ...settings.continuity, scenes } }
        : settings,
    },
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
    // Each entry keeps its hash, which does not cover the project, so the copy's record still checks.
    authorship: backup.authorship.map((e) => ({ ...e, id: newId(), projectId })),
    research: backup.research.map((r) => ({
      ...r,
      info: {
        ...r.info,
        id: newId(),
        projectId,
        ...(r.info.itemId === undefined ? {} : { itemId: itemId(r.info.itemId) }),
      },
    })),
    images: backup.images.map((image) => ({
      ...image,
      info: { ...image.info, id: imageId(image.info.id), projectId },
    })),
    itemTexts: backup.itemTexts.map((t) => ({
      ...t,
      projectId,
      itemId: itemId(t.itemId),
      ...(t.links ? { links: t.links.map(itemId) } : {}),
    })),
    updates: new Map([...backup.updates].map(([old, update]) => [itemId(old), marks(update)])),
    views: copied.views,
  };
}

/**
 * Puts the book back in its series (F59). A series that is not here comes back with this book only. A
 * shared entry that is here stays as it is. The books keep the order of the backup.
 */
async function joinSeries(
  series: NonNullable<Backup['series']>,
  projectId: string,
  database: VloDb,
): Promise<void> {
  const here = await database.series.get(series.row.id);
  const stored = await database.codex.bulkGet(series.codex.map((entry) => entry.id));
  await database.codex.bulkAdd(series.codex.filter((_, i) => stored[i] === undefined));
  const order = series.row.projectIds;
  const books = new Set([...(here?.projectIds ?? []), projectId]);
  const projectIds = [
    ...order.filter((id) => books.has(id)),
    ...[...books].filter((id) => !order.includes(id)),
  ];
  await database.series.put({ ...(here ?? series.row), projectIds });
}

/**
 * Stores a checked backup. Returns the id of the project in the Library. Replace keeps the device copy in
 * memory until the backup is stored, and puts it back if a write fails, so the device always holds one of
 * the two (architecture review finding 4).
 */
export async function importBackup(source: Backup, mode: ImportMode): Promise<string> {
  const read = mode === 'copy' ? asCopy(source) : source;
  // The file is a backup of this state, so the project counts as backed up when the file was made.
  const backup = { ...read, project: { ...read.project, lastBackupAt: read.createdAt || clock.now() } };
  if (mode !== 'replace') {
    await storeBackup(backup);
    return backup.project.id;
  }
  const before = await collectBackup(backup.project.id, { music: false });
  await deleteProject(backup.project.id, { keepShares: true });
  try {
    await storeBackup(backup);
  } catch (error) {
    await storeBackup(before);
    throw error;
  }
  return backup.project.id;
}

/**
 * Stores the text, then the rows in one transaction. A failed write removes the text it stored, so it
 * leaves no half project in the Library.
 */
async function storeBackup(backup: Backup, database: VloDb = db): Promise<void> {
  const now = clock.now();
  const written: string[] = [];
  // An item of the backup that is here already must keep its text, so nothing is written.
  const here = await database.items.bulkGet(backup.items.map((item) => item.id));
  if (here.some((item) => item !== undefined))
    throw new Error('This device has items of this backup already. Import it as a copy.');
  try {
    await inBatches([...backup.updates], async ([itemId, update]) => {
      // A database left from an earlier delete must not merge into the backup's text.
      await deleteItemDoc(itemId, database.name);
      written.push(itemId);
      await writeItemUpdate(itemId, update, now, database.name);
    });
    await database.transaction(
      'rw',
      [
        database.projects,
        database.items,
        database.snapshots,
        database.itemVersions,
        database.sessions,
        database.authorship,
        database.itemTexts,
        database.audioFiles,
        database.research,
        database.images,
        database.series,
        ...viewTables(database),
      ],
      async () => {
        if (backup.series) await joinSeries(backup.series, backup.project.id, database);
        await database.projects.add(backup.project);
        // A backup made before Chinese and Japanese counted characters (F38), or before count rule 2,
        // holds counts of an older rule, so each item counts again from its text copy.
        await database.items.bulkAdd(
          recountItems(backup.items, backup.itemTexts, backup.project.settings.language),
        );
        await database.snapshots.bulkAdd(backup.snapshots);
        await database.itemVersions.bulkAdd(backup.versions);
        await database.sessions.bulkAdd(backup.sessions);
        await database.authorship.bulkAdd(backup.authorship);
        await database.itemTexts.bulkPut(backup.itemTexts);
        await database.cards.bulkAdd(backup.views.cards);
        await database.threads.bulkAdd(backup.views.threads);
        await database.cardLinks.bulkAdd(backup.views.cardLinks);
        await database.lifeStages.bulkAdd(backup.views.lifeStages);
        await database.sequences.bulkAdd(backup.views.sequences);
        await database.people.bulkAdd(backup.views.people);
        await database.submissions.bulkAdd(backup.views.submissions);
        await database.codex.bulkAdd(backup.views.codex);
        await database.sources.bulkAdd(backup.views.sources);
        await database.research.bulkAdd(
          backup.research.map(({ info, data }) => (data ? { ...info, data } : info)),
        );
        await database.images.bulkAdd(backup.images.map(({ info, data }) => ({ ...info, data })));
        // Music belongs to the device, not the project. A file that is already here stays as it is.
        const known = new Set(await database.audioFiles.toCollection().primaryKeys());
        await database.audioFiles.bulkAdd(
          backup.music.filter((m) => !known.has(m.info.id)).map((m) => ({ ...m.info, data: m.data })),
        );
      },
    );
  } catch (error) {
    await Promise.all(written.map((itemId) => deleteItemDoc(itemId, database.name).catch(() => undefined)));
    throw error;
  }
}

/**
 * Copies a project from another library on this device into `into`, for a merge of two accounts. The
 * other library keeps its project. A project that `into` has already, with the same last change, stays as
 * it is. One that differs goes in as a copy next to it, so no word is lost. A merge again of the same
 * version changes nothing. Returns true when it copied.
 */
export async function copyProject(projectId: string, from: VloDb, into: VloDb = db): Promise<boolean> {
  const source = await from.projects.get(projectId);
  if (!source) return false;
  const seen = `merged:${from.name}:${projectId}`;
  const here = await into.projects.get(projectId);
  if (here?.updatedAt === source.updatedAt || (await into.appMeta.get(seen))?.value === source.updatedAt)
    return false;
  const backup = await collectBackup(projectId, { music: false }, from);
  const items = await into.items.bulkGet(backup.items.map((item) => item.id));
  const clash = here !== undefined || items.some((item) => item !== undefined);
  await storeBackup(clash ? asCopy(backup) : backup, into);
  await into.appMeta.put({ key: seen, value: source.updatedAt });
  return true;
}
