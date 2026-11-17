import { readFileSync } from 'node:fs';
import { Editor, type JSONContent } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { cleanPasteKey, keepOriginalLook } from '@/features/editor/extensions/cleanPaste';
import { paintKey } from '@/features/editor/extensions/paintFormat';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { changeCase, nextCase } from '@/features/editor/format/textCase';

/* Phase 19, Task B2: clean paste, plain paste, paint format and change case. */

// jsdom has no ClipboardEvent, and ProseMirror makes one for a paste that a script starts.
beforeAll(() => {
  if ('ClipboardEvent' in globalThis) return;
  globalThis.ClipboardEvent = class extends Event {
    clipboardData = null;
  };
});

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function editorOn(content: string, lang?: string): Editor {
  const box = document.createElement('div');
  if (lang) box.lang = lang;
  const element = document.createElement('div');
  box.append(element);
  document.body.append(box);
  const editor = new Editor({ element, extensions: proseExtensions(new Y.Doc()) });
  editor.commands.setContent(content);
  editors.push(editor);
  return editor;
}

const fixture = (name: string) => readFileSync(`tests/fixtures/paste/${name}`, 'utf8');

/** A short form of a document: each block with its text, and each run with its marks. */
function tree(node: JSONContent): string {
  if (node.type === 'text') {
    const marks = (node.marks ?? []).map((m) =>
      m.type === 'textStyle' || m.type === 'link' ? `${m.type}${JSON.stringify(m.attrs)}` : m.type,
    );
    return marks.length > 0 ? `{${marks.join('+')}:${node.text ?? ''}}` : (node.text ?? '');
  }
  if (node.type === 'footnote') return `[note:${JSON.stringify(node.attrs?.content)}]`;
  const level = node.type === 'heading' ? String(node.attrs?.level) : '';
  return `${node.type ?? ''}${level}(${(node.content ?? []).map(tree).join('')})`;
}

/** Pastes the HTML into an empty item. */
function pasted(html: string): Editor {
  const editor = editorOn('<p></p>');
  editor.view.pasteHTML(html);
  return editor;
}

describe('clean paste', () => {
  test('a Google Docs paste keeps its formats, list, link and footnote, and drops its look', () => {
    const editor = pasted(fixture('google-docs.html'));
    expect(tree(editor.getJSON())).toBe(
      'doc(' +
        'heading2(The Harbour)' +
        'paragraph(The boat came in {bold:late}{italic:, and quiet}.[note:[{"type":"text","text":"The pier was built in 1890."}]])' +
        'bulletList(listItem(paragraph({underline:Rope})))' +
        'paragraph({link{"href":"https://example.com/tide","target":"_blank","rel":"noopener noreferrer nofollow","class":null,"title":null}:Tide tables}))',
    );
  });

  test('a Word paste keeps its lists and footnote, and its Heading 1 becomes a Heading 2', () => {
    const editor = pasted(fixture('word.html'));
    expect(tree(editor.getJSON())).toBe(
      'doc(' +
        'heading2(Chapter One)' +
        'paragraph(She left at {bold:dawn}[note:[{"type":"text","text":"Before the bells."}]].)' +
        'bulletList(listItem(paragraph(Bread))listItem(paragraph({italic:Salt})))' +
        'orderedList(listItem(paragraph(First)))' +
        // The empty line that took the paste stays after the list.
        'paragraph())',
    );
  });

  test('a web page paste keeps its quote and list, and the notice offers the original look', () => {
    const editor = pasted(fixture('web-page.html'));
    expect(tree(editor.getJSON())).toBe(
      'doc(' +
        'heading2(Night ferry)' +
        'paragraph(The {bold:last} ferry {italic:leaves} at {strike:ten} eleven.)' +
        'blockquote(paragraph(Keep your ticket.))' +
        'orderedList(listItem(paragraph(Board))listItem(paragraph(Sit)))paragraph())',
    );
    expect(cleanPasteKey.getState(editor.state)).not.toBeNull();
  });

  test('"Keep the original look" puts the paste again with its colors and sizes', () => {
    const editor = pasted(fixture('google-docs.html'));
    expect(keepOriginalLook(editor)).toBe(true);
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"color":"rgb(204, 0, 0)"');
    expect(json).toContain('"fontSize":"20pt"');
    // The formats, the footnote and the text come once.
    expect(tree(editor.getJSON())).toContain('[note:');
    expect(editor.getText().match(/The Harbour/g)).toHaveLength(1);
    expect(cleanPasteKey.getState(editor.state)).toBeNull();
  });

  test('a paste with nothing to clean, and a copy from Vlo, show no notice', () => {
    const editor = pasted('<p>Plain <b>words</b>.</p>');
    expect(cleanPasteKey.getState(editor.state)).toBeNull();
    const own = pasted('<p data-pm-slice="1 1 []" style="color: red">Own</p>');
    expect(cleanPasteKey.getState(own.state)).toBeNull();
  });

  test('the notice goes at the next edit', () => {
    const editor = pasted(fixture('web-page.html'));
    editor.commands.insertContent('x');
    expect(cleanPasteKey.getState(editor.state)).toBeNull();
    expect(keepOriginalLook(editor)).toBe(false);
  });

  test('a plain paste takes the formats at the caret', () => {
    const editor = editorOn('<p><strong>Bold</strong></p>');
    editor.commands.setTextSelection(5);
    editor.view.pasteText(' and more');
    expect(tree(editor.getJSON())).toBe('doc(paragraph({bold:Bold and more}))');
  });
});

describe('paint format', () => {
  test('one press copies the formats at the caret, and the next selection takes them once', () => {
    const editor = editorOn('<p><strong><em>Bold</em></strong> plain <u>words</u> here</p>');
    editor.commands.setTextSelection(2);
    editor.commands.paintFormat();
    editor.commands.setTextSelection({ from: 6, to: 11 });
    expect(tree(editor.getJSON())).toBe(
      'doc(paragraph({bold+italic:Bold} {bold+italic:plain} {underline:words} here))',
    );
    expect(paintKey.getState(editor.state)).toBeNull();
    // The brush is away, so the next selection keeps its formats.
    editor.commands.setTextSelection({ from: 13, to: 18 });
    expect(tree(editor.getJSON())).toContain('{underline:words}');
  });

  test('a second press keeps the brush on, and the paragraph look goes with it', () => {
    const editor = editorOn('<p style="text-align: center">Centered</p><p>One</p><p>Two</p>');
    editor.commands.setTextSelection(2);
    editor.commands.paintFormat();
    editor.commands.paintFormat();
    editor.commands.setTextSelection({ from: 11, to: 14 });
    editor.commands.setTextSelection({ from: 16, to: 19 });
    const aligns = editor.getJSON().content.map((b) => (b.attrs as { textAlign?: string }).textAlign);
    expect(aligns).toEqual(['center', 'center', 'center']);
    editor.commands.paintFormat();
    expect(paintKey.getState(editor.state)).toBeNull();
  });

  test('Escape puts the brush away', () => {
    const editor = editorOn('<p><strong>Bold</strong> plain</p>');
    editor.commands.setTextSelection(2);
    editor.commands.paintFormat();
    const escape = new KeyboardEvent('keydown', { key: 'Escape' });
    expect(editor.view.someProp('handleKeyDown', (f) => f(editor.view, escape))).toBe(true);
    expect(paintKey.getState(editor.state)).toBeNull();
  });
});

describe('change case', () => {
  test('each rule in English', () => {
    expect(changeCase('the lord of the rings', 'title')).toBe('The Lord of the Rings');
    expect(changeCase('a tale of two cities to live in', 'title')).toBe('A Tale of Two Cities to Live In');
    expect(changeCase('HELLO THERE. "HOW ARE YOU?" FINE', 'sentence')).toBe(
      'Hello there. "How are you?" Fine',
    );
    expect(changeCase('Straße', 'upper')).toBe('STRASSE');
    expect(changeCase('DON’T STOP', 'lower')).toBe('don’t stop');
    expect(changeCase('istanbul', 'upper', 'en')).toBe('ISTANBUL');
  });

  test('each rule in Turkish keeps the dotted and the dotless i', () => {
    expect(changeCase('istanbul ılık', 'upper', 'tr')).toBe('İSTANBUL ILIK');
    expect(changeCase('İSTANBUL IŞIK', 'lower', 'tr')).toBe('istanbul ışık');
    expect(changeCase('istanbul ılık', 'title', 'tr')).toBe('İstanbul Ilık');
    expect(changeCase('İSTANBUL IŞIK', 'sentence', 'tr')).toBe('İstanbul ışık');
  });

  test('Shift-F3 steps through the cases, past a case that changes nothing', () => {
    expect(nextCase('qUIET harbour')).toBe('upper');
    expect(nextCase('QUIET HARBOUR')).toBe('lower');
    expect(nextCase('quiet harbour')).toBe('title');
    expect(nextCase('Quiet Harbour')).toBe('sentence');
    expect(nextCase('Quiet harbour')).toBe('upper');
    // One word: title case and sentence case are the same, so the step goes on to UPPERCASE.
    expect(nextCase('Harbour')).toBe('upper');
  });

  test('the command keeps the marks of each character, and the language comes from the page', () => {
    const editor = editorOn('<p><strong>big</strong> deal</p>');
    editor.commands.selectAll();
    editor.commands.setTextCase('upper');
    expect(tree(editor.getJSON())).toBe('doc(paragraph({bold:BIG} DEAL))');
    expect(editor.state.selection.empty).toBe(false);

    const turkish = editorOn('<p>bir istasyon</p>', 'tr');
    // The caret in "istasyon": the word at the caret goes from lowercase to Title Case.
    turkish.commands.setTextSelection(8);
    turkish.commands.keyboardShortcut('Shift-F3');
    expect(turkish.getText()).toBe('bir İstasyon');
  });
});
