import JSZip from 'jszip';
import * as Y from 'yjs';
import { DOC_SCHEMA, docSchema } from '@/features/editor/docSchema';
import { buildExportDoc, exportFileName } from '@/features/export/build';
import { toMarkdown } from '@/features/export/markdown';
import { holdsText as templateHoldsText, TEMPLATE_ORDER } from '@/features/library/templates';
import {
  BackupError,
  checkOrder,
  checkRows,
  count,
  DAMAGED,
  fail,
  id,
  isObject,
  list,
  optionalText,
  text,
  type Json,
} from './check';
import { checkViews } from './views';
import type {
  AudioFile,
  Item,
  ItemKind,
  ItemText,
  Project,
  Session,
  Snapshot,
  Status,
  Template,
  ViewRows,
} from '@/lib/db';

/*
 * The full-project backup file (spec section 9, plan Task B8). One `.vlo.zip` holds:
 * - `project.json`: every Dexie row of the project, without the binary parts;
 * - `items/<id>.yjs`: each item's Yjs update, which is the text itself;
 * - `items/<id>.md`: a readable copy of each item, for a writer who has no Vlo at hand;
 * - `snapshots/<id>.yjs`: the Yjs update of each snapshot;
 * - `music/<id>`: each of the writer's music files, only when the writer asks for them.
 * Version 2 (Phase 3) adds the rows of the template views to `project.json`. Version 3 gives the project a
 * list of templates (`templates`) in place of one `template`. Vlo still reads versions 1 and 2.
 * The reader trusts nothing in the file: it checks each row and each update before Vlo stores them.
 */

export const BACKUP_FORMAT = 'vlo-backup';
/** Raise it when the file layout changes in a way that an older build cannot read. */
export const BACKUP_VERSION = 3;
export const BACKUP_EXTENSION = '.vlo.zip';

export type MusicInfo = Omit<AudioFile, 'data'>;

export interface BackupMusic {
  info: MusicInfo;
  data: ArrayBuffer;
}

/** A project, all its rows and all its text, as the backup file holds them. */
export interface Backup {
  createdAt: number;
  project: Project;
  items: Item[];
  snapshots: Snapshot[];
  sessions: Session[];
  itemTexts: ItemText[];
  /** The Yjs update of each item that holds text, by item id. */
  updates: Map<string, Uint8Array>;
  music: BackupMusic[];
  /** Board cards, threads, life stages, poem orders, people and submissions (Phase 3). */
  views: ViewRows;
}

const KINDS: readonly ItemKind[] = ['part', 'chapter', 'scene', 'memory', 'poem', 'page', 'note'];
const STATUSES: readonly Status[] = ['idea', 'draft', 'revised', 'done'];
const TEMPLATE_IDS: readonly string[] = TEMPLATE_ORDER;
const AI_MODES = ['pen', 'reader', 'cowriter'];

/** The file name for a backup made on `date`, such as "Salt Year backup 2026-11-04.vlo.zip". */
export function backupFileName(title: string, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${exportFileName(title)} backup ${day}${BACKUP_EXTENSION}`;
}

/** True when the item kind holds text in this template. Folders hold only their children. */
export function holdsText(project: Pick<Project, 'templates'>, kind: ItemKind): boolean {
  return templateHoldsText(project.templates, kind);
}

/** A snapshot row without its Yjs bytes, which go in their own file. */
function withoutState(snapshot: Snapshot): Omit<Snapshot, 'state'> {
  const row: Partial<Snapshot> = { ...snapshot };
  delete row.state;
  return row as Omit<Snapshot, 'state'>;
}

/** Writes the backup file. */
export async function writeBackup(backup: Backup): Promise<Uint8Array> {
  const zip = new JSZip();
  const manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    docSchema: DOC_SCHEMA,
    createdAt: backup.createdAt,
    project: backup.project,
    items: backup.items,
    snapshots: backup.snapshots.map(withoutState),
    sessions: backup.sessions,
    itemTexts: backup.itemTexts,
    music: backup.music.map((m) => m.info),
    ...backup.views,
  };
  zip.file('project.json', JSON.stringify(manifest, null, 2));
  for (const item of backup.items) {
    const update = backup.updates.get(item.id);
    if (!update) continue;
    zip.file(`items/${item.id}.yjs`, update);
    const readable = buildExportDoc({
      project: backup.project,
      items: backup.items,
      scope: { kind: 'item', itemId: item.id },
      updates: backup.updates,
    });
    zip.file(`items/${item.id}.md`, toMarkdown(readable));
  }
  for (const snapshot of backup.snapshots) zip.file(`snapshots/${snapshot.id}.yjs`, snapshot.state);
  // Music is already compressed, so it goes in as it is.
  for (const { info, data } of backup.music) zip.file(`music/${info.id}`, data, { compression: 'STORE' });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

// ---------------------------------------------------------------------------------------------------
// Reading. Each check names the part of the file that is wrong, so the writer can report it.

export { BackupError };

/**
 * Checks the project's templates. A backup of version 1 or 2 has one `template`; the check puts it in a
 * list, as the database upgrade to version 6 does.
 */
function checkTemplates(value: Json, what: string): void {
  if (value.templates === undefined) {
    const one = text(value, 'template', what);
    if (!TEMPLATE_IDS.includes(one)) fail(`${DAMAGED} ${what} has a wrong template.`);
    value.templates = [one];
    delete value.template;
  }
  const list = value.templates;
  if (
    !Array.isArray(list) ||
    list.length === 0 ||
    !list.every((t) => typeof t === 'string' && TEMPLATE_IDS.includes(t)) ||
    new Set(list).size !== list.length
  )
    fail(`${DAMAGED} ${what} has a wrong template.`);
  value.templates = TEMPLATE_ORDER.filter((t: Template) => (list as string[]).includes(t));
}

function checkProject(value: unknown): Project {
  if (!isObject(value)) fail(`${DAMAGED} It has no project.`);
  const what = 'The project';
  id(value, 'id', what);
  text(value, 'title', what);
  checkTemplates(value, what);
  if (!AI_MODES.includes(text(value, 'aiMode', what))) fail(`${DAMAGED} ${what} has a wrong aiMode.`);
  optionalText(value, 'authorName', what);
  count(value, 'createdAt', what);
  count(value, 'updatedAt', what);
  if (value.lastBackupAt !== undefined) count(value, 'lastBackupAt', what);
  const settings = value.settings;
  if (!isObject(settings)) fail(`${DAMAGED} ${what} has no settings.`);
  count(settings, 'snapshotEveryMinutes', 'The project settings');
  if (typeof settings.aliasAiRequests !== 'boolean' || typeof settings.streaksEnabled !== 'boolean')
    fail(`${DAMAGED} The project settings are wrong.`);
  if (!Array.isArray(settings.restDays) || !settings.restDays.every((d) => typeof d === 'number'))
    fail(`${DAMAGED} The project settings are wrong.`);
  for (const key of ['font', 'page', 'scene']) optionalText(settings, key, 'The project settings');
  const byDay = settings.wordsByDay;
  if (
    byDay !== undefined &&
    !(
      isObject(byDay) &&
      Object.entries(byDay).every(
        ([day, words]) =>
          /^\d{4}-\d{2}-\d{2}$/.test(day) &&
          typeof words === 'number' &&
          Number.isInteger(words) &&
          words !== 0,
      )
    )
  )
    fail(`${DAMAGED} The project settings are wrong.`);
  const followUp = settings.followUpDays;
  if (
    followUp !== undefined &&
    !(
      isObject(followUp) &&
      Object.values(followUp).every(
        (d) => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 3650,
      )
    )
  )
    fail(`${DAMAGED} The project settings are wrong.`);
  return value as unknown as Project;
}

function checkItems(rows: Json[], projectId: string): Item[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const what = `The item “${typeof row.title === 'string' ? row.title : '?'}”`;
    const itemId = id(row, 'id', what);
    if (ids.has(itemId)) fail(`${DAMAGED} Two items share one id.`);
    ids.add(itemId);
    if (text(row, 'projectId', what) !== projectId) fail(`${DAMAGED} ${what} belongs to another project.`);
    if (row.parentId !== null) id(row, 'parentId', what);
    if (!KINDS.includes(text(row, 'kind', what) as ItemKind)) fail(`${DAMAGED} ${what} has a wrong kind.`);
    text(row, 'title', what);
    optionalText(row, 'synopsis', what);
    if (!STATUSES.includes(text(row, 'status', what) as Status))
      fail(`${DAMAGED} ${what} has a wrong status.`);
    checkOrder(text(row, 'order', what), what);
    count(row, 'wordCount', what);
    if (row.lineCount !== undefined) count(row, 'lineCount', what);
    if (row.craft !== undefined && typeof row.craft !== 'boolean')
      fail(`${DAMAGED} ${what} has a wrong Craft switch.`);
    count(row, 'createdAt', what);
    count(row, 'updatedAt', what);
    if (row.memory !== undefined && !isObject(row.memory)) fail(`${DAMAGED} ${what} has a wrong memory.`);
  }
  // Every parent is an item of the backup, and no item is its own ancestor.
  const parents = new Map(rows.map((row) => [row.id as string, row.parentId as string | null]));
  for (const [itemId, parentId] of parents) {
    if (parentId !== null && !parents.has(parentId))
      fail(`${DAMAGED} An item has a parent that is not in it.`);
    let step: string | null = parentId;
    for (let depth = 0; step !== null; depth += 1) {
      if (step === itemId || depth > parents.size) fail(`${DAMAGED} Its items form a loop.`);
      step = parents.get(step) ?? null;
    }
  }
  return rows as unknown as Item[];
}

/** Applies an update to a new document, and checks that this build can show it. */
function checkUpdate(update: Uint8Array, what: string): void {
  const doc = new Y.Doc();
  try {
    try {
      Y.applyUpdate(doc, update);
    } catch {
      fail(`${DAMAGED} Vlo cannot read the text of ${what}.`);
    }
    if (docSchema(doc) > DOC_SCHEMA)
      fail(
        'A newer version of Vlo made this backup. Reload Vlo to get the newest version, then import it again.',
      );
  } finally {
    doc.destroy();
  }
}

async function readEntry(zip: JSZip, path: string): Promise<Uint8Array | null> {
  const entry = zip.file(path);
  return entry ? entry.async('uint8array') : null;
}

/** Reads and checks a backup file. Throws a BackupError with words for the writer. */
export async function readBackup(bytes: Uint8Array): Promise<Backup> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    fail('This file is not a Vlo backup. A backup is a .vlo.zip file that Vlo made.');
  }
  const json = zip.file('project.json');
  if (!json) fail('This file is not a Vlo backup. A backup is a .vlo.zip file that Vlo made.');
  let manifest: unknown;
  try {
    manifest = JSON.parse(await json.async('string'));
  } catch {
    fail(DAMAGED);
  }
  if (!isObject(manifest) || manifest.format !== BACKUP_FORMAT)
    fail('This file is not a Vlo backup. A backup is a .vlo.zip file that Vlo made.');
  if (typeof manifest.version !== 'number' || manifest.version > BACKUP_VERSION)
    fail(
      'A newer version of Vlo made this backup. Reload Vlo to get the newest version, then import it again.',
    );

  const project = checkProject(manifest.project);
  const items = checkItems(list(manifest, 'items'), project.id);
  const itemIds = new Set(items.map((item) => item.id));

  const snapshotRows = checkRows<Omit<Snapshot, 'state'>>(
    list(manifest, 'snapshots'),
    project.id,
    'A snapshot',
    (row) => {
      id(row, 'id', 'A snapshot');
      if (!itemIds.has(id(row, 'itemId', 'A snapshot'))) fail(`${DAMAGED} A snapshot has no item.`);
      optionalText(row, 'label', 'A snapshot');
      count(row, 'createdAt', 'A snapshot');
      text(row, 'text', 'A snapshot');
    },
  );
  const sessions = checkRows<Session>(list(manifest, 'sessions'), project.id, 'A writing session', (row) => {
    id(row, 'id', 'A writing session');
    for (const key of ['startedAt', 'endedAt', 'wordsAdded', 'poemsAdded'])
      count(row, key, 'A writing session');
  });
  const itemTexts = checkRows<ItemText>(list(manifest, 'itemTexts'), project.id, 'A text copy', (row) => {
    if (!itemIds.has(id(row, 'itemId', 'A text copy'))) fail(`${DAMAGED} A text copy has no item.`);
    text(row, 'text', 'A text copy');
    count(row, 'updatedAt', 'A text copy');
  });
  const views = checkViews(manifest, project.id, itemIds);
  const stageIds = new Set(views.lifeStages.map((stage) => stage.id));
  for (const item of items) {
    const stage = item.memory?.lifeStageId;
    if (stage !== undefined && !stageIds.has(stage))
      fail(`${DAMAGED} A memory names a life stage that is not in it.`);
  }
  const musicRows = manifest.music === undefined ? [] : list(manifest, 'music');
  for (const row of musicRows) {
    id(row, 'id', 'A music file');
    text(row, 'name', 'A music file');
    text(row, 'type', 'A music file');
    for (const key of ['size', 'duration', 'addedAt']) count(row, key, 'A music file');
  }

  const updates = new Map<string, Uint8Array>();
  for (const item of items) {
    const update = await readEntry(zip, `items/${item.id}.yjs`);
    if (update === null) {
      if (holdsText(project, item.kind)) fail(`${DAMAGED} The text of “${item.title}” is missing.`);
      continue;
    }
    checkUpdate(update, `“${item.title}”`);
    updates.set(item.id, update);
  }
  const snapshots: Snapshot[] = [];
  for (const row of snapshotRows) {
    const state = await readEntry(zip, `snapshots/${row.id}.yjs`);
    if (state === null) fail(`${DAMAGED} A snapshot of an item is missing.`);
    checkUpdate(state, 'a snapshot');
    snapshots.push({ ...row, state });
  }
  const music: BackupMusic[] = [];
  for (const row of musicRows) {
    const data = await readEntry(zip, `music/${row.id as string}`);
    if (data === null) fail(`${DAMAGED} The music file “${row.name as string}” is missing.`);
    // A copy that owns its whole buffer, because Vlo stores the ArrayBuffer itself.
    music.push({ info: row as unknown as MusicInfo, data: data.slice().buffer });
  }

  return {
    createdAt: typeof manifest.createdAt === 'number' ? manifest.createdAt : 0,
    project,
    items,
    snapshots,
    sessions,
    itemTexts,
    updates,
    music,
    views,
  };
}
