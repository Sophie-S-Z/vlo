import { readFileSync } from 'node:fs';
import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { parsePoemText, poemDataFromDoc, poemDataToJSON, poemDataToText } from '@/features/editor/poemText';

const fixture = readFileSync('tests/fixtures/poem.txt', 'utf8');

let editor: Editor;
let after: HTMLButtonElement;

function mount(kind: 'poem' | 'prose') {
  const host = document.createElement('div');
  after = document.createElement('button');
  after.textContent = 'After the editor';
  document.body.append(host, after);
  const doc = new Y.Doc();
  editor = new Editor({
    element: host,
    extensions: kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc),
    enableInputRules: kind === 'prose',
    enablePasteRules: kind === 'prose',
  });
}

function press(key: string, init: KeyboardEventInit = {}) {
  editor.view.dom.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  );
}

/** jsdom has no ClipboardEvent. This stands in for one with the given clipboard types. */
function clipboard(data: Record<string, string>): ClipboardEvent {
  return Object.assign(new Event('paste', { cancelable: true }), {
    clipboardData: { getData: (type: string) => data[type] ?? '' },
  }) as unknown as ClipboardEvent;
}

const lines = () => poemDataFromDoc(editor.state.doc).map((s) => s.map((l) => l.text));

/** Puts the cursor in line `line` of stanza `stanza`, at character `offset` (or the end). */
function cursorAt(stanza: number, line: number, offset?: number) {
  let pos = 0;
  editor.state.doc.forEach((s, sPos, sIndex) => {
    if (sIndex !== stanza) return;
    s.forEach((l, lPos, lIndex) => {
      if (lIndex !== line) return;
      pos = sPos + 1 + lPos + 1 + (offset ?? l.content.size);
    });
  });
  editor.commands.setTextSelection(pos);
}

afterEach(() => {
  editor.destroy();
  document.body.replaceChildren();
});

describe('poem editor', () => {
  beforeEach(() => {
    mount('poem');
    editor.commands.setContent(poemDataToJSON(parsePoemText('Salt\nTide\n')));
  });

  test('an empty poem has one stanza with one empty line', () => {
    editor.commands.clearContent();
    expect(lines()).toEqual([['']]);
  });

  test('Tab inserts 4 spaces at the cursor', () => {
    cursorAt(0, 0, 0);
    press('Tab');
    expect(lines()).toEqual([['    Salt', 'Tide']]);
  });

  test('Shift-Tab removes up to 4 leading spaces and never other text', () => {
    editor.commands.setContent(poemDataToJSON(parsePoemText('      Salt\n  Tide\n')));
    cursorAt(0, 0);
    press('Tab', { shiftKey: true });
    expect(lines()).toEqual([['  Salt', '  Tide']]);
    cursorAt(0, 1);
    press('Tab', { shiftKey: true });
    press('Tab', { shiftKey: true });
    expect(lines()).toEqual([['  Salt', 'Tide']]);
  });

  test('Enter splits the line', () => {
    cursorAt(0, 0, 2);
    press('Enter');
    expect(lines()).toEqual([['Sa', 'lt', 'Tide']]);
  });

  test('Enter on an empty line starts a new stanza', () => {
    cursorAt(0, 0);
    press('Enter');
    expect(lines()).toEqual([['Salt', '', 'Tide']]);
    press('Enter');
    expect(lines()).toEqual([['Salt'], ['', 'Tide']]);
  });

  test('Mod-Enter starts a new stanza at the cursor', () => {
    cursorAt(0, 0);
    press('Enter', { ctrlKey: true });
    press('Enter', { metaKey: true });
    expect(lines().length).toBe(2);
    expect(lines()[0]).toEqual(['Salt']);
  });

  test('setHanging sets the hanging indent of the line', () => {
    cursorAt(0, 1);
    editor.commands.setHanging(4);
    expect(poemDataFromDoc(editor.state.doc)[0]?.[1]?.hanging).toBe(4);
    const dom = editor.view.dom.querySelectorAll('[data-poem-line]')[1] as HTMLElement;
    expect(dom.dataset.hanging).toBe('4');
    expect(dom.style.paddingLeft).toBe('4em');
    expect(dom.style.textIndent).toBe('-4em');
  });

  test('setHanging clamps to 0 to 8 em', () => {
    cursorAt(0, 0);
    editor.commands.setHanging(12);
    expect(poemDataFromDoc(editor.state.doc)[0]?.[0]?.hanging).toBe(8);
  });

  test('pasting the fixture as plain text gives the fixture exactly', () => {
    editor.commands.clearContent();
    editor.view.pasteText(fixture, clipboard({ 'text/plain': fixture }));
    expect(poemDataToText(poemDataFromDoc(editor.state.doc))).toBe(fixture);
  });

  test('pasting rich HTML keeps spaces as plain spaces and splits stanzas at blank paragraphs', () => {
    editor.commands.clearContent();
    const html = '<p style="color:red">&nbsp;&nbsp;<b>Salt</b></p><p></p><p>Tide<img src="x.png"></p>';
    editor.view.pasteHTML(html, clipboard({ 'text/html': html }));
    expect(lines()).toEqual([['  Salt'], ['Tide']]);
    const marked = editor.view.dom.querySelectorAll('strong, em, u, s, img');
    expect(marked).toHaveLength(0);
  });

  test('a one-line paste goes in at the cursor', () => {
    cursorAt(0, 0, 4);
    editor.view.pasteText('  and  pepper', clipboard({ 'text/plain': '  and  pepper' }));
    expect(lines()).toEqual([['Salt  and  pepper', 'Tide']]);
  });

  test('copy writes stanzas with one blank line between them', () => {
    editor.commands.setContent(poemDataToJSON(parsePoemText(fixture)));
    editor.commands.selectAll();
    const text = editor.view.someProp('clipboardTextSerializer', (f) =>
      f(editor.state.selection.content(), editor.view),
    );
    expect(text).toBe(fixture.replace(/\n$/, ''));
  });

  test('Escape then Tab leaves the editor', () => {
    editor.commands.focus();
    cursorAt(0, 0, 0);
    press('Escape');
    press('Tab');
    expect(document.activeElement).toBe(after);
    expect(lines()).toEqual([['Salt', 'Tide']]);
  });

  test('Tab after other keys still indents', () => {
    cursorAt(0, 0, 0);
    press('Escape');
    press('ArrowRight');
    press('Tab');
    expect(lines()[0]?.[0]).toMatch(/ {4}/);
  });
});

describe('prose editor', () => {
  beforeEach(() => {
    mount('prose');
  });

  test('typing # alone on a line then Enter inserts a scene break', () => {
    editor.commands.setContent('<p>Before</p><p>#</p>');
    editor.commands.focus('end');
    press('Enter');
    const types = editor.getJSON().content.map((n) => n.type);
    expect(types).toEqual(['paragraph', 'sceneBreak', 'paragraph']);
    expect(editor.view.dom.querySelector('[data-scene-break]')?.textContent).toBe('#');
  });

  test('the toolbar command inserts a scene break', () => {
    editor.commands.setContent('<p>One</p>');
    editor.commands.focus('end');
    editor.commands.insertSceneBreak();
    expect(editor.getJSON().content.map((n) => n.type)).toEqual(['paragraph', 'sceneBreak', 'paragraph']);
  });

  test('headings are levels 2 and 3 only, and code blocks are off', () => {
    expect(editor.can().toggleHeading({ level: 2 })).toBe(true);
    expect(editor.can().toggleHeading({ level: 1 })).toBe(false);
    expect(editor.schema.nodes.codeBlock).toBeUndefined();
    expect(editor.schema.nodes.horizontalRule).toBeUndefined();
  });

  test('Escape then Tab leaves the editor', () => {
    editor.commands.setContent('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
    editor.commands.focus('end');
    press('Escape');
    press('Tab');
    expect(document.activeElement).toBe(after);
  });
});
