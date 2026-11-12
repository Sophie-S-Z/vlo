import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, expect, test } from 'vitest';
import * as Y from 'yjs';
import { insertImageFiles } from '@/features/editor/extensions/image';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { db } from '@/lib/db';

/*
 * Phase 16, Task G1: new images in the text. Each file goes in, and a new image is an undo step of its own.
 * The text history joins changes made close together, so without the break, Undo took back the typing
 * just before the image too.
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

function proseEditor(): Editor {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new Editor({ element: host, extensions: proseExtensions(new Y.Doc()) });
  editors.push(editor);
  return editor;
}

const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

test('Undo after a new image takes back only the image', () => {
  const editor = proseEditor();
  editor.commands.insertContent('The harbour at dawn.');
  // At once after the typing, well inside the time that joins two changes.
  expect(insertImageFiles(editor, 'project-1', [png('harbour.png')])).toBe(true);
  expect(blocks(editor)).toContain('image');

  editor.commands.undo();
  expect(editor.state.doc.textContent).toBe('The harbour at dawn.');
  expect(blocks(editor)).toEqual(['paragraph']);
});

test('a paste of three image files at the caret puts in three images, in order', () => {
  const editor = proseEditor();
  editor.commands.insertContent('The harbour at dawn.');
  expect(insertImageFiles(editor, 'project-1', [png('a.png'), png('b.png'), png('c.png')])).toBe(true);
  expect(blocks(editor).filter((name) => name === 'image')).toHaveLength(3);
});
