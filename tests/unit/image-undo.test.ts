import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, expect, test } from 'vitest';
import * as Y from 'yjs';
import { insertImageFiles } from '@/features/editor/extensions/image';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { db } from '@/lib/db';

/*
 * Phase 16, Task G1: a new image is an undo step of its own. The text history joins changes made close
 * together, so without the break, Undo took back the typing just before the image too.
 */

const editors: Editor[] = [];
beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  await db.delete();
});

/** The top-level blocks, such as ["paragraph", "image"]. */
function blocks(editor: Editor): string[] {
  const names: string[] = [];
  editor.state.doc.forEach((node) => names.push(node.type.name));
  return names;
}

test('Undo after a new image takes back only the image', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new Editor({ element: host, extensions: proseExtensions(new Y.Doc()) });
  editors.push(editor);
  editor.commands.insertContent('The harbour at dawn.');
  const file = new File([new Uint8Array([1, 2, 3])], 'harbour.png', { type: 'image/png' });
  // At once after the typing, well inside the time that joins two changes.
  expect(insertImageFiles(editor, 'project-1', [file])).toBe(true);
  expect(blocks(editor)).toContain('image');

  editor.commands.undo();
  expect(editor.state.doc.textContent).toBe('The harbour at dawn.');
  expect(blocks(editor)).toEqual(['paragraph']);
});
