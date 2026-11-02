import type { Editor } from '@tiptap/core';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import { Dexie } from 'dexie';
import * as Y from 'yjs';
import { docText } from '@/features/editor/itemText';
import { clock } from '@/lib/clock';
import { db, type Item, type Snapshot } from '@/lib/db';
import { newId } from '@/lib/ids';
import { YFRAGMENT, docFromUpdate } from '@/lib/ydocs';

export const BEFORE_RESTORE = 'Before restore';

type ItemRef = Pick<Item, 'id' | 'projectId'>;

/** Saves the item's whole Yjs state and its plain text. */
export async function takeSnapshot(
  item: ItemRef,
  doc: Y.Doc,
  text: string,
  label?: string,
): Promise<Snapshot> {
  const snapshot: Snapshot = {
    id: newId(),
    projectId: item.projectId,
    itemId: item.id,
    ...(label ? { label } : {}),
    createdAt: clock.now(),
    state: Y.encodeStateAsUpdate(doc),
    text,
  };
  await db.snapshots.add(snapshot);
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

/** An item's snapshots, newest first. */
export function snapshotsOf(itemId: string): Promise<Snapshot[]> {
  return db.snapshots
    .where('[itemId+createdAt]')
    .between([itemId, Dexie.minKey], [itemId, Dexie.maxKey])
    .reverse()
    .toArray();
}

/**
 * Puts a snapshot's text back. The current text is saved first as a "Before restore" snapshot.
 * The editor replaces its content in one transaction, so the change goes into the item's live Yjs
 * document and its history continues.
 */
export async function restoreSnapshot(
  item: ItemRef,
  editor: Editor,
  doc: Y.Doc,
  snapshotId: string,
  kind: 'prose' | 'poem',
): Promise<void> {
  const snapshot = await db.snapshots.get(snapshotId);
  if (snapshot?.itemId !== item.id) throw new Error('Vlo could not find that snapshot.');
  await takeSnapshot(item, doc, docText(editor.state.doc, kind), BEFORE_RESTORE);
  const old = docFromUpdate(snapshot.state);
  try {
    const node = yXmlFragmentToProseMirrorRootNode(old.getXmlFragment(YFRAGMENT), editor.schema);
    editor.commands.setContent(node, { emitUpdate: true });
  } finally {
    old.destroy();
  }
}
