import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, expect, test } from 'vitest';
import { duplicateOf } from '@/features/editor/BlockHandle';
import { proseExtensions } from '@/features/editor/extensions/prose';

/* Phase 19, Task B3: Duplicate in the block menu makes a block that names no place of its own. */

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
});

test('a copy has no comment, a new id for each change, and no heading anchor', () => {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: proseExtensions(new Y.Doc()),
  });
  editors.push(editor);
  const { schema } = editor;
  const comment = schema.marks.comment?.create({ id: 'c1' });
  const change = schema.marks.suggestion?.create({ id: 'k1', kind: 'insert' });
  if (!comment || !change) throw new Error('The prose schema has no comment or suggestion mark.');
  const heading = schema.nodes.heading?.create({ level: 2, anchor: 'h-ledger' }, [
    schema.text('The ', [comment]),
    schema.text('ledger', [comment, change]),
    schema.text(' book', [change]),
  ]);
  if (!heading) throw new Error('The prose schema has no heading.');

  const copy = duplicateOf(heading);
  expect(copy.textContent).toBe('The ledger book');
  expect(copy.attrs.anchor).toBeNull();
  const marks = [] as { name: string; id: unknown }[];
  copy.descendants((node) => {
    for (const mark of node.marks) marks.push({ name: mark.type.name, id: mark.attrs.id });
  });
  expect(marks.some((m) => m.name === 'comment')).toBe(false);
  const ids = new Set(marks.filter((m) => m.name === 'suggestion').map((m) => m.id));
  // One change stays one change, with a new id.
  expect(ids.size).toBe(1);
  expect(ids.has('k1')).toBe(false);
  // The original keeps its marks and anchor.
  expect(heading.attrs.anchor).toBe('h-ledger');
});
