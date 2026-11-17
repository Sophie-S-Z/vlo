import type { Editor } from '@tiptap/core';
import { Transform } from '@tiptap/pm/transform';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { flattenTree } from '@/features/binder/tree';
import { projectDef, type EditorForm } from '@/features/library/templates';
import { takeSnapshot } from '@/features/snapshots/snapshots';
import { db, type Item } from '@/lib/db';
import {
  findMatches,
  queryPattern,
  replaceAll,
  replaceMatches,
  type FindQuery,
} from './extensions/findReplace';
import { withoutNotes } from './format/notes';
import { docText } from './itemText';
import { changeStoredDoc } from './storedDoc';

/*
 * Find and replace in the whole project (Phase 19, Task B4). The list reads the plain-text copy of each
 * item, so it comes at once. Replace all changes the stored document of each item, after a snapshot of it,
 * and each tab that has the item open gets the change. The item in this editor changes in the editor, so
 * Undo there puts it back.
 */

/** The matches of one item, in binder order, with a line of context for the first few. */
export interface ProjectHit {
  item: Item;
  form: EditorForm;
  count: number;
  lines: readonly { before: string; match: string; after: string; block: number }[];
}

/** The lines of context for each item. */
const MAX_LINES = 3;
/** The characters of context on each side of a match. */
const CONTEXT = 40;
/** Items that change at the same time. */
const BATCH = 8;

export const snapshotLabel = (query: FindQuery) => `Before replacing “${query.text}”`;

/** The item in this editor. */
export interface OpenText {
  editor: Editor;
  itemId: string;
}

/**
 * The matches of the query in each item of the project that holds text. The item in this editor gives its
 * text as it is now, because its plain-text copy waits for a pause in typing.
 */
export async function findInProject(
  projectId: string,
  query: FindQuery,
  open: OpenText | null = null,
): Promise<ProjectHit[]> {
  const pattern = queryPattern(query);
  if (!pattern) return [];
  const [project, items, texts] = await Promise.all([
    db.projects.get(projectId),
    db.items.where('projectId').equals(projectId).toArray(),
    db.itemTexts.where('projectId').equals(projectId).toArray(),
  ]);
  if (!project) return [];
  const textOf = new Map(texts.map((t) => [t.itemId, t.text]));
  const def = projectDef(project);
  const hits: ProjectHit[] = [];
  for (const { item } of flattenTree(items)) {
    const form = def.editorKind(item.kind);
    if (!form) continue;
    // A match stays in one block, as in the editor, and the notes at the end are not the writing.
    const source =
      open?.itemId === item.id && !open.editor.isDestroyed
        ? docText(open.editor.state.doc, form)
        : (textOf.get(item.id) ?? '');
    const blocks = withoutNotes(source).split(form === 'prose' ? '\n\n' : '\n');
    let count = 0;
    const lines: ProjectHit['lines'][number][] = [];
    blocks.forEach((text, block) => {
      for (const line of text.split('\n')) {
        for (const found of line.matchAll(pattern)) {
          if (found[0] === '') continue;
          count += 1;
          if (lines.length >= MAX_LINES) continue;
          const end = found.index + found[0].length;
          lines.push({
            before: line.slice(Math.max(0, found.index - CONTEXT), found.index),
            match: found[0],
            after: line.slice(end, end + CONTEXT),
            block,
          });
        }
      }
    });
    if (count > 0) hits.push({ item, form, count, lines });
  }
  return hits;
}

/** The Yjs document of an editor. */
function ydocOf(editor: Editor): Y.Doc | null {
  return (ySyncPluginKey.getState(editor.state) as { doc?: Y.Doc } | undefined)?.doc ?? null;
}

/**
 * Replaces every match in the items, after a snapshot of each item that changes. Returns the number of
 * items and of matches that changed. `open` is the item in this editor.
 */
export async function replaceInProject(
  hits: readonly ProjectHit[],
  query: FindQuery,
  replacement: string,
  language: string | undefined,
  open: OpenText | null,
): Promise<{ items: number; matches: number }> {
  let items = 0;
  let matches = 0;
  const one = async ({ item, form }: ProjectHit) => {
    if (open?.itemId === item.id) {
      const ydoc = ydocOf(open.editor);
      if (open.editor.isDestroyed || !ydoc) return;
      await takeSnapshot(item, ydoc, docText(open.editor.state.doc, form), snapshotLabel(query));
      const count = replaceAll(open.editor, replacement, query);
      if (count > 0) [items, matches] = [items + 1, matches + count];
      return;
    }
    let count = 0;
    const changed = await changeStoredDoc(
      { item, form, ...(language ? { language } : {}) },
      (doc) => {
        const found = findMatches(doc, query);
        count = found.length;
        const tr = new Transform(doc);
        replaceMatches(tr, found, replacement, query);
        return tr;
      },
      snapshotLabel(query),
    );
    if (changed) [items, matches] = [items + 1, matches + count];
  };
  for (let i = 0; i < hits.length; i += BATCH) await Promise.all(hits.slice(i, i + BATCH).map(one));
  return { items, matches };
}
