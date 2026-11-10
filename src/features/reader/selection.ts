import { MAX_QUOTE } from '@/features/share/bundle';

/*
 * The words that a reader selects in the reader view (F50, decision R4). A comment on words holds them
 * with their offsets in the block's text (`textOfBlock`), so the quote is always the text at the offsets.
 */

export interface PickedWords {
  quote: string;
  start: number;
  end: number;
}

export interface Picked extends PickedWords {
  /** The place of the block, such as "0:3". */
  place: string;
}

const squash = (text: string) => text.replace(/\s+/g, ' ');

/**
 * The offsets of `words` in `text`, at the occurrence `nth` (from 0) or the last one before it. At most
 * MAX_QUOTE characters, and never half a character. Null when the words are not in the text.
 */
export function wordsAt(text: string, words: string, nth: number): PickedWords | null {
  const want = squash(words).trim();
  if (want === '') return null;
  let start = -1;
  for (let i = 0; i <= nth; i++) {
    const next = text.indexOf(want, start + 1);
    if (next === -1) break;
    start = next;
  }
  if (start === -1) return null;
  let end = start + Math.min(want.length, MAX_QUOTE);
  if (end < start + want.length && /[\uD800-\uDBFF]/.test(text.charAt(end - 1))) end -= 1;
  return { quote: text.slice(start, end), start, end };
}

/** How many times `words` starts in `text` before the index `before`. */
function countBefore(text: string, words: string, before: number): number {
  let count = 0;
  for (let at = text.indexOf(words); at !== -1 && at < before; at = text.indexOf(words, at + 1)) count += 1;
  return count;
}

const blockOf = (node: Node) =>
  (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('[data-place]') ?? null;

/**
 * The selected words when the selection is in one block, or null. `textAt` gives the text of a block by
 * its place. The page shows footnote numbers and equations that the block's text lacks, so Vlo counts
 * which occurrence of the words the reader selected and finds that one in the block's text.
 */
export function pickedWords(
  selection: Selection | null,
  textAt: (place: string) => string | undefined,
): Picked | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const block = blockOf(range.startContainer);
  if (!block || block !== blockOf(range.endContainer)) return null;
  const place = block.dataset.place ?? '';
  const text = textAt(place);
  if (text === undefined) return null;
  const words = squash(range.toString()).trim();
  const before = document.createRange();
  before.setStart(block, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const shown = squash(block.textContent).trimStart();
  const nth = countBefore(shown, words, squash(before.toString()).trimStart().length);
  const picked = wordsAt(text, words, nth);
  return picked ? { place, ...picked } : null;
}
