import type { Span } from '../text';

/*
 * Text tricks that hide copied or generated text from a checker, as Turnitin's "flags" report them:
 * invisible characters, letters from another alphabet that look like Latin letters (such as Cyrillic "а"
 * for "a"), and odd space characters. Each one is a place in the text, so the report can mark it.
 */

export type FlagKind = 'invisible' | 'lookalike' | 'space';

export interface IntegrityFlag extends Span {
  kind: FlagKind;
  /** The characters, as code points such as "U+200B". */
  detail: string;
}

export const FLAG_INFO: Readonly<Record<FlagKind, { label: string; advice: string }>> = {
  invisible: {
    label: 'Invisible characters',
    advice: 'Text pasted from some tools holds characters that you cannot see. Delete them.',
  },
  lookalike: {
    label: 'Letters from another alphabet inside a word',
    advice:
      'A word mixes Latin letters with Cyrillic or Greek letters that look the same. Type the word again.',
  },
  space: {
    label: 'Unusual space characters',
    advice: 'Replace the space with a normal space.',
  },
};

/** Zero-width characters, the soft hyphen, word joiners, direction controls and tag characters. */
const INVISIBLE =
  /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu;
/** Spaces other than the normal space, the tab and the no-break space that smart punctuation can type. */
const SPACE = /[\u2000-\u2006\u2008-\u200A\u205F\u3000]/g;
const WORD = /[\p{L}\p{M}]+/gu;
const LATIN = /\p{Script=Latin}/u;
const OTHER = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

const codes = (text: string) =>
  Array.from(text, (char) => char)
    .map((char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ');

export function integrityFlags(text: string): IntegrityFlag[] {
  const found: IntegrityFlag[] = [];
  for (const match of text.matchAll(INVISIBLE))
    found.push({
      kind: 'invisible',
      from: match.index,
      to: match.index + match[0].length,
      detail: codes(match[0]),
    });
  for (const match of text.matchAll(SPACE))
    found.push({
      kind: 'space',
      from: match.index,
      to: match.index + match[0].length,
      detail: codes(match[0]),
    });
  for (const match of text.matchAll(WORD)) {
    const word = match[0];
    if (!LATIN.test(word) || !OTHER.test(word)) continue;
    const odd = Array.from(word, (char) => char)
      .filter((char) => OTHER.test(char))
      .join('');
    found.push({ kind: 'lookalike', from: match.index, to: match.index + word.length, detail: codes(odd) });
  }
  return found.sort((a, b) => a.from - b.from);
}
