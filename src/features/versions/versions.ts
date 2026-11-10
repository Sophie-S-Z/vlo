import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { KEEP_AI_MARKS } from '@/features/editor/extensions/aiOrigin';
import { SKIP_TRACKING } from '@/features/editor/format/suggestion';
import { docText } from '@/features/editor/itemText';
import { applyState, takeSnapshot } from '@/features/snapshots/snapshots';
import { clock } from '@/lib/clock';
import { db, MAX_VERSION_NAME, MAX_VERSIONS, type Item, type ItemVersion } from '@/lib/db';
import { newId } from '@/lib/ids';
import { docFromUpdate, YFRAGMENT } from '@/lib/ydocs';
import { paragraphDiff, type ParagraphRow } from './paragraphDiff';

/*
 * Named versions of a scene, memory, poem or page (roadmap F55, plan Task K2). The text in the editor is
 * the active version, and `Item.versionName` names it. The other versions are rows with their whole Yjs
 * state. A switch and a "Use this" change the live text through the editor in one transaction, as a
 * snapshot restore does, so every mark stays and a snapshot holds the text from before.
 */

export const MAIN = 'Main';
export const BEFORE_SWITCH = 'Before a switch of version';
export const BEFORE_TAKE = 'Before Use this';

type Kind = 'prose' | 'poem';
type ItemRef = Pick<Item, 'id' | 'projectId'>;

export class VersionError extends Error {}

export function activeName(item: Pick<Item, 'versionName'>): string {
  return item.versionName ?? MAIN;
}

/** The item's other versions, oldest first. */
export async function versionsOf(itemId: string): Promise<ItemVersion[]> {
  const rows = await db.itemVersions.where('itemId').equals(itemId).toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

/** The name, trimmed, or an error that the writer can read. Names are unique for each item. */
function checkName(name: string, taken: readonly string[]): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean === '') throw new VersionError('Give the version a name.');
  if (clean.length > MAX_VERSION_NAME)
    throw new VersionError(`Use ${String(MAX_VERSION_NAME)} characters or fewer.`);
  if (taken.some((t) => t.toLocaleLowerCase() === clean.toLocaleLowerCase()))
    throw new VersionError(`This item has a version named “${clean}”.`);
  return clean;
}

async function freshItem(itemId: string): Promise<Item> {
  const item = await db.items.get(itemId);
  if (!item) throw new VersionError('Vlo could not find this item.');
  return item;
}

/** Keeps a copy of the text in the editor as a new version. The editor keeps its text. */
export async function saveVersion(item: ItemRef, editor: Editor, doc: Y.Doc, kind: Kind, name: string) {
  const now = clock.now();
  await db.transaction('rw', db.items, db.itemVersions, async () => {
    const fresh = await freshItem(item.id);
    const others = await versionsOf(item.id);
    if (others.length >= MAX_VERSIONS)
      throw new VersionError(`An item keeps ${String(MAX_VERSIONS)} versions at most. Delete one first.`);
    const clean = checkName(name, [activeName(fresh), ...others.map((v) => v.name)]);
    await db.itemVersions.add({
      id: newId(),
      projectId: item.projectId,
      itemId: item.id,
      name: clean,
      createdAt: now,
      updatedAt: now,
      state: Y.encodeStateAsUpdate(doc),
      text: docText(editor.state.doc, kind),
    });
  });
}

/**
 * Puts a version in the editor. The text that it replaces stays as a version with its name, and a
 * snapshot holds it too. The rows change after the editor, so a failure leaves two copies, never none.
 */
export async function switchVersion(
  item: ItemRef,
  editor: Editor,
  doc: Y.Doc,
  kind: Kind,
  versionId: string,
) {
  const target = await db.itemVersions.get(versionId);
  if (target?.itemId !== item.id) throw new VersionError('Vlo could not find that version.');
  const fresh = await freshItem(item.id);
  const text = docText(editor.state.doc, kind);
  await takeSnapshot(item, doc, text, BEFORE_SWITCH);
  const now = clock.now();
  await db.itemVersions.add({
    id: newId(),
    projectId: item.projectId,
    itemId: item.id,
    name: activeName(fresh),
    createdAt: now,
    updatedAt: now,
    state: Y.encodeStateAsUpdate(doc),
    text,
  });
  applyState(editor, target.state);
  await db.transaction('rw', db.items, db.itemVersions, async () => {
    await db.itemVersions.delete(target.id);
    await db.items
      .where('id')
      .equals(item.id)
      .modify((row) => {
        if (target.name === MAIN) delete row.versionName;
        else row.versionName = target.name;
      });
  });
}

/** Renames a version, or the active one when `versionId` is null. */
export async function renameVersion(itemId: string, versionId: string | null, name: string): Promise<void> {
  await db.transaction('rw', db.items, db.itemVersions, async () => {
    const fresh = await freshItem(itemId);
    const others = await versionsOf(itemId);
    const current = versionId === null ? activeName(fresh) : others.find((v) => v.id === versionId)?.name;
    const taken = [activeName(fresh), ...others.map((v) => v.name)].filter((n) => n !== current);
    const clean = checkName(name, taken);
    if (versionId === null) {
      await db.items
        .where('id')
        .equals(itemId)
        .modify((row) => {
          if (clean === MAIN) delete row.versionName;
          else row.versionName = clean;
        });
    } else await db.itemVersions.update(versionId, { name: clean, updatedAt: clock.now() });
  });
}

/** Deletes a version that is not in the editor, and gives it back for an Undo. */
export async function deleteVersion(versionId: string): Promise<ItemVersion | undefined> {
  const row = await db.itemVersions.get(versionId);
  if (row) await db.itemVersions.delete(versionId);
  return row;
}

/** Puts a deleted version back, as it was. */
export async function undoDelete(row: ItemVersion): Promise<void> {
  await db.itemVersions.put(row);
}

/** The text of a top-level block: a paragraph, a heading or a stanza. */
const blockText = (node: ProseMirrorNode) => node.textBetween(0, node.content.size, '\n', ' ');

function blocksOf(doc: ProseMirrorNode): ProseMirrorNode[] {
  const out: ProseMirrorNode[] = [];
  doc.forEach((child) => out.push(child));
  return out;
}

/** A version's text as a document of the editor's schema. */
export function versionDoc(editor: Editor, state: Uint8Array): ProseMirrorNode {
  const ydoc = docFromUpdate(state);
  try {
    return yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment(YFRAGMENT), editor.schema);
  } finally {
    ydoc.destroy();
  }
}

export interface Comparison {
  rows: ParagraphRow[];
  now: string[];
  other: string[];
}

/** The blocks of the text now (`a`) beside the blocks of the other version (`b`). */
export function compare(now: ProseMirrorNode, other: ProseMirrorNode): Comparison {
  const a = blocksOf(now).map(blockText);
  const b = blocksOf(other).map(blockText);
  return { rows: paragraphDiff(a, b), now: a, other: b };
}

/**
 * Takes block `b` of the other version into the text now: in place of its changed partner, or after the
 * block that comes before it. A snapshot holds the text from before. The block keeps its marks.
 */
export async function takeBlock(
  item: ItemRef,
  editor: Editor,
  doc: Y.Doc,
  kind: Kind,
  state: Uint8Array,
  b: number,
): Promise<void> {
  const other = versionDoc(editor, state);
  const { rows } = compare(editor.state.doc, other);
  const index = rows.findIndex((r) => r.kind !== 'onlyA' && r.b === b);
  const row = rows[index];
  const block = blocksOf(other)[b];
  if (!row || !block || row.kind === 'same') return;
  await takeSnapshot(item, doc, docText(editor.state.doc, kind), BEFORE_TAKE);
  // The block of the text now that the new one replaces or follows.
  const before = rows.slice(0, index).findLast((r) => r.kind !== 'onlyB');
  const target = row.kind === 'changed' ? row.a : before ? before.a + 1 : 0;
  let pos = 0;
  for (const node of blocksOf(editor.state.doc).slice(0, target)) pos += node.nodeSize;
  const tr = editor.state.tr;
  if (row.kind === 'changed') {
    const old = editor.state.doc.child(row.a);
    tr.replaceWith(pos, pos + old.nodeSize, block);
  } else tr.insert(pos, block);
  tr.setMeta(KEEP_AI_MARKS, true).setMeta(SKIP_TRACKING, true);
  editor.view.dispatch(tr);
}
