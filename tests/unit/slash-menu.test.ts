import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { commandsFor, matchesCommand, type EditorCommand } from '@/features/editor/commands/registry';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { SlashMenu, slashKey } from '@/features/editor/extensions/slashMenu';

let editor: Editor;
let chosen: EditorCommand[];

beforeEach(() => {
  chosen = [];
  const host = document.createElement('div');
  document.body.append(host);
  const tools = commandsFor('prose').filter((c) => c.slash);
  editor = new Editor({
    element: host,
    extensions: [
      ...proseExtensions(new Y.Doc()),
      SlashMenu.configure({
        listId: 'tools',
        items: (q) => tools.filter((c) => matchesCommand(c, q)),
        onChoose: (cmd, e) => {
          chosen.push(cmd);
          if (cmd.kind === 'run') cmd.run(e);
        },
      }),
    ],
  });
  editor.commands.setContent('<p>Salt</p>');
});
afterEach(() => {
  editor.destroy();
  document.body.replaceChildren();
});

/** Types text the way the browser does: through handleTextInput, then as a plain insert if nothing took it. */
function type(text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    const taken = editor.view.someProp('handleTextInput', (f) =>
      f(editor.view, from, to, ch, () => editor.state.tr.insertText(ch, from, to)),
    );
    if (!taken) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
  }
}

function key(name: string) {
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}

const menu = () => slashKey.getState(editor.state);
const text = () => editor.state.doc.textContent;

test('"/" at the start of a line opens the menu, and letters filter it', () => {
  editor.commands.setTextSelection(1);
  type('/');
  expect(menu()?.from).toBe(1);
  expect(editor.view.dom.getAttribute('aria-controls')).toBe('tools');
  expect(editor.view.dom.getAttribute('aria-activedescendant')).toBe('tools-0');
  type('quo');
  expect(menu()?.matches.map((c) => c.id)).toEqual(['quote']);
});

test('"/" inside a word stays a plain slash, and "/" after a space opens the menu', () => {
  editor.commands.setTextSelection(5);
  type('/');
  expect(menu()?.from).toBeNull();
  type(' /');
  expect(menu()?.from).toBe(7);
});

test('arrow keys move and wrap, and Enter runs the tool and removes "/query"', () => {
  editor.commands.setTextSelection(5);
  type(' /head');
  key('ArrowDown');
  expect(menu()?.index).toBe(1);
  key('ArrowDown');
  expect(menu()?.index).toBe(0);
  key('ArrowUp');
  expect(menu()?.matches[menu()?.index ?? 0]?.id).toBe('heading-3');
  key('Enter');
  expect(chosen.map((c) => c.id)).toEqual(['heading-3']);
  expect(text()).toBe('Salt ');
  expect(editor.isActive('heading', { level: 3 })).toBe(true);
  expect(menu()?.from).toBeNull();
});

test('Escape closes the menu and keeps the slash', () => {
  editor.commands.setTextSelection(5);
  type(' /bo');
  key('Escape');
  expect(menu()?.from).toBeNull();
  expect(text()).toBe('Salt /bo');
  expect(editor.view.dom.hasAttribute('aria-activedescendant')).toBe(false);
});

test('a space after a query that finds nothing closes the menu, so prose goes on', () => {
  editor.commands.setTextSelection(5);
  type(' /qzx');
  expect(menu()?.matches).toEqual([]);
  type(' ');
  expect(menu()?.from).toBeNull();
  key('Enter');
  expect(chosen).toEqual([]);
});

test('deleting the slash or moving the caret before it closes the menu', () => {
  editor.commands.setTextSelection(5);
  type(' /b');
  editor.commands.setTextSelection(3);
  expect(menu()?.from).toBeNull();
  editor.commands.setTextSelection(9);
  type(' /');
  expect(menu()?.from).not.toBeNull();
  editor.commands.deleteRange({ from: menu()?.from ?? 0, to: (menu()?.from ?? 0) + 1 });
  expect(menu()?.from).toBeNull();
});
