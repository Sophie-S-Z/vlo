import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { shortcutFor, TextShortcuts } from '@/features/editor/extensions/textShortcuts';
import { cleanShortcut, setWritingPrefs, WRITING_DEFAULTS } from '@/features/editor/writingPrefs';

/* Phase 19, Task D3: text shortcuts and the typo list. */

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  setWritingPrefs({ shortcuts: [], typoFixes: true });
});

function mount(options: { poem?: boolean; typos?: boolean; curly?: boolean } = {}): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const doc = new Y.Doc();
  const editor = new Editor({
    element,
    extensions: [
      ...(options.poem ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc)),
      TextShortcuts.configure({ typos: options.typos ?? true, curly: options.curly ?? true }),
    ],
    // As the editor does: a poem runs the shortcuts only while smart punctuation is on.
    enableInputRules: options.poem ? false : true,
  });
  editors.push(editor);
  return editor;
}

/** Types text the way the browser does: through handleTextInput, then as a plain insert if nothing took it. */
function type(editor: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    const taken = editor.view.someProp('handleTextInput', (f) =>
      f(editor.view, from, to, ch, () => editor.state.tr.insertText(ch, from, to)),
    );
    if (!taken) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
  }
}

const backspace = (editor: Editor) => editor.commands.undoInputRule();

describe('the typo list', () => {
  test('a typo gets its fix after a space or a mark, in the case of the typo', () => {
    const editor = mount();
    type(editor, 'Teh boat adn teh tide. TEH END, recieve!');
    expect(editor.state.doc.textContent).toBe('The boat and the tide. THE END, receive!');
  });

  test('Backspace right after a fix puts back what the writer typed', () => {
    const editor = mount();
    type(editor, 'teh ');
    expect(editor.state.doc.textContent).toBe('the ');
    expect(backspace(editor)).toBe(true);
    expect(editor.state.doc.textContent).toBe('teh ');
  });

  test('a typo inside a longer word, a project in another language, and the switch off change nothing', () => {
    const editor = mount();
    type(editor, 'tehran steh ');
    expect(editor.state.doc.textContent).toBe('tehran steh ');
    const french = mount({ typos: false });
    type(french, 'teh ');
    expect(french.state.doc.textContent).toBe('teh ');
    setWritingPrefs({ typoFixes: false });
    const off = mount();
    type(off, 'teh ');
    expect(off.state.doc.textContent).toBe('teh ');
  });

  test('an apostrophe follows smart punctuation', () => {
    expect(shortcutFor('dont', WRITING_DEFAULTS, { typos: true, curly: true })).toBe('don’t');
    expect(shortcutFor('Dont', WRITING_DEFAULTS, { typos: true, curly: false })).toBe("Don't");
  });
});

describe('the writer’s shortcuts', () => {
  test('a shortcut runs after a space, keeps the mark that ended it, and only while it is on', () => {
    setWritingPrefs({ shortcuts: [{ from: 'mh', to: 'Marigold Harbour', on: true }] });
    const editor = mount();
    type(editor, 'At mh, the bell. (mh) amh ');
    expect(editor.state.doc.textContent).toBe('At Marigold Harbour, the bell. (Marigold Harbour) amh ');
    setWritingPrefs({ shortcuts: [{ from: 'mh', to: 'Marigold Harbour', on: false }] });
    type(editor, 'mh ');
    expect(editor.state.doc.textContent).toContain('amh mh ');
  });

  test('a poem with smart punctuation off keeps every character', () => {
    setWritingPrefs({ shortcuts: [{ from: 'mh', to: 'Marigold Harbour', on: true }] });
    const editor = mount({ poem: true });
    type(editor, 'mh teh ');
    expect(editor.state.doc.textContent).toBe('mh teh ');
  });

  test('a shortcut needs one word and a different text', () => {
    expect(cleanShortcut({ from: ' mh ', to: 'Marigold' })).toEqual({ from: 'mh', to: 'Marigold', on: true });
    expect(cleanShortcut({ from: 'm h', to: 'Marigold' })).toBeNull();
    expect(cleanShortcut({ from: 'mh', to: 'mh' })).toBeNull();
    expect(cleanShortcut({ from: 'mh', to: '' })).toBeNull();
  });
});
