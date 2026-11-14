import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { yUndoPluginKey } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { changesOf } from '@/features/editor/extensions/suggestion';
import { docBody, docText } from '@/features/editor/itemText';
import { resetTracking, setProjectTracking } from '@/features/editor/trackingStore';
import { itemBlocks, noteCounter, updateToJson } from '@/features/export/read';
import { collectBackup } from '@/features/backup/backup';
import { readBackup, writeBackup } from '@/features/backup/file';
import { createProject, updateProjectSettings } from '@/features/library/projects';
import { db } from '@/lib/db';
import { YFRAGMENT } from '@/lib/ydocs';

/* Plan Task I1 (roadmap F44, decisions R1 and R2): Track changes and revision passes. */

const editors: Editor[] = [];
beforeEach(() => {
  setProjectTracking('p1', { on: true, pass: 1 });
});
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  resetTracking();
});

function mount(kind: 'prose' | 'poem' = 'prose', doc = new Y.Doc()) {
  const host = document.createElement('div');
  document.body.append(host);
  const extensions = kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc);
  const editor = new Editor({ element: host, extensions });
  editors.push(editor);
  return editor;
}

/** Starts with untracked text, as text that the writer wrote before tracking was on. */
function withText(text: string, kind: 'prose' | 'poem' = 'prose') {
  setProjectTracking('p1', { on: false, pass: 1 });
  const editor = mount(kind);
  editor.commands.insertContent(text);
  setProjectTracking('p1', { on: true, pass: 1 });
  return editor;
}

const caret = (editor: Editor, offset: number) => {
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, offset + 1)));
};
const type = (editor: Editor, text: string) => {
  editor.view.dispatch(editor.state.tr.insertText(text));
};
/** Backspace: removes the character before the caret. */
const backspace = (editor: Editor) => {
  const at = editor.state.selection.from;
  editor.view.dispatch(editor.state.tr.delete(at - 1, at));
};
/** The Delete key: removes the character after the caret. */
const forwardDelete = (editor: Editor) => {
  const at = editor.state.selection.from;
  editor.view.dispatch(editor.state.tr.delete(at, at + 1));
};
const changes = (editor: Editor) =>
  changesOf(editor.state).map(({ kind, text, pass }) => ({ kind, text, pass }));

describe('track changes', () => {
  test('typed words get an insert mark of the current pass, as one change', () => {
    const editor = withText('Mira ran.');
    caret(editor, 4);
    type(editor, ' f');
    type(editor, 'ast');
    expect(changes(editor)).toEqual([{ kind: 'insert', text: ' fast', pass: 1 }]);
    expect(editor.getText()).toBe('Mira fast ran.');
  });

  test('Backspace strikes the old words and moves the caret before them', () => {
    const editor = withText('Mira ran.');
    caret(editor, 8);
    backspace(editor);
    backspace(editor);
    backspace(editor);
    expect(editor.getText()).toBe('Mira ran.');
    expect(changes(editor)).toEqual([{ kind: 'delete', text: 'ran', pass: 1 }]);
    expect(editor.state.selection.from).toBe(6);
    // Backspace again strikes the space before the struck words, in the same change.
    backspace(editor);
    expect(changes(editor)).toEqual([{ kind: 'delete', text: ' ran', pass: 1 }]);
  });

  test('the Delete key strikes the words after the caret and moves past them', () => {
    const editor = withText('Mira ran.');
    caret(editor, 5);
    forwardDelete(editor);
    forwardDelete(editor);
    expect(changes(editor)).toEqual([{ kind: 'delete', text: 'ra', pass: 1 }]);
    expect(editor.state.selection.from).toBe(8);
  });

  test("Backspace over the writer's own waiting insert removes it for real", () => {
    const editor = withText('Mira ran.');
    caret(editor, 4);
    type(editor, ' fast');
    backspace(editor);
    backspace(editor);
    expect(editor.getText()).toBe('Mira fa ran.');
    expect(changes(editor)).toEqual([{ kind: 'insert', text: ' fa', pass: 1 }]);
  });

  test('Clear formatting keeps each tracked change for review', () => {
    const editor = withText('Mira ran.');
    caret(editor, 4);
    type(editor, ' fast');
    caret(editor, 13);
    backspace(editor);
    editor.commands.selectAll();
    editor.commands.clearFormatting();
    expect(changes(editor)).toEqual([
      { kind: 'insert', text: ' fast', pass: 1 },
      { kind: 'delete', text: 'n', pass: 1 },
    ]);
  });

  test('typing over selected words strikes them and inserts the new words after them', () => {
    const editor = withText('Mira ran.');
    const { doc } = editor.state;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, 6, 9)));
    type(editor, 'fled');
    expect(editor.getText()).toBe('Mira ranfled.');
    expect(changes(editor)).toEqual([
      { kind: 'delete', text: 'ran', pass: 1 },
      { kind: 'insert', text: 'fled', pass: 1 },
    ]);
  });

  test('Undo takes back a tracked delete and its mark together', () => {
    const editor = withText('Mira ran.');
    // The typing above is its own undo step, as it is after a pause.
    (yUndoPluginKey.getState(editor.state) as { undoManager: Y.UndoManager }).undoManager.stopCapturing();
    caret(editor, 8);
    backspace(editor);
    expect(changes(editor)).toHaveLength(1);
    editor.commands.undo();
    expect(editor.getText()).toBe('Mira ran.');
    expect(changes(editor)).toEqual([]);
  });

  test('a paste gets an insert mark and keeps its own marks', () => {
    // jsdom has no ClipboardEvent. A paste reads only its type here.
    if (typeof ClipboardEvent === 'undefined')
      Object.assign(globalThis, { ClipboardEvent: class extends Event {} });
    const editor = withText('Mira ran.');
    caret(editor, 8);
    editor.view.pasteHTML('<p>, <strong>very</strong> fast</p>');
    expect(editor.getText()).toBe('Mira ran, very fast.');
    expect(changes(editor)).toEqual([{ kind: 'insert', text: ', very fast', pass: 1 }]);
    expect(editor.getHTML()).toContain('<strong>');
  });

  test('Enter splits the paragraph at once, with no mark', () => {
    const editor = withText('Mira ran.');
    caret(editor, 4);
    editor.commands.splitBlock();
    expect(editor.state.doc.childCount).toBe(2);
    expect(changes(editor)).toEqual([]);
  });

  test('a change that comes from another tab through Yjs gets no mark', () => {
    const ydoc = new Y.Doc();
    setProjectTracking('p1', { on: false, pass: 1 });
    const editor = mount('prose', ydoc);
    editor.commands.insertContent('Mira ran.');
    setProjectTracking('p1', { on: true, pass: 1 });
    const paragraph = ydoc.getXmlFragment(YFRAGMENT).get(0) as Y.XmlElement;
    (paragraph.get(0) as Y.XmlText).insert(0, 'So ');
    expect(editor.getText()).toBe('So Mira ran.');
    expect(changes(editor)).toEqual([]);
  });

  test('nothing gets a mark while tracking is off', () => {
    const editor = withText('Mira ran.');
    setProjectTracking('p1', { on: false, pass: 1 });
    caret(editor, 8);
    backspace(editor);
    type(editor, 'k');
    expect(editor.getText()).toBe('Mira rak.');
    expect(changes(editor)).toEqual([]);
  });

  test('accept and reject settle each kind of change', () => {
    const editor = withText('One two three.');
    caret(editor, 7);
    backspace(editor);
    backspace(editor);
    backspace(editor);
    caret(editor, 13);
    type(editor, ' four');
    const [del, ins] = changesOf(editor.state);
    expect(editor.commands.acceptChange(del?.id ?? '')).toBe(true);
    expect(editor.getText()).toBe('One  three four.');
    expect(editor.commands.rejectChange(ins?.id ?? '')).toBe(true);
    expect(editor.getText()).toBe('One  three.');
    expect(changesOf(editor.state)).toEqual([]);
    expect(editor.commands.acceptChange('missing')).toBe(false);
  });

  test('accept of an insert and reject of a delete keep the words and take the mark off', () => {
    const editor = withText('One two.');
    caret(editor, 7);
    backspace(editor);
    caret(editor, 3);
    type(editor, '!');
    editor.commands.acceptAll();
    expect(editor.getText()).toBe('One! tw.');
    const editor2 = withText('One two.');
    caret(editor2, 7);
    backspace(editor2);
    editor2.commands.rejectAll();
    expect(editor2.getText()).toBe('One two.');
    expect(changesOf(editor2.state)).toEqual([]);
  });

  test('accept of a pass leaves the other passes waiting', () => {
    const editor = withText('One two.');
    caret(editor, 3);
    type(editor, ' A');
    setProjectTracking('p1', { on: true, pass: 2 });
    caret(editor, 10);
    type(editor, ' B');
    editor.commands.acceptAll(2);
    expect(changes(editor)).toEqual([{ kind: 'insert', text: ' A', pass: 1 }]);
  });

  test('an accepted delete of a whole poem line leaves no empty line', () => {
    const editor = withText('', 'poem');
    setProjectTracking('p1', { on: false, pass: 1 });
    editor.commands.insertContent('one');
    editor.commands.splitBlock();
    editor.commands.insertContent('two');
    setProjectTracking('p1', { on: true, pass: 1 });
    const { doc } = editor.state;
    const end = doc.content.size - 2;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, end - 3, end)));
    editor.view.dispatch(editor.state.tr.deleteSelection());
    editor.commands.acceptAll();
    expect(docBody(editor.state.doc, 'poem').trim()).toBe('one');
  });

  test('counts, plain text and exports take the text as accepted', () => {
    const ydoc = new Y.Doc();
    setProjectTracking('p1', { on: false, pass: 1 });
    const editor = mount('prose', ydoc);
    editor.commands.insertContent('Mira ran home.');
    setProjectTracking('p1', { on: true, pass: 1 });
    caret(editor, 8);
    backspace(editor);
    backspace(editor);
    backspace(editor);
    expect(editor.getText()).toBe('Mira ran home.');
    expect(docText(editor.state.doc, 'prose')).toBe('Mira  home.');
    const blocks = itemBlocks(updateToJson(Y.encodeStateAsUpdate(ydoc)), 'prose', noteCounter());
    expect(JSON.stringify(blocks)).not.toContain('ran');
  });

  test('a document round trip through Yjs keeps every mark', () => {
    const ydoc = new Y.Doc();
    const editor = mount('prose', ydoc);
    setProjectTracking('p1', { on: false, pass: 1 });
    editor.commands.insertContent('Mira ran.');
    setProjectTracking('p1', { on: true, pass: 3 });
    caret(editor, 4);
    type(editor, ' fast');
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(ydoc));
    const again = mount('prose', copy);
    expect(changesOf(again.state)).toMatchObject([{ kind: 'insert', text: ' fast', pass: 3, by: '' }]);
  });
});

test('a backup keeps the Track changes setting, and a damaged one fails', async () => {
  await db.open();
  try {
    const { project } = await createProject({ title: 'Debt', templates: ['novel'] });
    await updateProjectSettings(project.id, { tracking: { on: true, pass: 4 } });
    const backup = await readBackup(await writeBackup(await collectBackup(project.id, { music: false })));
    expect(backup.project.settings.tracking).toEqual({ on: true, pass: 4 });
    for (const tracking of [{ on: true, pass: 6 }, { on: 'yes', pass: 1 }, null]) {
      const bad = await collectBackup(project.id, { music: false });
      (bad.project.settings as { tracking: unknown }).tracking = tracking;
      await expect(readBackup(await writeBackup(bad))).rejects.toThrow('damaged');
    }
  } finally {
    await db.delete();
  }
});
