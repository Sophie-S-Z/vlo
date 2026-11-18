import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { addWordsToDay, dayKey } from '@/features/progress/streaks';
import { clock } from '@/lib/clock';
import { db, type Item, type ItemText } from '@/lib/db';
import { countLines, countWords } from '@/lib/wordcount';
import { noteLinkIndex } from '@/features/links/linkStore';
import { FOOTNOTE } from './extensions/footnote';
import { linkIndexOf, type LinkIndex } from './format/itemLink';
import { notesBlock, parseNote, type NoteContent } from './format/notes';
import { acceptedDoc } from './format/suggestion';
import { leafText } from './leafText';
import { poemDataFromDoc, poemDataToText } from './poemText';
import type { EditorForm } from '@/features/library/templates';

/**
 * Plain text of the writing itself. Prose blocks are separated by a blank line; a scene break is "#", and
 * an equation is its LaTeX between $ signs.
 */
export function docBody(source: ProseMirrorNode, kind: EditorForm): string {
  // Waiting suggestions count as accepted (decision R2), so a deleted word is not in the text.
  return bodyOf(acceptedDoc(source), kind);
}

function bodyOf(doc: ProseMirrorNode, kind: EditorForm): string {
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
export function docText(doc: ProseMirrorNode, kind: EditorForm): string {
  return docParts(doc, kind).text;
}

/** What a save of an item keeps: the plain text, the writing that the counts cover, and its links. */
export interface TextParts {
  text: string;
  /** The writing without its notes. The whole text when absent. */
  body?: string;
  index?: LinkIndex;
}

/** The plain text of `docText`, the writing of `docBody` and the links, from the accepted document. */
export function docParts(source: ProseMirrorNode, kind: EditorForm): Required<TextParts> {
  const doc = acceptedDoc(source);
  const body = bodyOf(doc, kind);
  const index = linkIndexOf(doc);
  const notes = notesBlock(docNotes(doc));
  if (notes === '') return { text: body, body, index };
  if (kind === 'poem') return { text: `${body}\n${notes}\n`, body, index };
  return { text: body === '' ? notes : `${body}\n\n${notes}`, body, index };
}

/** The link fields of a text copy. An item with no link and no heading keeps neither field. */
export function indexFields(index: LinkIndex | undefined): Pick<ItemText, 'links' | 'headings'> {
  return {
    ...(index?.links.length ? { links: index.links } : {}),
    ...(index?.headings.length ? { headings: index.headings } : {}),
  };
}

/**
 * Stores the plain-text copy of an item (for search and readable backups, ADR 0003) with its links, its
 * word count, its line count for poems, the project's last change time, and the change in words for
 * today. `body` is the part that the counts cover: the writing without its notes. `language` sets the
 * count unit (F38).
 */
export async function writeItemText(
  item: Pick<Item, 'id' | 'projectId'>,
  { text, body = text, index }: TextParts,
  kind: EditorForm,
  language?: string,
): Promise<void> {
  const now = clock.now();
  const wordCount = countWords(body, language);
  const lineCount = kind === 'poem' ? countLines(body) : undefined;
  const saved = await db.transaction('rw', [db.itemTexts, db.items, db.projects], async () => {
    // The item may have been deleted while the writer paused.
    const before = await db.items.get(item.id);
    if (!before) return false;
    await db.itemTexts.put({
      itemId: item.id,
      projectId: item.projectId,
      text,
      updatedAt: now,
      ...indexFields(index),
    });
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
    return true;
  });
  if (saved && index) noteLinkIndex(item.projectId, item.id, index);
}

/**
 * Writes the text copy and the counts again when the copy differs from the open document. A tab that
 * closes in the save pause can end before its write, and the copy then misses the last words.
 */
export async function refreshItemText(
  item: Pick<Item, 'id' | 'projectId'>,
  doc: ProseMirrorNode,
  kind: EditorForm,
  language?: string,
): Promise<void> {
  const parts = docParts(doc, kind);
  // An empty editor can be one that has not drawn its document yet, so it never replaces a stored copy.
  if (parts.text === '') return;
  const stored = await db.itemTexts.get(item.id);
  if (stored?.text !== parts.text) await writeItemText(item, parts, kind, language);
}
