import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { clock } from '@/lib/clock';
import { db, type Item } from '@/lib/db';
import { countLines, countWords } from '@/lib/wordcount';
import { poemDataFromDoc, poemDataToText } from './poemText';

/** Text for leaf nodes: a line break keeps words apart, and a scene break is "#". */
const LEAF_TEXT: Record<string, string> = { hardBreak: '\n', sceneBreak: '#' };

/** Plain text of an editor document. Prose blocks are separated by a blank line; a scene break is "#". */
export function docText(doc: ProseMirrorNode, kind: 'prose' | 'poem'): string {
  if (kind === 'poem') return poemDataToText(poemDataFromDoc(doc));
  return doc.textBetween(0, doc.content.size, '\n\n', (leaf) => LEAF_TEXT[leaf.type.name] ?? '');
}

/**
 * Stores the plain-text copy of an item (for search and readable backups, ADR 0003), its word count,
 * its line count for poems, and the project's last change time.
 */
export async function writeItemText(
  item: Pick<Item, 'id' | 'projectId'>,
  text: string,
  kind: 'prose' | 'poem',
): Promise<void> {
  const now = clock.now();
  const wordCount = countWords(text);
  const lineCount = kind === 'poem' ? countLines(text) : undefined;
  await db.transaction('rw', [db.itemTexts, db.items, db.projects], async () => {
    // The item may have been deleted while the writer paused.
    if (!(await db.items.get(item.id))) return;
    await db.itemTexts.put({ itemId: item.id, projectId: item.projectId, text, updatedAt: now });
    await db.items.update(item.id, {
      wordCount,
      ...(lineCount === undefined ? {} : { lineCount }),
      updatedAt: now,
    });
    await db.projects.update(item.projectId, { updatedAt: now });
  });
}
