import { withoutNotes } from '@/features/editor/format/notes';
import type { Item, ItemText } from './db';

// One segmenter for every language: the count rule, not the dictionary, differs between languages.
let segmenter: Intl.Segmenter | undefined;

export type CountUnit = 'words' | 'characters';

/** Chinese and Japanese writing counts characters (roadmap F38). Every other language counts words. */
export function countUnit(language: string | undefined): CountUnit {
  const base = language?.split('-')[0];
  return base === 'zh' || base === 'ja' ? 'characters' : 'words';
}

// Han, hiragana and katakana, with the marks that go with them, such as ー and 々.
const CJK = /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]/gu;

// A web address or an email address is one word, as in Word, Scrivener and Google Docs. Chinese and
// Japanese put no space around an address, so a Han or kana character, or CJK or full-width punctuation
// such as 。 or ），ends it.
const NOT_IN_ADDRESS = String.raw`\s\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\u3000-\u303f\uff00-\uffef`;
const ADDRESS = new RegExp(
  String.raw`\b(?:https?:\/\/|www\.)[^${NOT_IN_ADDRESS}]+|[^${NOT_IN_ADDRESS}@]+@[^${NOT_IN_ADDRESS}@]+\.[^${NOT_IN_ADDRESS}@]+`,
  'giu',
);
// A hyphen or a slash between two letters or digits joins them into one word: "well-known", "and/or".
// A double hyphen or a dash with spaces still splits, because it stands for a dash.
const JOINER = /(?<=[\p{L}\p{N}\p{M}])[-\u2010\u2011/](?=[\p{L}\p{N}])/gu;
// A time such as 10:30 is one word.
const TIME = /(?<=\d):(?=\d)/gu;

/**
 * The count rule (Ellipsus comparison, October 2026). Rule 2 counts "state-of-the-art", "and/or", a web
 * address and a time as one word each, as Word and Scrivener do. An em dash between two words still
 * splits them. A change of rule counts every item again (database version 14 and a backup import).
 */
export const COUNT_RULE = 2;

/** The text with each address as one plain word and each joined word as one run of letters. */
function joined(text: string): string {
  return text.replace(ADDRESS, 'address').replace(JOINER, '').replace(TIME, '');
}

/**
 * Counts word-like segments (VLO_SPEC section 5). In Chinese and Japanese writing, each Han or kana
 * character counts as one unit, and a word in another script counts as one.
 */
export function countWords(text: string, language?: string): number {
  const characters = countUnit(language) === 'characters';
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' });
  let count = 0;
  for (const { segment, isWordLike } of segmenter.segment(joined(text))) {
    if (!isWordLike) continue;
    if (!characters) {
      count += 1;
      continue;
    }
    const cjk = segment.match(CJK)?.length ?? 0;
    count += cjk + (segment.replace(CJK, '') === '' ? 0 : 1);
  }
  return count;
}

/** Counts lines that hold any non-space text, as poem line counts do. */
export function countLines(text: string): number {
  let count = 0;
  for (const line of text.split('\n')) if (line.trim() !== '') count += 1;
  return count;
}

/** The items with each count made again from its stored text, in the unit of the language (F38). */
export function recountItems(
  items: readonly Item[],
  texts: readonly ItemText[],
  language: string | undefined,
): Item[] {
  const byItem = new Map(texts.map((t) => [t.itemId, t.text]));
  return items.map((item) => {
    const text = byItem.get(item.id);
    return text === undefined ? item : { ...item, wordCount: countWords(withoutNotes(text), language) };
  });
}
