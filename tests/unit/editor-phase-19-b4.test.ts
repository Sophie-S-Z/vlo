import { Editor } from '@tiptap/core';
import { initProseMirrorDoc, yUndoPluginKey } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import {
  EMPTY_QUERY,
  findMatches,
  FindReplace,
  patternError,
  replaceAll,
  setFindQuery,
  type FindQuery,
} from '@/features/editor/extensions/findReplace';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { findInProject, replaceInProject, snapshotLabel } from '@/features/editor/projectFind';
import { editorSchemas } from '@/features/import/tree';
import { createProject } from '@/features/library/projects';
import { db, type ItemKind } from '@/lib/db';
import { openItemDoc, writeItemUpdate, YFRAGMENT } from '@/lib/ydocs';
import { item, proseUpdate } from './export-fixtures';

/* Phase 19, Task B4: patterns in find and replace, and find and replace in the whole project. */

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function editorOn(html: string, ydoc = new Y.Doc()): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({ element, extensions: [...proseExtensions(ydoc), FindReplace] });
  editor.commands.setContent(html);
  editors.push(editor);
  return editor;
}

/** A new project with these items, as the binder rows. */
async function projectWith(
  rows: readonly (readonly [id: string, kind: ItemKind, title: string, parent?: string])[],
) {
  const { project } = await createProject({ title: 'Salt Year', templates: ['novel'] });
  const items = rows.map(([id, kind, title, parent]) => ({
    ...item(id, kind, title, parent ?? null),
    projectId: project.id,
  }));
  await db.items.bulkAdd(items);
  return { projectId: project.id, items };
}

const pattern = (text: string, more: Partial<FindQuery> = {}): FindQuery => ({
  ...EMPTY_QUERY,
  text,
  pattern: true,
  ...more,
});

describe('patterns', () => {
  test('a pattern with groups replaces with $1 and $2, and keeps the formats', () => {
    const editor = editorOn('<p>Smith, John met <strong>Doe, Jane</strong>.</p>');
    const query = pattern(String.raw`(\p{L}+), (?<first>\p{L}+)`);
    setFindQuery(editor, query);
    expect(replaceAll(editor, '$<first> $1 ($$5, $&)')).toBe(2);
    expect(editor.getText()).toBe('John Smith ($5, Smith, John) met Jane Doe ($5, Doe, Jane).');
    expect(editor.getHTML()).toContain('<strong>Jane Doe ($5, Doe, Jane)</strong>');
  });

  test('a pattern takes Match case and Whole word too', () => {
    const editor = editorOn('<p>Cat cat category</p>');
    const words = (q: FindQuery) => findMatches(editor.state.doc, q).map((m) => m.text);
    expect(words(pattern('cat'))).toEqual(['Cat', 'cat', 'cat']);
    expect(words(pattern('cat', { caseSensitive: true, wholeWord: true }))).toEqual(['cat']);
    expect(words(pattern('c.t|dog', { wholeWord: true }))).toEqual(['Cat', 'cat']);
  });

  test('a wrong pattern gives its error, and nothing runs', () => {
    expect(patternError(pattern('(harbour'))).toMatch(/group/i);
    expect(patternError(pattern('[a-'))).not.toBeNull();
    expect(patternError(pattern('harb(ou)?r'))).toBeNull();
    // The same text with no pattern is plain text, so it has no error.
    expect(patternError({ ...EMPTY_QUERY, text: '(harbour' })).toBeNull();
    const editor = editorOn('<p>(harbour</p>');
    expect(findMatches(editor.state.doc, pattern('(harbour'))).toEqual([]);
    expect(findMatches(editor.state.doc, { ...EMPTY_QUERY, text: '(harbour' })).toHaveLength(1);
  });
});

/** The text of a stored item. */
async function storedText(itemId: string): Promise<string> {
  const open = openItemDoc(itemId);
  await open.ready;
  const { doc } = initProseMirrorDoc(open.doc.getXmlFragment(YFRAGMENT), editorSchemas.prose);
  await open.close();
  return doc.textContent;
}

describe('the whole project', () => {
  test('replaces in 120 scenes in under 3 seconds, with a snapshot of each changed item', async () => {
    await db.open();
    try {
      const { projectId, items } = await projectWith([
        ['c1', 'chapter', 'Chapter One'],
        ...Array.from(
          { length: 120 },
          (_, i) => [`s${String(i)}`, 'scene', `Scene ${String(i + 1)}`, 'c1'] as const,
        ),
      ]);
      const scenes = items.slice(1);
      const text = (i: number) => (i % 2 === 0 ? `Mira rows to the harbour. Mira waits.` : 'The tide turns.');
      for (const [i, scene] of scenes.entries()) {
        await writeItemUpdate(scene.id, proseUpdate([text(i)]), 1);
      }
      await db.itemTexts.bulkPut(
        scenes.map((s, i) => ({ itemId: s.id, projectId, text: text(i), updatedAt: 1 })),
      );

      const query = { ...EMPTY_QUERY, text: 'Mira', wholeWord: true };
      const hits = await findInProject(projectId, query);
      expect(hits).toHaveLength(60);
      expect(hits[0]?.item.title).toBe('Scene 1');
      expect(hits[0]?.count).toBe(2);
      expect(hits[0]?.lines[0]).toEqual({
        before: '',
        match: 'Mira',
        after: ' rows to the harbour. Mira waits.',
        block: 0,
      });

      const started = performance.now();
      const done = await replaceInProject(hits, query, 'Ines', undefined, null);
      expect(performance.now() - started).toBeLessThan(3000);
      expect(done).toEqual({ items: 60, matches: 120 });
      expect(await storedText('s0')).toBe('Ines rows to the harbour. Ines waits.');
      expect(await storedText('s1')).toBe('The tide turns.');
      const snapshots = await db.snapshots.where('projectId').equals(projectId).toArray();
      expect(snapshots).toHaveLength(60);
      expect(new Set(snapshots.map((s) => s.label))).toEqual(new Set([snapshotLabel(query)]));
      // The plain-text copy changes too, so the next search finds the new words.
      expect(await findInProject(projectId, query)).toEqual([]);
    } finally {
      await db.delete();
    }
  }, 20_000);

  test('the open item changes in its editor, so one Undo puts it back', async () => {
    await db.open();
    try {
      const { projectId } = await projectWith([['open', 'scene', 'Open scene']]);
      await db.itemTexts.put({ itemId: 'open', projectId, text: 'Mira sings.', updatedAt: 1 });
      const editor = editorOn('<p>Mira sings.</p>');
      yUndoPluginKey.getState(editor.state)?.undoManager.stopCapturing();
      const query = { ...EMPTY_QUERY, text: 'Mira' };
      const hits = await findInProject(projectId, query);
      const done = await replaceInProject(hits, query, 'Ines', undefined, { editor, itemId: 'open' });
      expect(done).toEqual({ items: 1, matches: 1 });
      expect(editor.getText()).toBe('Ines sings.');
      expect(await db.snapshots.where('itemId').equals('open').count()).toBe(1);
      editor.commands.undo();
      expect(editor.getText()).toBe('Mira sings.');
    } finally {
      await db.delete();
    }
  });
});
