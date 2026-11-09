import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import { commentAt, commentsOf, selectComment } from '@/features/editor/extensions/comment';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { docText } from '@/features/editor/itemText';
import { itemBlocks, noteCounter, updateToJson } from '@/features/export/read';

/* Plan Task H3 (roadmap F43): comments on the words of the text. */

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function mount(kind: 'prose' | 'poem', doc = new Y.Doc()) {
  const host = document.createElement('div');
  document.body.append(host);
  const extensions = kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc);
  const editor = new Editor({ element: host, extensions });
  editors.push(editor);
  return editor;
}

/** Selects the words from `from` to `to`, as offsets in the first paragraph's text. */
function select(editor: Editor, from: number, to: number) {
  const { tr, doc } = editor.state;
  editor.view.dispatch(tr.setSelection(TextSelection.create(doc, from + 1, to + 1)));
}

function typeAndSelect(editor: Editor, text: string, from: number, to: number) {
  editor.commands.insertContent(text);
  select(editor, from, to);
}

describe('comments', () => {
  test('a comment goes on the selected words, and the list shows its words', () => {
    const editor = mount('prose');
    typeAndSelect(editor, 'Mira finds the ledger.', 5, 10);
    expect(editor.commands.addComment('  Too quick?  ')).toBe(true);
    const [comment] = commentsOf(editor.state);
    expect(comment).toMatchObject({ text: 'Too quick?', quote: 'finds' });
    expect(comment?.at).toBeGreaterThan(0);
    expect(editor.view.dom.querySelector('.vlo-comment')?.textContent).toBe('finds');
  });

  test('a comment needs selected words, a text, and words with no comment', () => {
    const editor = mount('prose');
    typeAndSelect(editor, 'Mira finds the ledger.', 0, 4);
    expect(editor.commands.addComment('   ')).toBe(false);
    expect(editor.commands.addComment('Name?')).toBe(true);
    select(editor, 2, 8);
    expect(editor.commands.addComment('Overlap')).toBe(false);
    editor.commands.setTextSelection(3);
    expect(editor.commands.addComment('Empty')).toBe(false);
    expect(commentsOf(editor.state)).toHaveLength(1);
  });

  test('a comment changes, opens at the cursor, and comes off its words', () => {
    const editor = mount('poem');
    typeAndSelect(editor, 'the gull, the grey', 4, 8);
    editor.commands.addComment('Image?');
    const id = commentsOf(editor.state)[0]?.id ?? '';
    expect(editor.commands.setCommentText(id, 'A sharper image?')).toBe(true);
    editor.commands.setTextSelection(1);
    expect(commentAt(editor.state)).toBeNull();
    expect(selectComment(editor, id)).toBe(true);
    expect(commentAt(editor.state)?.text).toBe('A sharper image?');
    expect(editor.commands.removeComment(id)).toBe(true);
    expect(commentsOf(editor.state)).toEqual([]);
    expect(editor.getText()).toContain('the gull, the grey');
  });

  test('Clear formatting keeps a comment', () => {
    const editor = mount('prose');
    typeAndSelect(editor, 'Mira finds the ledger.', 5, 10);
    editor.commands.addComment('Verb?');
    editor.commands.toggleBold();
    editor.commands.clearFormatting();
    expect(editor.isActive('bold')).toBe(false);
    expect(commentsOf(editor.state).map((c) => c.quote)).toEqual(['finds']);
  });

  test('words typed at the end of a comment stay out of it', () => {
    const editor = mount('prose');
    typeAndSelect(editor, 'Mira finds', 5, 10);
    editor.commands.addComment('Verb?');
    editor.commands.setTextSelection(11);
    editor.commands.insertContent(' the ledger');
    expect(commentsOf(editor.state)[0]?.quote).toBe('finds');
  });

  test('a comment survives a reload, and exports and plain text leave it out', () => {
    const doc = new Y.Doc();
    const editor = mount('prose', doc);
    typeAndSelect(editor, 'Mira finds the ledger.', 5, 10);
    editor.commands.addComment('SECRET NOTE');

    const update = Y.encodeStateAsUpdate(doc);
    const copy = new Y.Doc();
    Y.applyUpdate(copy, update);
    const reloaded = mount('prose', copy);
    expect(commentsOf(reloaded.state).map((c) => c.text)).toEqual(['SECRET NOTE']);

    const blocks = itemBlocks(updateToJson(update), 'prose', noteCounter());
    expect(JSON.stringify(blocks)).not.toContain('SECRET');
    const [paragraph] = blocks;
    const runs = paragraph?.type === 'paragraph' ? paragraph.runs : [];
    expect(runs.map((r) => ('text' in r ? r.text : '')).join('')).toBe('Mira finds the ledger.');
    expect(docText(reloaded.state.doc, 'prose')).toBe('Mira finds the ledger.');
  });

  test('a copy of the words takes no comment', () => {
    const editor = mount('prose');
    typeAndSelect(editor, 'Mira finds the ledger.', 5, 10);
    editor.commands.addComment('SECRET NOTE');
    const html = editor.getHTML();
    expect(html).not.toContain('SECRET');
    const other = mount('prose');
    other.commands.setContent(html);
    expect(commentsOf(other.state)).toEqual([]);
  });
});
