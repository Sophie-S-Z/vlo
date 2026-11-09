import { describe, expect, test } from 'vitest';
import { pickedWords, wordsAt } from '@/features/reader/selection';

/* Plan Task I4 (F50, decision R4): a reader's selected words, as offsets in the block's text. */

const TEXT = 'The gulls slept. The gulls woke.';

describe('wordsAt', () => {
  test('gives the offsets of the occurrence that the reader picked', () => {
    expect(wordsAt(TEXT, 'The gulls', 0)).toEqual({ quote: 'The gulls', start: 0, end: 9 });
    expect(wordsAt(TEXT, ' The  gulls ', 1)).toEqual({ quote: 'The gulls', start: 17, end: 26 });
    // An occurrence past the last one takes the last one.
    expect(wordsAt(TEXT, 'The gulls', 5)?.start).toBe(17);
    expect(wordsAt(TEXT, 'The cats', 0)).toBeNull();
    expect(wordsAt(TEXT, '  ', 0)).toBeNull();
  });

  test('keeps at most 200 characters, and never half a character', () => {
    const long = 'a'.repeat(199) + '😀'.repeat(10);
    const picked = wordsAt(long, long, 0);
    expect(picked?.end).toBe(199);
    expect(picked?.quote).toBe('a'.repeat(199));
    expect(wordsAt('b'.repeat(300), 'b'.repeat(300), 0)?.quote).toHaveLength(200);
  });
});

test('pickedWords reads a selection in one block, and the second of two equal phrases', () => {
  document.body.innerHTML = `<div data-place="0:1"><p>The gulls slept.<sup>1</sup> The gulls woke.</p></div>
<div data-place="0:2"><p>Night.</p></div>`;
  const [first, second] = Array.from(document.querySelectorAll('p'));
  const text = (first?.childNodes[2] as Text | undefined) ?? new Text();
  const selection = document.getSelection();
  selection?.setBaseAndExtent(text, 1, text, 10);
  expect(pickedWords(selection, (place) => (place === '0:1' ? TEXT : undefined))).toEqual({
    place: '0:1',
    quote: 'The gulls',
    start: 17,
    end: 26,
  });
  // A selection over two blocks has no single place.
  selection?.setBaseAndExtent(text, 1, second?.firstChild ?? text, 3);
  expect(pickedWords(selection, () => TEXT)).toBeNull();
  selection?.removeAllRanges();
  expect(pickedWords(selection, () => TEXT)).toBeNull();
});
