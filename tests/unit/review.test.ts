import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { NODE_MARK } from '@/features/editor/textMap';
import { readReview } from '@/features/import/review';
import { ImportError } from '@/features/import/tree';
import { reviewedDocx } from '../fixtures/review';

/* Plan Task I3 (roadmap F45, decision R3): Vlo reads an editor's changes from a Word file it exported. */

const ANA = { by: 'Ana Ruiz', date: Date.UTC(2026, 10, 1, 10) };

describe('readReview', () => {
  test('reads each change and comment as offsets in the text before the changes', async () => {
    const review = await readReview(await reviewedDocx('vlo_abc'));
    expect(review.foreign).toBe(false);
    expect([...review.sections.keys()]).toEqual(['vlo_abc']);
    expect(review.sections.get('vlo_abc')).toEqual([
      {
        original: 'Mira finds the ledger.',
        changes: [
          { kind: 'delete', from: 0, to: 5, ...ANA },
          // A reply on the same words joins its comment, with its author's name.
          {
            kind: 'comment',
            from: 15,
            to: 21,
            id: '1',
            text: 'Which ledger?\nBen Ode: The blue one.',
            ...ANA,
          },
          // The two runs of one insert are one change.
          { kind: 'insert', at: 21, text: ' at dawn', ...ANA },
        ],
      },
      {
        original: 'It is cold.',
        changes: [{ kind: 'comment', from: 0, to: 11, id: '3', text: 'Show it.', ...ANA }],
      },
      { original: '', changes: [{ kind: 'insert', at: 0, text: 'She runs.', ...ANA }] },
    ]);
  });

  test('a comment over two paragraphs, a footnote, a drop cap and an equation keep their offsets', async () => {
    const zip = await JSZip.loadAsync(await reviewedDocx('vlo_abc'));
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
    zip.file(
      'word/document.xml',
      `<w:document ${W} ${M}><w:body>
<w:p><w:pPr><w:framePr w:dropCap="drop" w:lines="3"/></w:pPr><w:bookmarkStart w:id="0" w:name="vlo_abc"/><w:r><w:t>O</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">ne </w:t></w:r><w:commentRangeStart w:id="1"/><w:r><w:t>two</w:t><w:footnoteReference w:id="2"/></w:r></w:p>
<w:p><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath><w:r><w:t xml:space="preserve"> three</w:t></w:r><w:commentRangeEnd w:id="1"/></w:p>
</w:body></w:document>`,
    );
    const review = await readReview(await zip.generateAsync({ type: 'uint8array' }));
    const comment = { kind: 'comment', id: '1', text: 'Which ledger?' };
    expect(review.sections.get('vlo_abc')).toMatchObject([
      { original: `One two${NODE_MARK}`, changes: [{ ...comment, from: 4, to: 8 }] },
      { original: `${NODE_MARK} three`, changes: [{ ...comment, from: 0, to: 7 }] },
    ]);
  });

  test('a file with no Vlo bookmark is foreign, and a file that is not Word fails', async () => {
    expect((await readReview(await reviewedDocx(null))).foreign).toBe(true);
    await expect(readReview(new TextEncoder().encode('plain text'))).rejects.toThrow(ImportError);
  });
});
