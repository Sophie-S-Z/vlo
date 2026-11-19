/*
 * Parts of speech in the text (Phase 19, Task D5). Pure functions, so the worker and the tests share them.
 * The tagger (wink-pos-tagger) gives each word a Penn Treebank tag, and five kinds of word get a color.
 */

export type PosKind = 'noun' | 'verb' | 'adjective' | 'adverb' | 'conjunction';

/** The kinds in legend order, each with its name and its line shape for writers who do not see color. */
export const POS_KINDS: readonly { id: PosKind; label: string; line: string }[] = [
  { id: 'noun', label: 'Nouns', line: 'solid line' },
  { id: 'verb', label: 'Verbs', line: 'double line' },
  { id: 'adjective', label: 'Adjectives', line: 'wavy line' },
  { id: 'adverb', label: 'Adverbs', line: 'dotted line' },
  { id: 'conjunction', label: 'Conjunctions', line: 'dashed line' },
];

export interface PosMark {
  /** The word's place in the block's text. */
  from: number;
  to: number;
  kind: PosKind;
}

/** A word from the tagger: its text, its tag and whether it is a word or a mark. */
export interface TaggedToken {
  value: string;
  pos: string;
  tag: string;
}

/** The kind of a Penn Treebank tag, or null for a kind that gets no color. */
export function kindOf(pos: string): PosKind | null {
  if (pos.startsWith('NN')) return 'noun';
  if (pos.startsWith('VB') || pos === 'MD') return 'verb';
  if (pos.startsWith('JJ')) return 'adjective';
  if (pos.startsWith('RB') || pos === 'WRB') return 'adverb';
  if (pos === 'CC') return 'conjunction';
  return null;
}

/** The tagger reads straight apostrophes only. Each quote mark stays one character, so places hold. */
export function plainQuotes(text: string): string {
  return text.replace(/[‘’]/g, "'");
}

/**
 * The marks of the tagged words, at their places in the text. The tagger keeps the words in order, so each
 * one is found after the one before it. A piece such as "n't" or "'s" gets no mark of its own.
 */
export function marksOf(text: string, tokens: readonly TaggedToken[]): PosMark[] {
  // The tokens come from the text with straight quotes, so the search reads that text too.
  const plain = plainQuotes(text);
  const marks: PosMark[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const at = plain.indexOf(token.value, cursor);
    if (at === -1) continue;
    cursor = at + token.value.length;
    const kind = token.tag === 'word' && !token.value.includes("'") ? kindOf(token.pos) : null;
    if (kind) marks.push({ from: at, to: cursor, kind });
  }
  return marks;
}
