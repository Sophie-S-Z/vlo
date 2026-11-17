import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { yUndoPluginKey } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';

/* Phase 19, Task B3: move blocks with Alt-Shift-Up and Alt-Shift-Down. */

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function prose(html: string): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({ element, extensions: proseExtensions(new Y.Doc()) });
  editor.commands.setContent(html);
  editors.push(editor);
  return editor;
}

const stanza = (...lines: string[]) => ({
  type: 'stanza',
  content: lines.map((text) => ({ type: 'poemLine', content: [{ type: 'text', text }] })),
});

function poem(content: unknown[]): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({ element, extensions: poemExtensions(new Y.Doc(), { tabSpaces: 4 }) });
  editor.commands.setContent({ type: 'doc', content } as never);
  editors.push(editor);
  return editor;
}

/** The text of each top-level block. */
function texts(editor: Editor): string[] {
  const out: string[] = [];
  editor.state.doc.forEach((node) => out.push(node.textContent));
  return out;
}

/** Presses the keys as a keyboard does: the editor's key handlers get the key down. */
function press(editor: Editor, key: string, mods: { alt?: boolean; shift?: boolean; mod?: boolean }): void {
  const event = new KeyboardEvent('keydown', {
    key,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
    ctrlKey: mods.mod ?? false,
    bubbles: true,
    cancelable: true,
  });
  editor.view.someProp('handleKeyDown', (handle) => handle(editor.view, event));
}
const UP = { alt: true, shift: true };

/** Puts the caret in the text, at the start of `words`. */
function caretAt(editor: Editor, words: string): void {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(words)) at = pos + node.text.indexOf(words);
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
}

describe('move blocks', () => {
  test('the keys move the paragraph at the caret, and the caret goes with it', () => {
    const editor = prose('<p>One</p><p>Two</p><p>Three</p>');
    caretAt(editor, 'Two');
    press(editor, 'ArrowUp', UP);
    expect(texts(editor)).toEqual(['Two', 'One', 'Three']);
    expect(editor.state.selection.$head.parent.textContent).toBe('Two');
    // The first block goes no higher.
    expect(editor.commands.moveBlocks(-1)).toBe(false);
    press(editor, 'ArrowDown', UP);
    press(editor, 'ArrowDown', UP);
    expect(texts(editor)).toEqual(['One', 'Three', 'Two']);
    expect(editor.commands.moveBlocks(1)).toBe(false);
  });

  test('the selected blocks move together, and one undo puts them back', () => {
    const editor = prose('<p>One</p><h2>Two</h2><p>Three</p><p>Four</p>');
    const { doc } = editor.state;
    const from = doc.child(0).nodeSize + 2;
    const to = from + doc.child(1).nodeSize + 2;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, from, to)));
    // The setup and the move are two steps of undo.
    yUndoPluginKey.getState(editor.state)?.undoManager.stopCapturing();
    editor.commands.moveBlocks(1);
    expect(texts(editor)).toEqual(['One', 'Four', 'Two', 'Three']);
    expect(editor.state.doc.child(2).type.name).toBe('heading');
    editor.commands.undo();
    expect(texts(editor)).toEqual(['One', 'Two', 'Three', 'Four']);
  });

  test('a list item moves in its list, with the list inside it', () => {
    const editor = prose('<ul><li><p>Rope</p><ul><li><p>Long</p></li></ul></li><li><p>Lantern</p></li></ul>');
    caretAt(editor, 'Lantern');
    editor.commands.moveBlocks(-1);
    const list = editor.state.doc.child(0);
    expect(list.childCount).toBe(2);
    expect(list.child(0).textContent).toBe('Lantern');
    expect(list.child(1).textContent).toBe('RopeLong');
  });

  test('a footnote number follows its moved paragraph', () => {
    const note = (text: string) =>
      `<sup data-footnote="" data-note='${JSON.stringify([{ type: 'text', text }])}'></sup>`;
    const editor = prose(`<p>First${note('A')}</p><p>Second${note('B')}</p>`);
    caretAt(editor, 'Second');
    editor.commands.moveBlocks(-1);
    const refs = [...editor.view.dom.querySelectorAll('sup[data-footnote]')];
    expect(refs.map((ref) => ref.getAttribute('data-n'))).toEqual(['1', '2']);
    expect(refs.map((ref) => ref.closest('p')?.textContent)).toEqual(['Second', 'First']);
  });

  test('in a poem the keys move a line in its stanza, and Mod moves the stanza', () => {
    const editor = poem([stanza('a', 'b', 'c'), stanza('d', 'e')]);
    caretAt(editor, 'c');
    press(editor, 'ArrowUp', UP);
    expect(texts(editor)).toEqual(['acb', 'de']);
    press(editor, 'ArrowDown', { ...UP, mod: true });
    expect(texts(editor)).toEqual(['de', 'acb']);
    expect(editor.state.selection.$head.parent.textContent).toBe('c');
  });
});
