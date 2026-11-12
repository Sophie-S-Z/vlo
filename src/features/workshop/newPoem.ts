import { prosemirrorJSONToYDoc } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { addItem } from '@/features/binder/items';
import { writeItemText } from '@/features/editor/itemText';
import { parsePoemText, poemDataToJSON } from '@/features/editor/poemText';
import { editorSchemas } from '@/features/import/tree';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import { deleteItemDoc } from '@/lib/itemDocName';
import { writeItemUpdate, YFRAGMENT } from '@/lib/ydocs';

/**
 * Adds a poem with its text at the end of the collection, for the Workshop's erasure and golden shovel.
 * Returns the new poem's id. The text keeps every space.
 */
export async function addPoem(projectId: string, title: string, text: string): Promise<string> {
  const json = poemDataToJSON(parsePoemText(text));
  const ydoc = prosemirrorJSONToYDoc(editorSchemas.poem, json, YFRAGMENT);
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  const item = await addItem(projectId, null, 'poem', title);
  try {
    await writeItemUpdate(item.id, update, clock.now());
    const language = (await db.projects.get(projectId))?.settings.language;
    await writeItemText(item, text, 'poem', text, language);
  } catch (problem) {
    await db.items.delete(item.id);
    await deleteItemDoc(item.id).catch(() => undefined);
    throw problem;
  }
  return item.id;
}
