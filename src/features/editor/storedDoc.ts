import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transform } from '@tiptap/pm/transform';
import { initProseMirrorDoc, updateYFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { editorSchemas } from '@/features/import/tree';
import { takeSnapshot } from '@/features/snapshots/snapshots';
import { clock } from '@/lib/clock';
import type { Item } from '@/lib/db';
import { openItemDoc, YFRAGMENT } from '@/lib/ydocs';
import { DOC_SCHEMA, docSchema, stampDocSchema } from './docSchema';
import { docBody, docText, writeItemText } from './itemText';
import { sendToTabs } from './tabSync';

/*
 * A change to an item's stored text with no editor open, such as an editor's Word changes (F45) or a
 * reader's comment (F50). The change goes into the Yjs text, to each tab that has the item open, and into
 * the text copy that search and counts read, as an editor's save does.
 */

export interface StoredTarget {
  item: Pick<Item, 'id' | 'projectId'>;
  form: 'prose' | 'poem';
  language?: string;
}

/**
 * Makes `change` on the item's document and saves it. With `snapshot`, a snapshot of that name keeps the
 * text as it was. False when a newer Vlo saved the item, so this build leaves it as it is, or when
 * `change` changes nothing.
 */
export async function changeStoredDoc(
  { item, form, language }: StoredTarget,
  change: (doc: ProseMirrorNode) => Transform,
  snapshot?: string,
): Promise<boolean> {
  const open = openItemDoc(item.id);
  try {
    await open.ready;
    if (docSchema(open.doc) > DOC_SCHEMA) return false;
    const fragment = open.doc.getXmlFragment(YFRAGMENT);
    const { doc, meta } = initProseMirrorDoc(fragment, editorSchemas[form]);
    const tr = change(doc);
    if (!tr.docChanged) return false;
    if (snapshot !== undefined) await takeSnapshot(item, open.doc, docText(doc, form), snapshot);
    const updates: Uint8Array[] = [];
    const keep = (update: Uint8Array) => {
      updates.push(update);
    };
    open.doc.on('update', keep);
    open.doc.transact(() => {
      updateYFragment(open.doc, fragment, tr.doc, meta);
      stampDocSchema(open.doc);
    });
    open.doc.off('update', keep);
    await open.confirmSaved(clock.now());
    sendToTabs(item.id, Y.mergeUpdates(updates));
    await writeItemText(item, docText(tr.doc, form), form, docBody(tr.doc, form), language);
    return true;
  } finally {
    await open.close();
  }
}
