import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { addWordsToDay, dayKey } from '@/features/progress/streaks';
import { clock } from '@/lib/clock';
import { db, type Item } from '@/lib/db';
import { countLines, countWords } from '@/lib/wordcount';
import { FOOTNOTE } from './extensions/footnote';
import { notesBlock, parseNote, type NoteContent } from './format/notes';
import { leafText } from './leafText';
import { poemDataFromDoc, poemDataToText } from './poemText';

/**
 * Plain text of the writing itself. Prose blocks are separated by a blank line; a scene break is "#", and
 * an equation is its LaTeX between $ signs.
 */
export function docBody(doc: ProseMirrorNode, kind: 'prose' | 'poem'): string {
  if (kind === 'poem') return poemDataToText(poemDataFromDoc(doc));
  return doc.textBetween(0, doc.content.size, '\n\n', leafText);
}

/** The footnotes of a document, in document order. */
export function docNotes(doc: ProseMirrorNode): NoteContent[] {
  const notes: NoteContent[] = [];
  doc.descendants((node) => {
    if (node.type.name === FOOTNOTE) notes.push(parseNote(node.attrs.content));
    return !node.isText;
  });
  return notes;
}

/**
 * Plain text of an editor document: the writing, then its notes under a "Notes" line, so search finds
 * a note and a readable backup keeps it.
 */
export function docText(doc: ProseMirrorNode, kind: 'prose' | 'poem'): string {
  const body = docBody(doc, kind);
  const notes = notesBlock(docNotes(doc));
  if (notes === '') return body;
  if (kind === 'poem') return `${body}\n${notes}\n`;
  return body === '' ? notes : `${body}\n\n${notes}`;
}

/**
 * Stores the plain-text copy of an item (for search and readable backups, ADR 0003), its word count,
 * its line count for poems, the project's last change time, and the change in words for today. `counted`
 * is the part that the counts cover: the writing without its notes.
 */
export async function writeItemText(
  item: Pick<Item, 'id' | 'projectId'>,
  text: string,
  kind: 'prose' | 'poem',
  counted: string = text,
): Promise<void> {
  const now = clock.now();
  const wordCount = countWords(counted);
  const lineCount = kind === 'poem' ? countLines(counted) : undefined;
  await db.transaction('rw', [db.itemTexts, db.items, db.projects], async () => {
    // The item may have been deleted while the writer paused.
    const before = await db.items.get(item.id);
    if (!before) return;
    await db.itemTexts.put({ itemId: item.id, projectId: item.projectId, text, updatedAt: now });
    await db.items.update(item.id, {
      wordCount,
      ...(lineCount === undefined ? {} : { lineCount }),
      updatedAt: now,
    });
    const added = wordCount - before.wordCount;
    // The day's net words feed the goal and the streak (F21), as "Written today" counts them.
    await db.projects
      .where('id')
      .equals(item.projectId)
      .modify((project) => {
        project.updatedAt = now;
        if (added !== 0)
          project.settings = {
            ...project.settings,
            wordsByDay: addWordsToDay(project.settings.wordsByDay ?? {}, dayKey(now), added),
          };
      });
  });
}
