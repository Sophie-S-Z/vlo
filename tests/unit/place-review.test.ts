import type { JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { initProseMirrorDoc } from '@tiptap/y-tiptap';
import { describe, expect, test } from 'vitest';
import { buildExportDoc } from '@/features/export/build';
import { toDocx } from '@/features/export/docx';
import { bookmarkName } from '@/features/export/model';
import { BEFORE_WORD, placeChanges, placeReview } from '@/features/import/placeReview';
import { readReview, type ReviewParagraph } from '@/features/import/review';
import { editorSchemas } from '@/features/import/tree';
import { db } from '@/lib/db';
import { openItemDoc, writeItemUpdate, YFRAGMENT } from '@/lib/ydocs';
import { REVIEW_TEXT, reviewedDocx } from '../fixtures/review';
import { item, project, updateOf } from './export-fixtures';

/* Plan Task I3 (roadmap F45, decision R3): an editor's Word changes go on the paragraphs they belong to. */

const NOW = Date.UTC(2026, 10, 9);
const paragraph = (text: string, marks: JSONContent['marks'] = []): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks.length > 0 ? { marks } : {}) }],
});
const docOf = (content: JSONContent[]) => editorSchemas.prose.nodeFromJSON({ type: 'doc', content });
const fixture = async (): Promise<ReviewParagraph[]> =>
  (await readReview(await reviewedDocx('vlo_abc'))).sections.get('vlo_abc') ?? [];

/** Each text run of the document with its suggestion and comment, as plain values. */
function runs(doc: ProseMirrorNode) {
  const out: { text: string; change?: string; by?: string; pass?: number; comment?: string }[] = [];
  doc.descendants((node) => {
    if (!node.isText) return true;
    const s = node.marks.find((m) => m.type.name === 'suggestion')?.attrs;
    const c = node.marks.find((m) => m.type.name === 'comment')?.attrs;
    out.push({
      text: node.text ?? '',
      ...(s ? { change: String(s.kind), by: String(s.by), pass: Number(s.pass) } : {}),
      ...(c ? { comment: `${String(c.by)}: ${String(c.text)}` } : {}),
    });
    return false;
  });
  return out;
}

describe('placeChanges', () => {
  test('puts each change on its words, and an added paragraph after its neighbour', async () => {
    const { tr, placement } = placeChanges(
      docOf(REVIEW_TEXT.map((t) => paragraph(t))),
      await fixture(),
      2,
      NOW,
    );
    expect(placement).toEqual({ changes: 3, comments: 2, unplaced: [] });
    const ana = { by: 'Ana Ruiz', pass: 2 };
    expect(runs(tr.doc)).toEqual([
      { text: 'Mira ', change: 'delete', ...ana },
      { text: 'finds the ' },
      { text: 'ledger', comment: 'Ana Ruiz: Which ledger?\nBen Ode: The blue one.' },
      { text: ' at dawn', change: 'insert', ...ana },
      { text: '.' },
      { text: 'It is cold.', comment: 'Ana Ruiz: Show it.' },
      { text: 'She runs.', change: 'insert', ...ana },
    ]);
    expect(tr.doc.childCount).toBe(3);
  });

  test('a paragraph that the writer changed keeps its text, and the summary lists its changes', async () => {
    const doc = docOf([paragraph(REVIEW_TEXT[0] ?? ''), paragraph('It is very cold.')]);
    const { tr, placement } = placeChanges(doc, await fixture(), 1, NOW);
    expect(placement).toEqual({
      changes: 3,
      comments: 1,
      unplaced: [{ quote: 'Show it.', reason: 'changed' }],
    });
    expect(tr.doc.child(1).textContent).toBe('It is very cold.');
    // The added paragraph still comes after the paragraph that the writer changed.
    expect(tr.doc.child(2).textContent).toBe('She runs.');
  });

  test("the writer's own changes and comments come back from the file and stay as they are", async () => {
    const own = { type: 'suggestion', attrs: { id: 's1', kind: 'delete', pass: 1, at: NOW, by: '' } };
    const typed = { type: 'suggestion', attrs: { id: 's2', kind: 'insert', pass: 1, at: NOW, by: '' } };
    const note = { type: 'comment', attrs: { id: 'c1', text: 'Too quiet?', at: NOW, by: '' } };
    const content: JSONContent[] = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Mira ', marks: [own] },
          { type: 'text', text: 'finds ' },
          { type: 'text', text: 'the ledger', marks: [note] },
          { type: 'text', text: ' at last', marks: [typed] },
          { type: 'text', text: '.' },
        ],
      },
    ];
    for (const review of [
      { changes: true, comments: true },
      { changes: false, comments: true },
    ]) {
      const exported = buildExportDoc({
        project: project('novel', { authorName: 'Rae Moss' }),
        items: [item('a1b2', 'scene', 'One')],
        scope: { kind: 'item', itemId: 'a1b2' },
        updates: new Map([['a1b2', updateOf({ type: 'doc', content }, 'prose')]]),
        review,
      });
      const file = await readReview(await toDocx(exported));
      const back = file.sections.get(bookmarkName('a1b2')) ?? [];
      const { tr, placement } = placeChanges(docOf(content), back, 1, NOW);
      expect(placement).toEqual({ changes: 0, comments: 0, unplaced: [] });
      expect(tr.docChanged).toBe(false);
    }
  });
});

test('placeReview saves a snapshot first, then the changes, in the stored text', async () => {
  await db.open();
  try {
    const target = { item: { id: 'i-review', projectId: 'p1' }, form: 'prose' as const, pass: 3 as const };
    await writeItemUpdate(
      target.item.id,
      updateOf({ type: 'doc', content: REVIEW_TEXT.map((t) => paragraph(t)) }, 'prose'),
      NOW,
    );
    expect(await placeReview(target, await fixture())).toMatchObject({ changes: 3, comments: 2 });
    const [snapshot] = await db.snapshots.where('itemId').equals(target.item.id).toArray();
    expect(snapshot?.label).toBe(BEFORE_WORD);
    expect(snapshot?.text).toBe('Mira finds the ledger.\n\nIt is cold.');
    const open = openItemDoc(target.item.id);
    await open.ready;
    const { doc } = initProseMirrorDoc(open.doc.getXmlFragment(YFRAGMENT), editorSchemas.prose);
    await open.close();
    expect(
      runs(doc)
        .filter((r) => r.change)
        .map((r) => [r.text, r.change, r.pass]),
    ).toEqual([
      ['Mira ', 'delete', 3],
      [' at dawn', 'insert', 3],
      ['She runs.', 'insert', 3],
    ]);
  } finally {
    await db.delete();
  }
});
