import { prosemirrorJSONToYDoc } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { docBody, docText } from '@/features/editor/itemText';
import { editorSchemas } from '@/features/import/tree';
import { createProject, deleteProject } from '@/features/library/projects';
import { TEMPLATES } from '@/features/library/templates';
import { clock } from '@/lib/clock';
import { db, type Item } from '@/lib/db';
import { newId } from '@/lib/ids';
import { deleteItemDoc } from '@/lib/itemDocName';
import { orderAfterLast, orderBetween } from '@/lib/order';
import { countWords } from '@/lib/wordcount';
import { writeItemUpdate, YFRAGMENT } from '@/lib/ydocs';

/*
 * Quick capture (roadmap F48, plan Task H8). A note from the share sheet, the app shortcut or the Library
 * goes into the Inbox folder at the top of a project. It stays on this device.
 */

export const INBOX = 'Inbox';
const TITLE_LENGTH = 60;

/** The text of a share: the shared text, then its link on a line of its own if the text does not hold it. */
export function sharedText(text: string, url: string): string {
  const body = text.trim();
  const link = url.trim();
  return link === '' || body.includes(link) ? body : [body, link].filter(Boolean).join('\n');
}

/** The start of the first line, with no half of a character pair at the cut. */
function firstLine(text: string): string {
  return (text.split('\n')[0] ?? '')
    .trim()
    .slice(0, TITLE_LENGTH)
    .replace(/[\uD800-\uDBFF]$/, '');
}

/** A prose document of the text: a blank line starts a paragraph, and a line break stays a line break. */
function noteDoc(text: string) {
  return editorSchemas.prose.nodeFromJSON({
    type: 'doc',
    content: text.split(/\n\s*\n/).map((block) => ({
      type: 'paragraph',
      content: block
        .split('\n')
        .flatMap((line, i) => [
          ...(i > 0 ? [{ type: 'hardBreak' }] : []),
          ...(line === '' ? [] : [{ type: 'text', text: line }]),
        ]),
    })),
  });
}

/**
 * Adds the text as a note in the project's Inbox folder, and makes the folder first if there is none.
 * With no project, the note goes into a new Open writing project.
 */
export async function captureNote(
  projectId: string | null,
  capture: { title?: string; text: string },
): Promise<{ projectId: string; itemId: string }> {
  const text = capture.text.trim();
  if (text === '') throw new RangeError('Type or paste the text of the note.');
  const target =
    projectId ?? (await createProject({ title: TEMPLATES.open.untitled, templates: ['open'] })).project.id;
  // With no title, the note takes the start of its first line.
  const named = capture.title?.trim() ?? '';
  const now = clock.now();
  const doc = noteDoc(text);
  const itemId = newId();
  // The text goes into its own database first. If the binder change fails, the text goes too.
  const ydoc = prosemirrorJSONToYDoc(editorSchemas.prose, doc.toJSON(), YFRAGMENT);
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  try {
    await writeItemUpdate(itemId, update, now);
    await db.transaction('rw', [db.items, db.itemTexts, db.projects], async () => {
      const rows = await db.items.where('projectId').equals(target).toArray();
      const language = (await db.projects.get(target))?.settings.language;
      const top = rows.filter((i) => i.parentId === null);
      let inbox = top.find((i) => i.kind === 'part' && i.title === INBOX);
      if (!inbox) {
        const first = top.map((i) => i.order).sort()[0] ?? null;
        inbox = {
          id: newId(),
          projectId: target,
          parentId: null,
          kind: 'part',
          title: INBOX,
          status: 'draft',
          order: orderBetween(null, first),
          wordCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        await db.items.add(inbox);
      }
      const inboxId = inbox.id;
      const note: Item = {
        id: itemId,
        projectId: target,
        parentId: inboxId,
        kind: 'note',
        title: named === '' ? firstLine(text) : named,
        status: 'idea',
        order: orderAfterLast(rows.filter((i) => i.parentId === inboxId).map((i) => i.order)),
        wordCount: countWords(docBody(doc, 'prose'), language),
        createdAt: now,
        updatedAt: now,
      };
      await db.items.add(note);
      await db.itemTexts.put({ itemId, projectId: target, text: docText(doc, 'prose'), updatedAt: now });
      await db.projects.update(target, { updatedAt: now });
    });
  } catch (problem) {
    await deleteItemDoc(itemId).catch(() => undefined);
    // A project made for this note goes too.
    if (projectId === null) await deleteProject(target).catch(() => undefined);
    throw problem;
  }
  return { projectId: target, itemId };
}
