import type { Editor } from '@tiptap/core';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import { Dexie } from 'dexie';
import type * as Y from 'yjs';
import { KEEP_AI_MARKS } from '@/features/editor/extensions/aiOrigin';
import { SKIP_TRACKING } from '@/features/editor/format/suggestion';
import { docText } from '@/features/editor/itemText';
import { clock } from '@/lib/clock';
import { db, type Item, type Snapshot } from '@/lib/db';
import { newId } from '@/lib/ids';
import { YFRAGMENT, docFromUpdate } from '@/lib/ydocs';
import type { EditorForm } from '@/features/library/templates';
import { applyEntry, cleanName, cleanNote, cleanTime, entryTime, HistoryError } from './entries';
import { contentState, pack, snapshotState } from './packing';

export const BEFORE_RESTORE = 'Before restore';
export const BEFORE_SYNC = 'Before sync';

const DAY_MS = 24 * 60 * 60 * 1000;
/** After this age, a week keeps one automatic snapshot, not each day. */
const DAILY_FOR_MS = 30 * DAY_MS;

/** The time bucket of an automatic snapshot older than a day: its day on the device, or later its week. */
function bucketOf(createdAt: number, now: number): string {
  const start = new Date(createdAt);
  start.setHours(0, 0, 0, 0);
  if (now - createdAt < DAILY_FOR_MS) return `day ${String(start.getTime())}`;
  // A week starts on Monday.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return `week ${String(start.getTime())}`;
}

/** True for a snapshot that Vlo took with no step of the writer: the timer's, and one before a sync. */
const automatic = (label: string | undefined) => label === undefined || label === BEFORE_SYNC;

type Dated = Pick<Snapshot, 'id' | 'label' | 'createdAt' | 'pinned'>;

/**
 * The automatic snapshots to delete, as Time Machine thins its backups. Every snapshot of the last day
 * stays, then the newest of each day for 30 days, then the newest of each week. A snapshot that the
 * writer saved, named or pinned, or one from before a step of the writer such as a restore, always
 * stays. The true save time counts, not a date that the writer gave.
 */
export function thinnedIds(snapshots: readonly Dated[], now: number): string[] {
  const old = snapshots.filter((s) => automatic(s.label) && !s.pinned && now - s.createdAt >= DAY_MS);
  const newest = new Map<string, Pick<Snapshot, 'id' | 'createdAt'>>();
  for (const s of old) {
    const key = bucketOf(s.createdAt, now);
    const kept = newest.get(key);
    if (!kept || s.createdAt > kept.createdAt) newest.set(key, s);
  }
  const keep = new Set([...newest.values()].map((s) => s.id));
  return old.filter((s) => !keep.has(s.id)).map((s) => s.id);
}

/** Deletes the automatic snapshots of an item that `thinnedIds` gives. */
async function thinSnapshots(itemId: string, now: number): Promise<void> {
  await db.transaction('rw', db.snapshots, async () => {
    // Only the dates stay in memory, not the states, so an item with thousands of snapshots is safe.
    const old: Dated[] = [];
    await db.snapshots
      .where('[itemId+createdAt]')
      .between([itemId, Dexie.minKey], [itemId, now - DAY_MS], true, true)
      .each(({ id, label, createdAt, pinned }) => {
        old.push({ id, createdAt, ...(label === undefined ? {} : { label }), ...(pinned ? { pinned } : {}) });
      });
    await db.snapshots.bulkDelete(thinnedIds(old, now));
  });
}

type ItemRef = Pick<Item, 'id' | 'projectId'>;

/**
 * Saves the item's text as a Yjs state with no edit history, in gzip, and its plain text. An automatic
 * snapshot then thins the item's older automatic snapshots. A step of the writer never thins, so a
 * restore keeps the snapshot that it restored.
 */
export async function takeSnapshot(
  item: ItemRef,
  doc: Y.Doc,
  text: string,
  label?: string,
): Promise<Snapshot> {
  // The state is read before the first await, so it matches `text`.
  const state = contentState(doc);
  const snapshot: Snapshot = {
    id: newId(),
    projectId: item.projectId,
    itemId: item.id,
    ...(label ? { label } : {}),
    createdAt: clock.now(),
    ...(await pack(state)),
    text,
  };
  await db.snapshots.add(snapshot);
  // The snapshot is safe. A thinning that fails tries again at the next automatic snapshot.
  if (automatic(label)) await thinSnapshots(item.id, snapshot.createdAt).catch(() => undefined);
  return snapshot;
}

/** The text of an item's newest snapshot, or null when it has none. Reads one row only. */
export async function latestSnapshotText(itemId: string): Promise<string | null> {
  const last = await db.snapshots
    .where('[itemId+createdAt]')
    .between([itemId, Dexie.minKey], [itemId, Dexie.maxKey])
    .last();
  return last?.text ?? null;
}

/** An item's snapshots, newest first by the date that History shows. */
export async function snapshotsOf(itemId: string): Promise<Snapshot[]> {
  const rows = await db.snapshots
    .where('[itemId+createdAt]')
    .between([itemId, Dexie.minKey], [itemId, Dexie.maxKey])
    .reverse()
    .toArray();
  return rows.sort((a, b) => entryTime(b) - entryTime(a));
}

export interface SnapshotEdit {
  /** An empty name takes the name away. */
  name: string;
  note: string;
  /** The date and time that History shows. The true save time gives no date of the writer. */
  at: number;
  pinned: boolean;
}

/** Changes the name, the note, the date and the pin of a snapshot. Its text never changes. */
export async function editSnapshot(id: string, edit: SnapshotEdit): Promise<void> {
  const name = cleanName(edit.name);
  const note = cleanNote(edit.note);
  const at = cleanTime(edit.at, clock.now());
  const found = await db.snapshots
    .where('id')
    .equals(id)
    .modify((row) => {
      if (name === '') delete row.label;
      else row.label = name;
      if (edit.pinned) row.pinned = true;
      else delete row.pinned;
      applyEntry(row, note, at);
    });
  if (found === 0) throw new HistoryError('Vlo could not find that snapshot.');
}

/** Deletes a snapshot, and gives it back for an Undo. */
export async function deleteSnapshot(id: string): Promise<Snapshot | undefined> {
  const row = await db.snapshots.get(id);
  if (row) await db.snapshots.delete(id);
  return row;
}

/** Puts a deleted snapshot back, as it was. */
export async function undoDeleteSnapshot(row: Snapshot): Promise<void> {
  await db.snapshots.put(row);
}

/**
 * Puts a snapshot's text back. The current text is saved first as a "Before restore" snapshot.
 */
export async function restoreSnapshot(
  item: ItemRef,
  editor: Editor,
  doc: Y.Doc,
  snapshotId: string,
  kind: EditorForm,
): Promise<void> {
  const snapshot = await db.snapshots.get(snapshotId);
  if (snapshot?.itemId !== item.id) throw new Error('Vlo could not find that snapshot.');
  const state = await snapshotState(snapshot);
  await takeSnapshot(item, doc, docText(editor.state.doc, kind), BEFORE_RESTORE);
  applyState(editor, state);
}

/**
 * Puts a stored Yjs state in the editor in one transaction, so the change goes into the item's live Yjs
 * document and its history continues. The AI marks and the suggestions of the state come back as they were.
 */
export function applyState(editor: Editor, state: Uint8Array): void {
  const old = docFromUpdate(state);
  try {
    const node = yXmlFragmentToProseMirrorRootNode(old.getXmlFragment(YFRAGMENT), editor.schema);
    editor
      .chain()
      .setMeta(KEEP_AI_MARKS, true)
      .setMeta(SKIP_TRACKING, true)
      .setContent(node, { emitUpdate: true })
      .run();
  } finally {
    old.destroy();
  }
}
