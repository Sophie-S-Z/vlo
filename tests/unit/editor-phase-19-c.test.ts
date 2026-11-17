import { Editor, type JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { yUndoPluginKey } from '@tiptap/y-tiptap';
import JSZip from 'jszip';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import { commentsOf } from '@/features/editor/extensions/comment';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { repliesOf } from '@/features/editor/format/comment';
import { buildExportDoc } from '@/features/export/build';
import { toDocx } from '@/features/export/docx';
import { bookmarkName } from '@/features/export/model';
import { placeChanges } from '@/features/import/placeReview';
import { readReview } from '@/features/import/review';
import { editorSchemas } from '@/features/import/tree';
import { item, project, updateOf } from './export-fixtures';

/* Phase 19, Task C1: comment threads with replies, resolve and reopen, and replies in Word. */

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function mount(doc = new Y.Doc()): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({ element, extensions: proseExtensions(doc) });
  editors.push(editor);
  return editor;
}

/** A new editor with "Mira finds the ledger." and a comment on "ledger". Returns the comment's id. */
function withComment(doc?: Y.Doc): { editor: Editor; id: string } {
  const editor = mount(doc);
  editor.commands.insertContent('Mira finds the ledger.');
  const { state } = editor;
  editor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, 16, 22)));
  editor.commands.addComment('Which ledger?');
  const id = commentsOf(editor.state)[0]?.id ?? '';
  // Each later change is its own step of Undo.
  yUndoPluginKey.getState(editor.state)?.undoManager.stopCapturing();
  return { editor, id };
}

const thread = (editor: Editor) => commentsOf(editor.state)[0];
const stop = (editor: Editor) => yUndoPluginKey.getState(editor.state)?.undoManager.stopCapturing();

describe('threads', () => {
  test('a reply joins the thread, and the writer can edit and delete it', () => {
    const { editor, id } = withComment();
    expect(thread(editor)).toMatchObject({
      text: 'Which ledger?',
      quote: 'ledger',
      replies: [],
      resolvedAt: 0,
    });
    expect(editor.commands.replyToComment(id, '  The blue one.  ')).toBe(true);
    expect(editor.commands.replyToComment(id, '   ')).toBe(false);
    const [reply] = thread(editor)?.replies ?? [];
    expect(reply).toMatchObject({ text: 'The blue one.', by: '' });
    expect(reply?.at).toBeGreaterThan(0);

    expect(editor.commands.setCommentText(id, 'The red one.', reply?.id)).toBe(true);
    expect(thread(editor)?.replies.map((r) => r.text)).toEqual(['The red one.']);
    expect(thread(editor)?.text).toBe('Which ledger?');
    expect(editor.commands.setCommentText(id, 'Whose ledger?')).toBe(true);
    expect(thread(editor)?.text).toBe('Whose ledger?');

    expect(editor.commands.removeReply(id, reply?.id ?? '')).toBe(true);
    expect(editor.commands.removeReply(id, 'none')).toBe(false);
    expect(thread(editor)?.replies).toEqual([]);
  });

  test('resolve hides the thread on its words, reopen brings it back, and Undo takes each back', () => {
    const { editor, id } = withComment();
    editor.commands.resolveComment(id);
    expect(thread(editor)?.resolvedAt).toBeGreaterThan(0);
    expect(editor.view.dom.querySelector('.vlo-comment')?.hasAttribute('data-resolved')).toBe(true);
    stop(editor);
    editor.commands.reopenComment(id);
    expect(thread(editor)?.resolvedAt).toBe(0);
    expect(editor.view.dom.querySelector('.vlo-comment')?.hasAttribute('data-resolved')).toBe(false);
    stop(editor);

    editor.commands.removeComment(id);
    expect(commentsOf(editor.state)).toEqual([]);
    editor.commands.undo();
    expect(thread(editor)).toMatchObject({ id, text: 'Which ledger?' });
    editor.commands.undo();
    expect(thread(editor)?.resolvedAt).toBeGreaterThan(0);
  });

  test('the thread follows its words after an edit above it', () => {
    const { editor, id } = withComment();
    editor.commands.replyToComment(id, 'The blue one.');
    editor.commands.insertContentAt(1, 'At dawn, ');
    expect(thread(editor)).toMatchObject({ quote: 'ledger', from: 25, replies: [{ text: 'The blue one.' }] });
  });

  test('replies go through Yjs to another tab', () => {
    const doc = new Y.Doc();
    const { editor, id } = withComment(doc);
    editor.commands.replyToComment(id, 'The blue one.');
    editor.commands.resolveComment(id);
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    const other = mount(copy);
    expect(thread(other)).toMatchObject({ id, replies: [{ text: 'The blue one.' }] });
    expect(thread(other)?.resolvedAt).toBeGreaterThan(0);
  });
});

describe('Word', () => {
  const AT = Date.UTC(2026, 10, 9);
  const note = {
    type: 'comment',
    attrs: {
      id: 'c1',
      text: 'Which ledger?',
      at: AT,
      by: '',
      replies: [{ id: 'r1', text: 'The blue one.', by: 'Ana', at: AT }],
    },
  };
  const content: JSONContent[] = [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Mira finds the ' },
        { type: 'text', text: 'ledger', marks: [note] },
        { type: 'text', text: '.' },
      ],
    },
  ];
  const docx = () =>
    toDocx(
      buildExportDoc({
        project: project('novel', { authorName: 'Rae Moss' }),
        items: [item('a1b2', 'scene', 'One')],
        scope: { kind: 'item', itemId: 'a1b2' },
        updates: new Map([['a1b2', updateOf({ type: 'doc', content }, 'prose')]]),
        review: { changes: false, comments: true },
      }),
    );

  test('a reply is a Word reply to its comment, on the same words', async () => {
    const zip = await JSZip.loadAsync(await docx());
    const comments = (await zip.file('word/comments.xml')?.async('string')) ?? '';
    expect(comments).toContain('w:author="Rae Moss"');
    expect(comments).toContain('w:author="Ana"');
    expect(comments).toContain('>The blue one.<');
    expect(await zip.file('word/commentsExtended.xml')?.async('string')).toContain('w15:paraIdParent');
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    expect(xml.match(/<w:commentRangeStart/g)).toHaveLength(2);
  });

  test('the thread comes back as it went out, and a new reply from the editor joins it', async () => {
    const back = (await readReview(await docx())).sections.get(bookmarkName('a1b2')) ?? [];
    const doc = editorSchemas.prose.nodeFromJSON({ type: 'doc', content });
    const same = placeChanges(doc, back, 1, AT);
    expect(same.placement).toEqual({ changes: 0, comments: 0, unplaced: [] });
    expect(same.tr.docChanged).toBe(false);

    const answered = back.map((p) => ({
      ...p,
      changes: p.changes.map((c) =>
        c.kind === 'comment'
          ? { ...c, replies: [...c.replies, { text: 'Under the stove.', by: 'Ben', date: AT }] }
          : c,
      ),
    }));
    const { tr, placement } = placeChanges(doc, answered, 1, AT);
    expect(placement.comments).toBe(1);
    let replies: unknown;
    tr.doc.descendants((node) => {
      const mark = node.marks.find((m) => m.type.name === 'comment');
      if (mark) replies = repliesOf(mark.attrs.replies).map((r) => `${r.by}: ${r.text}`);
    });
    expect(replies).toEqual(['Ana: The blue one.', 'Ben: Under the stove.']);
  });
});
