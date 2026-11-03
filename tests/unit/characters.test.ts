import { Editor } from '@tiptap/core';
import Typography from '@tiptap/extension-typography';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import { command, insertText } from '@/features/editor/commands/registry';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { CHARACTER_CATEGORIES, searchCharacters } from '@/features/editor/format/characters';
import { recentCharacters, rememberCharacter } from '@/features/editor/format/recentCharacters';
import { parsePoemText, poemDataFromDoc, poemDataToJSON } from '@/features/editor/poemText';

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  localStorage.clear();
});

describe('the character list', () => {
  test('search finds an em dash, alpha and the section sign by name', () => {
    expect(searchCharacters('em dash')[0]?.char).toBe('—');
    expect(searchCharacters('alpha').map((e) => e.char)).toEqual(['α', 'Α']);
    expect(searchCharacters('section sign')[0]?.char).toBe('§');
    expect(searchCharacters('e with acute')[0]?.char).toBe('é');
    expect(searchCharacters('§')[0]?.name).toBe('section sign');
    expect(searchCharacters('   ')).toEqual([]);
  });

  test('every entry has one character and a name, and no character shows twice', () => {
    const all = CHARACTER_CATEGORIES.flatMap((c) => c.entries);
    for (const e of all) {
      expect(e.char.length, e.name).toBeGreaterThan(0);
      expect(e.name.length, e.char).toBeGreaterThan(1);
    }
    const chars = all.map((e) => e.char);
    expect(new Set(chars).size).toBe(chars.length);
  });

  test('the Greek alphabet and the accented letters are complete', () => {
    const greek = CHARACTER_CATEGORIES.find((c) => c.id === 'greek')?.entries ?? [];
    expect(greek).toHaveLength(49);
    expect(greek.map((e) => e.char).join('')).toContain('αβγδεζηθικλμνξοπρςστυφχψω');
    const letters = CHARACTER_CATEGORIES.find((c) => c.id === 'letters')?.entries.map((e) => e.char) ?? [];
    for (const ch of ['é', 'È', 'ñ', 'ü', 'Å', 'ç', 'ő', 'ž', 'ā', 'ę', 'ż', 'ß', 'æ', 'Ø']) expect(letters).toContain(ch);
  });

  test('the emoji list holds about 300 entries', () => {
    const emoji = CHARACTER_CATEGORIES.find((c) => c.id === 'emoji')?.entries ?? [];
    expect(emoji.length).toBeGreaterThanOrEqual(280);
  });

  test('recent picks come newest first, without repeats, up to 16', () => {
    for (const ch of 'abcdefghijklmnopq') rememberCharacter(ch);
    rememberCharacter('c');
    const recent = recentCharacters();
    expect(recent[0]).toBe('c');
    expect(recent).toHaveLength(16);
    expect(recent.filter((c) => c === 'c')).toHaveLength(1);
  });
});

function mount(kind: 'prose' | 'poem', smart: boolean): Editor {
  const host = document.createElement('div');
  document.body.append(host);
  const base = kind === 'poem' ? poemExtensions(new Y.Doc(), { tabSpaces: 4 }) : proseExtensions(new Y.Doc());
  const editor = new Editor({
    element: host,
    extensions: [...base, ...(smart ? [Typography] : [])],
    enableInputRules: kind === 'prose' ? true : smart ? ['typography'] : false,
  });
  editors.push(editor);
  return editor;
}

function type(editor: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    const taken = editor.view.someProp('handleTextInput', (f) =>
      f(editor.view, from, to, ch, () => editor.state.tr.insertText(ch, from, to)),
    );
    if (!taken) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
  }
}

describe('inserting characters', () => {
  test('a character goes in at the caret of a poem line and keeps every space and the hanging indent', () => {
    const e = mount('poem', false);
    e.commands.setContent(poemDataToJSON([[{ text: '    two   spaces', hanging: 2 }]]));
    e.commands.setTextSelection(1 + 1 + 7);
    expect(insertText(e, '—')).toBe(true);
    expect(poemDataFromDoc(e.state.doc)).toEqual([[{ text: '    two—   spaces', hanging: 2 }]]);
  });

  test('a quick insert from the / menu carries the marks at the caret', () => {
    const e = mount('prose', false);
    e.commands.setContent('<p><strong>bold</strong></p>');
    e.commands.setTextSelection(5);
    const ellipsis = command('char-ellipsis');
    expect(ellipsis.kind === 'run' && ellipsis.run(e)).toBe(true);
    expect(e.getHTML()).toBe('<p><strong>bold…</strong></p>');
  });
});

describe('smart punctuation', () => {
  test('prose turns quotes, dashes and dots into typographic forms', () => {
    const e = mount('prose', true);
    e.commands.setTextSelection(1);
    type(e, '"Wait..." -- she said');
    expect(e.state.doc.textContent).toBe('“Wait…” — she said');
  });

  test('poems keep straight quotes and hyphens unless the poet turns it on', () => {
    const plain = mount('poem', false);
    plain.commands.setContent(poemDataToJSON(parsePoemText('x\n')));
    plain.commands.setTextSelection(3);
    type(plain, ' "salt" -- 1. ');
    expect(plain.state.doc.textContent).toBe('x "salt" -- 1. ');

    const smart = mount('poem', true);
    smart.commands.setContent(poemDataToJSON(parsePoemText('x\n')));
    smart.commands.setTextSelection(3);
    type(smart, ' "salt" -- 1. ');
    // Only the typography rules run in a poem: "1. " does not become a list.
    expect(smart.state.doc.textContent).toBe('x “salt” — 1. ');
    expect(smart.getJSON().content[0]?.type).toBe('stanza');
  });
});
