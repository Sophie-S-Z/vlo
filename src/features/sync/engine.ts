import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { DOC_SCHEMA } from '@/features/editor/docSchema';
import { docBody, docText } from '@/features/editor/itemText';
import { dayStartKey } from '@/features/editor/stats/dayStart';
import { sendToTabs } from '@/features/editor/tabSync';
import { editorSchemas } from '@/features/import/tree';
import { holdsText, projectDef } from '@/features/library/templates';
import { rpc, ShareError, type RpcName } from '@/features/share/rpc';
import { takeSnapshot } from '@/features/snapshots/snapshots';
import { clock } from '@/lib/clock';
import { fromBase64, toBase64, type Sealed } from '@/lib/crypto';
import { db, type ItemKind, type Project } from '@/lib/db';
import { deleteItemDoc } from '@/lib/itemDocName';
import { countLines, countWords } from '@/lib/wordcount';
import { docFromUpdate, encodeDoc, openItemDoc, readItemUpdate, YFRAGMENT } from '@/lib/ydocs';
import {
  blobKey,
  MAX_SYNC_FILE,
  openBlob,
  sealBlob,
  syncKeys,
  type RowsBlob,
  type SyncKeys,
  type TextBlob,
} from './blobs';
import { clockKey, onLocalChange, remoteTransaction, SYNC_TABLES } from './clock';
import { mergeRows, type Version } from './merge';
import { dropped, readSpace, SYNC_META, updateSpace, withSyncLock, type SyncSpace } from './space';
import type { EditorForm } from '@/features/library/templates';

/*
 * Sync on the device (plan Task I6, ADR 0008). A round pushes what changed on this device, then pulls
 * the blobs of the other devices: rows merge by time in one transaction, and texts merge by Yjs.
 */

export const BEFORE_SYNC = 'Before sync';

/** A put that commits late can carry an earlier relay time than one already read, so a read starts back. */
const OVERLAP = 30_000;
const CHANGE_DELAY = 30_000;
const EVERY = 60_000;

export interface SyncResult {
  pushed: number;
  /** The rows and texts that changed on this device. */
  pulled: number;
  blocked?: 'newer-schema';
}

interface Sync {
  space: SyncSpace;
  keys: SyncKeys;
}

interface Listed extends Sealed {
  device: string;
  key: string;
  updated_at: string;
}

const call = <T>(name: RpcName, space: SyncSpace, args: Record<string, unknown> = {}) =>
  rpc<T>(name, { p_space: space.spaceId, p_token: space.token, ...args }, 'sync');

/** A row of a synced table. A project's own row has no `projectId`. */
type Row = Record<string, unknown> & { id: string; projectId: string };
const syncTable = (name: string) => db.table<Row, string>(name);

/**
 * Every row of a project or a series in the synced tables, and each delete that the clock knows, by clock
 * key.
 */
async function localVersions(projectId: string): Promise<Map<string, Version>> {
  return db.transaction('r', [db.syncClock, ...SYNC_TABLES.map(syncTable)], async () => {
    const entries = await db.syncClock.where('projectId').equals(projectId).toArray();
    const stamps = new Map(entries.map((e) => [e.key, e]));
    const out = new Map<string, Version>();
    for (const table of SYNC_TABLES) {
      const rows = await syncTable(table)
        .where(table === 'projects' || table === 'series' ? 'id' : 'projectId')
        .equals(projectId)
        .toArray();
      for (const row of rows) {
        const key = clockKey(table, row.id);
        out.set(key, { table, id: row.id, at: stamps.get(key)?.at ?? 0, row });
      }
    }
    for (const e of entries)
      if (e.gone && !out.has(e.key))
        out.set(e.key, {
          table: e.table,
          id: e.id,
          at: e.at,
          ...(e.seen === undefined ? {} : { seen: e.seen }),
        });
    return out;
  });
}

async function dropBlobs({ space, keys }: Sync, names: string[]): Promise<void> {
  for (const name of names)
    await call('sync_drop', space, { p_device: space.deviceId, p_key: await blobKey(keys, name) });
}

/**
 * The rows that go in a blob of their own, by table, so a few large ones cannot pass the relay's blob
 * limit: research files, images and the Yjs state of item versions.
 */
const OWN_BLOB: Partial<Record<Version['table'], string>> = {
  research: 'file',
  itemVersions: 'version',
  images: 'image',
};

/** The name of the blob of an item's text, a research file or a version, or null for a row with no blob. */
const blobName = (v: Pick<Version, 'table' | 'id'>) => {
  if (v.table === 'items') return `text:${v.id}`;
  const own = OWN_BLOB[v.table];
  return own === undefined ? null : `${own}:${v.id}`;
};
const blobNames = (versions: readonly Pick<Version, 'table' | 'id'>[]) =>
  versions.flatMap((v) => blobName(v) ?? []);

/**
 * Sends the blobs of each project that changed since the last push, and the blobs that the last pull
 * changed. The first push sends every project. `started` is the time that the round started.
 */
async function push(sync: Sync, started: number): Promise<number> {
  const { space, keys } = sync;
  const from = space.deviceName;
  const first = space.pushedAt === 0;
  const again = new Set(first ? [] : space.resend);
  const changes = first
    ? []
    : await db.syncClock
        .where('at')
        .aboveOrEqual(space.pushedAt)
        .filter((e) => !e.remote)
        .toArray();
  const fresh = new Set(changes.filter((e) => !e.gone).map((e) => e.key));
  const projectIds = first
    ? [...(await db.projects.toCollection().primaryKeys()), ...(await db.series.toCollection().primaryKeys())]
    : [
        ...new Set([
          ...changes.map((e) => e.projectId),
          ...[...again].flatMap((name) => (name.startsWith('rows:') ? [name.slice('rows:'.length)] : [])),
        ]),
      ];
  let pushed = 0;
  /** `own` is true for a file or an image, which may stay on this device when the relay has no room. */
  const put = async (name: string, blob: RowsBlob | TextBlob, own = false) => {
    const sealed = await sealBlob(blob, keys);
    try {
      await call('sync_put', space, {
        p_device: space.deviceId,
        p_key: await blobKey(keys, name),
        p_payload: sealed.payload,
        p_iv: sealed.iv,
      });
      pushed += 1;
    } catch (error) {
      // A text too large for the relay stays on this device, and the rest still syncs. So does a file or
      // an image when the space is full: the other devices show its alt text or its name.
      if (!(error instanceof ShareError && (error.kind === 'too-large' || (own && error.kind === 'limit'))))
        throw error;
    }
  };
  for (const projectId of projectIds) {
    const versions = [...(await localVersions(projectId)).values()];
    const project = versions.find((v) => v.table === 'projects')?.row as Project | undefined;
    const rows = versions.filter((v) => OWN_BLOB[v.table] === undefined || !v.row);
    await put(`rows:${projectId}`, { v: 1, schema: DOC_SCHEMA, from, projectId, rows });
    for (const v of versions) {
      const name = blobName(v);
      if (!v.row || !(first || fresh.has(clockKey(v.table, v.id)) || (name !== null && again.has(name))))
        continue;
      if (v.table === 'items' && project && holdsText(project.templates, v.row.kind as ItemKind)) {
        const update = toBase64(await readItemUpdate(v.id));
        await put(`text:${v.id}`, { v: 1, schema: DOC_SCHEMA, from, projectId, itemId: v.id, update });
      }
      // The recording of a memory (F57) never leaves this device, not even sealed.
      if (v.table === 'research' && Number(v.row.size) <= MAX_SYNC_FILE && v.row.itemId === undefined)
        await put(`file:${v.id}`, { v: 1, schema: DOC_SCHEMA, from, projectId, rows: [v] }, true);
      if (v.table === 'itemVersions')
        await put(`version:${v.id}`, { v: 1, schema: DOC_SCHEMA, from, projectId, rows: [v] });
      // An image over 2 MB stays on this device. The other devices show its alt text (decision G7).
      if (v.table === 'images' && Number(v.row.size) <= MAX_SYNC_FILE)
        await put(`image:${v.id}`, { v: 1, schema: DOC_SCHEMA, from, projectId, rows: [v] }, true);
    }
  }
  await dropBlobs(sync, blobNames(changes.filter((e) => e.gone)));
  // The images that the sweep removed (decision G7).
  const swept = space.drop ?? [];
  await dropBlobs(sync, swept);
  await dropped(space.spaceId, swept);
  await updateSpace(space.spaceId, { pushedAt: started, resend: [] });
  return pushed;
}

/** The other devices' blobs from the cursor on, read until a page brings nothing new. */
async function listNew(space: SyncSpace): Promise<Listed[]> {
  let since = space.cursor === '' ? null : new Date(Date.parse(space.cursor) - OVERLAP).toISOString();
  const out: Listed[] = [];
  const seen = new Set<string>();
  for (;;) {
    const page = await call<Listed[]>('sync_list', space, { p_device: space.deviceId, p_since: since });
    const fresh = page.filter((b) => !seen.has(`${b.device} ${b.key} ${b.updated_at}`));
    const last = page.at(-1);
    if (fresh.length === 0 || !last) return out;
    for (const b of fresh) seen.add(`${b.device} ${b.key} ${b.updated_at}`);
    out.push(...fresh);
    since = last.updated_at;
  }
}

/**
 * Removes the rest of a project that another device deleted, as `deleteProject` does. Gives its items and
 * the rows with a blob of their own, so this device drops their blobs. The series row comes in its own
 * blob, with the book out of it.
 */
async function dropProject(id: string): Promise<Pick<Version, 'table' | 'id'>[]> {
  const gone: Pick<Version, 'table' | 'id'>[] = [];
  for (const table of ['items', 'research', 'itemVersions', 'images'] as const)
    for (const rowId of await syncTable(table).where('projectId').equals(id).primaryKeys())
      gone.push({ table, id: rowId });
  for (const name of [
    ...SYNC_TABLES.filter((t) => t !== 'projects' && t !== 'series'),
    'snapshots',
    'sessions',
    'itemTexts',
    'shares',
  ])
    await db.table(name).where('projectId').equals(id).delete();
  await db.appMeta.delete(dayStartKey(id));
  return gone;
}

interface Applied {
  taken: number;
  /** The rows that went, for their blobs and texts. */
  gone: Pick<Version, 'table' | 'id'>[];
  /** The blobs that this device must send again. */
  resend: string[];
  /** This device's rows that a delete never saw. */
  revive: Version[];
}

/**
 * Merges the rows blobs in one transaction. An item keeps this device's counts, which match the text here.
 * When a newer row of an item replaces a change that this device made after `since`, its text goes again.
 */
async function applyRows(blobs: RowsBlob[], since: number): Promise<Applied> {
  const applied: Applied = { taken: 0, gone: [], resend: [], revive: [] };
  if (blobs.length === 0) return applied;
  const tables = [
    db.syncClock,
    db.itemTexts,
    db.snapshots,
    db.sessions,
    db.shares,
    db.appMeta,
    ...SYNC_TABLES.map(syncTable),
  ];
  const { gone, resend } = applied;
  await remoteTransaction(db, tables, async () => {
    for (const blob of blobs) {
      const local = await localVersions(blob.projectId);
      const plan = mergeRows(local, blob.rows);
      for (const v of plan.keep) await syncTable(v.table).put(v.row as Row);
      for (const v of plan.take) {
        const key = clockKey(v.table, v.id);
        const mine = local.get(key)?.row;
        if (v.row && v.table === 'items' && mine) {
          const counts = mine.lineCount === undefined ? {} : { lineCount: mine.lineCount };
          await syncTable(v.table).put({ ...(v.row as Row), wordCount: mine.wordCount, ...counts });
          const stamp = await db.syncClock.get(key);
          if (stamp && !stamp.remote && stamp.at >= since) resend.push(`text:${v.id}`);
        } else if (v.row) await syncTable(v.table).put(v.row as Row);
        else {
          await syncTable(v.table).delete(v.id);
          gone.push(v);
          if (v.table === 'projects') gone.push(...(await dropProject(v.id)));
        }
        await db.syncClock.put({
          key,
          table: v.table,
          id: v.id,
          projectId: blob.projectId,
          at: v.at,
          ...(v.row ? {} : { gone: true }),
          remote: true,
        });
      }
      applied.revive.push(...plan.revive);
      const changed = plan.take.length + plan.keep.length;
      applied.taken += changed;
      // A project that went needs no blob of this device.
      if (changed > 0 && !gone.some((g) => g.table === 'projects' && g.id === blob.projectId))
        resend.push(`rows:${blob.projectId}`);
    }
    const itemIds = gone.filter((g) => g.table === 'items').map((g) => g.id);
    await db.itemTexts.bulkDelete(itemIds);
    await db.snapshots.where('itemId').anyOf(itemIds).delete();
    const versionIds = await db.itemVersions.where('itemId').anyOf(itemIds).primaryKeys();
    await db.itemVersions.bulkDelete(versionIds);
    gone.push(...versionIds.map((id) => ({ table: 'itemVersions' as const, id })));
    // A version whose item went stays gone, unless its item comes back too. The delete above took its row.
    const back = new Set(applied.revive.filter((v) => v.table === 'items').map((v) => v.id));
    const kept: Version[] = [];
    for (const v of applied.revive) {
      const itemId = v.table === 'itemVersions' ? String(v.row?.itemId) : null;
      if (itemId === null || back.has(itemId) || (await db.items.get(itemId))) kept.push(v);
    }
    applied.revive = kept;
  });
  return applied;
}

/**
 * Stamps this device's rows again, so they win over the delete on the other devices. An item whose folder
 * went moves to the top of the binder.
 */
async function revive(versions: readonly Version[]): Promise<void> {
  if (versions.length === 0) return;
  await db.transaction('rw', SYNC_TABLES.map(syncTable), async () => {
    for (const v of versions) {
      const row = v.row as Row;
      const parentId = v.table === 'items' ? (row.parentId as string | null) : null;
      const orphan = parentId !== null && !(await db.items.get(parentId));
      await syncTable(v.table).put(orphan ? { ...row, parentId: null } : row);
    }
  });
}

const proseMirrorOf = (doc: Y.Doc, form: EditorForm) =>
  yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment(YFRAGMENT), editorSchemas[form]);

/**
 * Merges another device's text into the item's text, sends it to open tabs and counts it again. When this
 * device changed the text too, a "Before sync" snapshot keeps this device's text first (decision R6).
 */
async function applyText(blob: TextBlob): Promise<boolean> {
  const item = await db.items.get(blob.itemId);
  const project = item && (await db.projects.get(item.projectId));
  const form = item && project && projectDef(project).editorKind(item.kind);
  if (!item || !project || !form) return false;
  const update = fromBase64(blob.update);
  const open = openItemDoc(item.id);
  let doc: ProseMirrorNode;
  try {
    await open.ready;
    const mine = Y.snapshot(open.doc);
    const both = docFromUpdate(encodeDoc(open.doc));
    Y.applyUpdate(both, update);
    const merged = Y.snapshot(both);
    if (Y.equalSnapshots(mine, merged)) return false;
    if (!Y.equalSnapshots(Y.snapshot(docFromUpdate(update)), merged))
      await takeSnapshot(item, open.doc, docText(proseMirrorOf(open.doc, form), form), BEFORE_SYNC);
    Y.applyUpdate(open.doc, update);
    await open.confirmSaved(clock.now());
    sendToTabs(item.id, update);
    doc = proseMirrorOf(open.doc, form);
  } finally {
    await open.close();
  }
  // The other device counted these words on its own day, so this count does not add them to today.
  const counted = docBody(doc, form);
  const { language } = project.settings;
  await remoteTransaction(db, [db.items, db.itemTexts], async () => {
    if (!(await db.items.get(item.id))) return;
    await db.itemTexts.put({
      itemId: item.id,
      projectId: item.projectId,
      text: docText(doc, form),
      updatedAt: clock.now(),
    });
    await db.items.update(item.id, {
      wordCount: countWords(counted, language),
      ...(form === 'poem' ? { lineCount: countLines(counted) } : {}),
    });
  });
  return true;
}

/**
 * Reads the other devices' blobs. A blob of a newer Vlo stops the read, and this device applies nothing.
 * `since` is the time that the round started.
 */
async function pull(sync: Sync, since: number): Promise<Omit<SyncResult, 'pushed'>> {
  const listed = await listNew(sync.space);
  const rows: RowsBlob[] = [];
  const texts: TextBlob[] = [];
  const names = { ...sync.space.names };
  for (const sealed of listed) {
    const blob = await openBlob(sealed, sync.keys);
    if (blob === 'newer') return { pulled: 0, blocked: 'newer-schema' };
    if (blob) names[sealed.device] = blob.from;
    if (blob && 'rows' in blob) rows.push(blob);
    else if (blob) texts.push(blob);
  }
  const { taken, gone, resend, revive: mine } = await applyRows(rows, since);
  await Promise.all(gone.filter((g) => g.table === 'items').map((g) => deleteItemDoc(g.id)));
  await dropBlobs(sync, blobNames(gone));
  await revive(mine);
  let merged = 0;
  for (const text of texts)
    if (await applyText(text)) {
      merged += 1;
      resend.push(`rows:${text.projectId}`, `text:${text.itemId}`);
    }
  const last = listed.at(-1);
  // The push of this round cleared the list, so the list holds only this pull's blobs.
  await updateSpace(sync.space.spaceId, {
    ...(last ? { cursor: last.updated_at } : {}),
    names,
    resend: [...new Set(resend)],
  });
  return { pulled: taken + merged };
}

async function round(): Promise<SyncResult> {
  const space = await readSpace();
  if (!space) return { pushed: 0, pulled: 0 };
  const sync = { space, keys: await syncKeys(space.key) };
  const started = clock.now();
  try {
    const result = { pushed: await push(sync, started), ...(await pull(sync, started)) };
    await updateSpace(space.spaceId, { syncedAt: clock.now(), blocked: result.blocked !== undefined });
    return result;
  } catch (error) {
    // "Stop sync on all devices" on another device deleted the space, so sync ends here too.
    if (error instanceof ShareError && error.kind === 'unavailable')
      await db.appMeta
        .where('key')
        .equals(SYNC_META)
        .filter((m) => (m.value as SyncSpace).spaceId === space.spaceId)
        .delete();
    throw error;
  }
}

let running: Promise<SyncResult> | null = null;

/** One sync round. A call while a round runs gets that round. Tabs of this device take turns. */
export function syncOnce(): Promise<SyncResult> {
  running ??= withSyncLock(round).finally(() => {
    running = null;
  });
  return running;
}

/**
 * Syncs now, when the window gets focus, 30 seconds after a change on this device, every 60 seconds while
 * the page shows, and when it hides. Gives the function that stops it.
 */
export function startSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    clearTimeout(timer);
    timer = undefined;
    // A failed round, such as one with no connection, tries again at the next trigger.
    syncOnce().catch(() => undefined);
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') run();
  };
  const tick = setInterval(() => {
    if (document.visibilityState === 'visible') run();
  }, EVERY);
  onLocalChange(() => {
    timer ??= setTimeout(run, CHANGE_DELAY);
  });
  window.addEventListener('focus', run);
  document.addEventListener('visibilitychange', onVisibility);
  run();
  return () => {
    clearTimeout(timer);
    clearInterval(tick);
    onLocalChange(null);
    window.removeEventListener('focus', run);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
