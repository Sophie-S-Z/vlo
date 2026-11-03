import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import * as Y from 'yjs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  Footnote,
  footnotesOf,
  leaveFootnote,
  selectedFootnote,
} from '@/features/editor/extensions/footnote';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { MAX_NOTE_LENGTH, notePreview, notesBlock, parseNote } from '@/features/editor/format/notes';
import { docBody, docNotes, docText } from '@/features/editor/itemText';
import { poemDataFromDoc, poemDataToJSON } from '@/features/editor/poemText';

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function mount(kind: 'prose' | 'poem', doc = new Y.Doc(), onOpen = vi.fn()) {
  const host = document.createElement('div');
  document.body.append(host);
  const base = kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc);
  // The test's onOpen replaces the panel opener, so the tests can see when the note editor would open.
  const extensions = [...base.filter((e) => e.name !== 'footnote'), Footnote.configure({ onOpen })];
  const editor = new Editor({ element: host, extensions });
  editors.push(editor);
  return editor;
}

/** The notes as plain text, in their numbered order. */
const notes = (e: Editor) =>
  footnotesOf(e.state).map((f) => `${String(f.number)}:${f.content.map((r) => r.text).join('')}`);

/** The numbers drawn on the references, in DOM order. */
const drawn = (e: Editor) =>
  [...e.view.dom.querySelectorAll<HTMLElement>('sup[data-footnote]')].map((el) => el.dataset.n);

/** Puts the caret after the first match of `word`, and inserts a footnote with `note` there. */
function noteAfter(e: Editor, word: string, note: string) {
  let at = -1;
  e.state.doc.descendants((node, pos) => {
    if (at >= 0 || !node.isText) return;
    const i = node.text?.indexOf(word) ?? -1;
    if (i >= 0) at = pos + i + word.length;
  });
  if (at < 0) throw new Error(`No "${word}".`);
  e.commands.setTextSelection(at);
  expect(e.commands.insertFootnote([{ type: 'text', text: note }])).toBe(true);
}

function clipboard(data: Record<string, string>): ClipboardEvent {
  return Object.assign(new Event('paste', { cancelable: true }), {
    clipboardData: { getData: (type: string) => data[type] ?? '' },
  }) as unknown as ClipboardEvent;
}

describe('note data', () => {
  test('a note keeps only text runs and known styles, as one line, within the length limit', () => {
    expect(parseNote('Ibid.\nPage 4')).toEqual([{ type: 'text', text: 'Ibid. Page 4' }]);
    expect(
      parseNote([
        { type: 'text', text: 'Bold', marks: [{ type: 'italic' }, { type: 'bold' }, { type: 'bold' }] },
        { type: 'image', src: 'x' },
        { type: 'text', text: '<script>', marks: [{ type: 'link', attrs: { href: 'javascript:x' } }] },
        'loose',
        { type: 'text', text: '' },
      ]),
    ).toEqual([
      { type: 'text', text: 'Bold', marks: [{ type: 'bold' }, { type: 'italic' }] },
      { type: 'text', text: '<script>' },
    ]);
    expect(parseNote({ text: 'not a list' })).toEqual([]);
    expect(parseNote(null)).toEqual([]);
    const long = parseNote([
      { type: 'text', text: 'a'.repeat(MAX_NOTE_LENGTH - 2) },
      { type: 'text', text: 'bcdef' },
    ]);
    expect(long.map((r) => r.text).join('')).toHaveLength(MAX_NOTE_LENGTH);
  });

  test('the preview is short and the notes block lists every note', () => {
    expect(notePreview(parseNote('x'.repeat(100)), 10)).toBe('xxxxxxxxx…');
    expect(notesBlock([])).toBe('');
    expect(notesBlock([parseNote('First.'), parseNote('Second.')])).toBe('Notes\n1. First.\n2. Second.');
  });
});

describe('footnotes in prose', () => {
  test('numbers follow document order after each insert, and the reference is selected', () => {
    const e = mount('prose');
    e.commands.setContent('<p>The ledger was wet. The ink ran.</p>');
    noteAfter(e, 'ran', 'Second note.');
    expect(selectedFootnote(e.state)).not.toBeNull();
    noteAfter(e, 'wet', 'First note.');
    expect(notes(e)).toEqual(['1:First note.', '2:Second note.']);
    expect(drawn(e)).toEqual(['1', '2']);
    const ref = e.view.dom.querySelector('sup[data-footnote]');
    expect(ref?.getAttribute('title')).toBe('Footnote 1: First note.');
    expect(ref?.textContent).toBe('');
  });

  test('a cut and a paste move the note and renumber both references (Review Focus 2)', () => {
    const e = mount('prose');
    e.commands.setContent('<p>Alpha beta.</p><p>Gamma delta.</p>');
    noteAfter(e, 'Alpha', 'On alpha.');
    noteAfter(e, 'delta', 'On delta.');
    expect(notes(e)).toEqual(['1:On alpha.', '2:On delta.']);

    // Cut the second paragraph with its footnote, then paste it before the first.
    const second = e.state.doc.child(0).nodeSize;
    const slice = e.state.doc.slice(second, e.state.doc.content.size);
    const { dom, text } = e.view.serializeForClipboard(slice);
    e.commands.deleteRange({ from: second, to: e.state.doc.content.size });
    expect(notes(e)).toEqual(['1:On alpha.']);
    e.commands.setTextSelection(1);
    e.view.pasteHTML(dom.innerHTML, clipboard({ 'text/html': dom.innerHTML, 'text/plain': text }));

    expect(notes(e)).toEqual(['1:On delta.', '2:On alpha.']);
    expect(drawn(e)).toEqual(['1', '2']);
  });

  test('undo takes a new footnote away and the later numbers go back', () => {
    // The text loads before the editor exists, so undo has only the new footnote to take away.
    const source = new Y.Doc();
    const first = mount('prose', source);
    first.commands.setContent('<p>One two three.</p>');
    noteAfter(first, 'three', 'Old note.');
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(source));
    const e = mount('prose', doc);
    expect(notes(e)).toEqual(['1:Old note.']);

    noteAfter(e, 'One', 'New note.');
    expect(notes(e)).toEqual(['1:New note.', '2:Old note.']);
    e.commands.undo();
    expect(notes(e)).toEqual(['1:Old note.']);
    expect(drawn(e)).toEqual(['1']);
  });

  test('a change from another tab renumbers the references here', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.on('update', (update: Uint8Array) => {
      Y.applyUpdate(b, update);
    });
    const here = mount('prose', b);
    const there = mount('prose', a);
    there.commands.setContent('<p>Tide and salt.</p>');
    noteAfter(there, 'salt', 'Salt note.');
    expect(notes(here)).toEqual(['1:Salt note.']);
    noteAfter(there, 'Tide', 'Tide note.');
    expect(notes(here)).toEqual(['1:Tide note.', '2:Salt note.']);
    expect(drawn(here)).toEqual(['1', '2']);
  });

  test('a note with styles survives save and reload through Yjs', () => {
    const doc = new Y.Doc();
    const e = mount('prose', doc);
    e.commands.setContent('<p>Sea.</p>');
    noteAfter(e, 'Sea', 'x');
    const pos = footnotesOf(e.state)[0]?.pos ?? -1;
    const styled = [
      { type: 'text' as const, text: 'See ' },
      { type: 'text' as const, text: 'Moby-Dick', marks: [{ type: 'italic' as const }] },
    ];
    expect(e.commands.setFootnoteContent(pos, styled)).toBe(true);
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    const reloaded = mount('prose', copy);
    expect(reloaded.getJSON()).toEqual(e.getJSON());
    expect(footnotesOf(reloaded.state)[0]?.content).toEqual(styled);
  });

  test('pasted HTML with a broken note keeps the reference with an empty note', () => {
    const e = mount('prose');
    e.commands.setContent('<p>Ink<sup data-footnote="" data-note="{broken">x</sup> ran.</p>');
    expect(footnotesOf(e.state).map((f) => f.content)).toEqual([[]]);
    expect(e.state.doc.textContent).toBe('Ink ran.');
  });

  test('Mod-Alt-F inserts a footnote and opens it; Enter on a selected reference opens it again', () => {
    const onOpen = vi.fn();
    const e = mount('prose', new Y.Doc(), onOpen);
    e.commands.setContent('<p>Rain.</p>');
    e.commands.setTextSelection(5);
    e.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(footnotesOf(e.state)).toHaveLength(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
    const before = e.state.doc.childCount;
    e.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(e.state.doc.childCount).toBe(before);
  });

  test('leaving a note puts the caret after its reference, so typing does not replace it', () => {
    const e = mount('prose');
    e.commands.setContent('<p>Rain.</p>');
    noteAfter(e, 'Rain', 'Wet.');
    const pos = selectedFootnote(e.state) ?? -1;
    expect(e.state.selection).toBeInstanceOf(NodeSelection);
    leaveFootnote(e, pos);
    e.commands.insertContent('s');
    expect(e.state.doc.textContent).toBe('Rains.');
    expect(notes(e)).toEqual(['1:Wet.']);
  });

  test('typing or pasting over a selected reference goes after it and keeps the note', () => {
    const e = mount('prose');
    e.commands.setContent('<p>one two</p>');
    noteAfter(e, 'one', 'Kept.');
    expect(selectedFootnote(e.state)).not.toBeNull();
    const typed = e.view.someProp('handleTextInput', (f) =>
      f(e.view, e.state.selection.from, e.state.selection.to, 'x', () => e.state.tr),
    );
    expect(typed).toBe(true);
    expect(notes(e)).toEqual(['1:Kept.']);
    expect(e.state.doc.textContent).toBe('onex two');
    e.commands.setNodeSelection(footnotesOf(e.state)[0]?.pos ?? 0);
    e.view.pasteText('y', clipboard({ 'text/plain': 'y' }));
    expect(notes(e)).toEqual(['1:Kept.']);
    expect(e.state.doc.textContent).toBe('oneyx two');
  });

  test('a footnote cannot go between blocks, such as after a selected scene break', () => {
    const e = mount('prose');
    e.commands.setContent('<p>One.</p><div data-scene-break></div><p>Two.</p>');
    e.view.dispatch(
      e.state.tr.setSelection(NodeSelection.create(e.state.doc, e.state.doc.child(0).nodeSize)),
    );
    expect(e.can().insertFootnote()).toBe(false);
  });

  test('plain text keeps notes for search and backups, and the counted part leaves them out', () => {
    const e = mount('prose');
    e.commands.setContent('<p>The ledger was wet.</p>');
    noteAfter(e, 'wet', 'It rained in 1994.');
    expect(docBody(e.state.doc, 'prose')).toBe('The ledger was wet.');
    expect(docNotes(e.state.doc).map((n) => n.map((r) => r.text).join(''))).toEqual(['It rained in 1994.']);
    expect(docText(e.state.doc, 'prose')).toBe('The ledger was wet.\n\nNotes\n1. It rained in 1994.');
  });
});

describe('footnotes in poems', () => {
  test('a footnote in a line keeps every space and the hanging indent', () => {
    const e = mount('poem');
    e.commands.setContent(poemDataToJSON([[{ text: '   salt   on the   sill', hanging: 2 }]]));
    noteAfter(e, 'salt', 'From the shore.');
    expect(poemDataFromDoc(e.state.doc)).toEqual([[{ text: '   salt   on the   sill', hanging: 2 }]]);
    expect(e.view.dom.querySelector('p[data-poem-line]')?.getAttribute('data-hanging')).toBe('2');
    expect(docText(e.state.doc, 'poem')).toBe('   salt   on the   sill\n\nNotes\n1. From the shore.\n');
    expect(docBody(e.state.doc, 'poem')).toBe('   salt   on the   sill\n');
  });

  test('a copy from a Vlo poem pastes with its footnote and its spaces', () => {
    const e = mount('poem');
    e.commands.setContent(
      poemDataToJSON([
        [
          { text: '  tide  out', hanging: 0 },
          { text: 'end', hanging: 0 },
        ],
      ]),
    );
    noteAfter(e, 'tide', 'Low tide.');
    const line = e.state.doc.child(0).child(0);
    const slice = e.state.doc.slice(2, 2 + line.content.size);
    const { dom, text } = e.view.serializeForClipboard(slice);
    // The plain-text copy is one line: the footnote and the runs around it do not split it.
    expect(text).toBe('  tide  out');
    expect(dom.innerHTML).toContain('data-poem-line');
    // Paste at the end of the second line.
    e.commands.setTextSelection(e.state.doc.content.size - 2);
    e.view.pasteHTML(dom.innerHTML, clipboard({ 'text/html': dom.innerHTML, 'text/plain': text }));
    expect(poemDataFromDoc(e.state.doc)[0]?.map((l) => l.text)).toEqual(['  tide  out', 'end  tide  out']);
    expect(notes(e)).toEqual(['1:Low tide.', '2:Low tide.']);
  });
});
