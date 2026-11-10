import { initProseMirrorDoc } from '@tiptap/y-tiptap';
import { expect, test } from 'vitest';
import { commentText, feedbackOf, makeComment } from '@/features/feedback/feedback';
import { editorSchemas } from '@/features/import/tree';
import { db, type ShareRecord, type StoredComment } from '@/lib/db';
import { openItemDoc, writeItemUpdate, YFRAGMENT } from '@/lib/ydocs';
import { item, proseUpdate } from './export-fixtures';

/* Plan Task I4 (F50, decision R4): the Feedback tab groups the replies of a project's links by item. */

const reply = (
  id: string,
  section: number,
  at: number,
  more: Partial<StoredComment> = {},
): StoredComment => ({
  id,
  section,
  block: 0,
  quote: 'The gulls slept',
  text: `Reply ${id}`,
  at,
  ...more,
});

const share = (id: string, itemIds: string[], comments: StoredComment[]): ShareRecord => ({
  id,
  projectId: 'p1',
  itemIds,
  title: id,
  createdAt: 0,
  expiresAt: 0,
  ownerToken: '',
  key: '',
  revoked: false,
  comments,
  commentsReadAt: 0,
});

test('feedbackOf groups the replies by item in binder order, oldest first, and the answers last', () => {
  const chapter = item('ch', 'chapter', 'One');
  const first = item('s1', 'scene', 'Harbour', 'ch');
  const second = item('s2', 'scene', 'Gulls', 'ch');
  const shares = [
    // The link holds the second scene first, so its section 0 is the second scene.
    share('a', ['s2', 's1'], [reply('a1', 0, 5), reply('a2', 1, 9), reply('a3', 0, 1, { question: 0 })]),
    share('b', ['s1', 'gone'], [reply('b1', 0, 7), reply('b2', 1, 3), reply('b3', 4, 2)]),
  ];
  const groups = feedbackOf(shares, [second, chapter, first]);
  expect(groups.map((g) => [g.itemId, g.replies.map((r) => r.comment.id)])).toEqual([
    ['s1', ['b1', 'a2']],
    ['s2', ['a1']],
    // An item that the project no longer has comes after the binder. A section past the link's items stays out.
    ['gone', ['b2']],
    [null, ['a3']],
  ]);
  expect(groups[3]?.replies[0]?.share.id).toBe('a');
});

test('commentText puts the reaction first', () => {
  expect(commentText(reply('r', 0, 0, { reaction: 'moved', text: 'The end.' }))).toBe('Moved me\nThe end.');
  expect(commentText(reply('r', 0, 0, { reaction: 'lost', text: '' }))).toBe('Lost');
});

test('makeComment puts the reply on its words with the reader name, once', async () => {
  await db.open();
  try {
    const target = { item: { id: 'i-feedback', projectId: 'p1' }, form: 'prose' as const };
    await writeItemUpdate(target.item.id, proseUpdate(['The gulls slept on the wall.']), 1);
    const ines = reply('r1', 0, 42, { name: 'Ines', reaction: 'loved', text: 'So still.' });
    expect(await makeComment(target, ines)).toBe('made');
    expect(await makeComment(target, reply('r2', 0, 43))).toBe('taken');
    expect(await makeComment(target, reply('r3', 0, 44, { quote: 'The cats' }))).toBe('missing');
    const open = openItemDoc(target.item.id);
    await open.ready;
    const { doc } = initProseMirrorDoc(open.doc.getXmlFragment(YFRAGMENT), editorSchemas.prose);
    await open.close();
    const marked: unknown[] = [];
    doc.descendants((node) => {
      const comment = node.marks.find((m) => m.type.name === 'comment');
      if (comment)
        marked.push({ words: node.text, text: String(comment.attrs.text), by: String(comment.attrs.by) });
    });
    expect(marked).toEqual([{ words: 'The gulls slept', text: 'Loved it\nSo still.', by: 'Ines' }]);
  } finally {
    await db.delete();
  }
});
