import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import { CARET_BLOCK_CLASS, CaretBlock } from '@/features/editor/extensions/caretBlock';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function mount(kind: 'prose' | 'poem') {
  const host = document.createElement('div');
  document.body.append(host);
  const doc = new Y.Doc();
  const base = kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc);
  const editor = new Editor({ element: host, extensions: [...base, CaretBlock] });
  editors.push(editor);
  return editor;
}

/** The text of each top-level block that has the caret class. */
const marked = (e: Editor) =>
  [...e.view.dom.children]
    .filter((el) => el.classList.contains(CARET_BLOCK_CLASS))
    .map((el) => el.textContent);

/** Puts the caret at the end of the first block whose text contains `word`. */
function caretIn(e: Editor, word: string) {
  let at = -1;
  e.state.doc.forEach((node, offset) => {
    if (at < 0 && node.textContent.includes(word)) at = offset + node.nodeSize - 1;
  });
  e.view.dispatch(e.state.tr.setSelection(TextSelection.near(e.state.doc.resolve(at), -1)));
}

describe('the block with the caret', () => {
  test('one prose block holds the class, and it follows the caret', () => {
    const e = mount('prose');
    e.commands.setContent('<p>The rain began.</p><p>It kept on.</p><p>Then it stopped.</p>');
    caretIn(e, 'rain');
    expect(marked(e)).toEqual(['The rain began.']);
    caretIn(e, 'stopped');
    expect(marked(e)).toEqual(['Then it stopped.']);
  });

  test('typing keeps the class on the same block, and Enter moves it to the new block', () => {
    const e = mount('prose');
    e.commands.setContent('<p>The rain began.</p><p>It kept on.</p>');
    caretIn(e, 'kept');
    e.commands.insertContent(' All night.');
    expect(marked(e)).toEqual(['It kept on. All night.']);
    e.commands.splitBlock();
    e.commands.insertContent('Morning came.');
    expect(marked(e)).toEqual(['Morning came.']);
  });

  test('a deleted block hands the class to the block that now holds the caret', () => {
    const e = mount('prose');
    e.commands.setContent('<p>The rain began.</p><p>It kept on.</p>');
    caretIn(e, 'kept');
    const second = e.state.doc.child(0).nodeSize;
    e.view.dispatch(e.state.tr.delete(second, e.state.doc.content.size));
    expect(marked(e)).toEqual(['The rain began.']);
  });

  test('a poem marks the stanza that holds the caret', () => {
    const e = mount('poem');
    e.commands.setContent(
      '<div data-stanza><p>First line</p><p>Second line</p></div><div data-stanza><p>Third line</p></div>',
    );
    caretIn(e, 'Third');
    expect(marked(e)).toEqual([e.state.doc.child(1).textContent]);
  });
});
