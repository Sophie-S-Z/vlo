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

/**
 * Counts word-like segments (VLO_SPEC section 5). In Chinese and Japanese writing, each Han or kana
 * character counts as one unit, and a word in another script counts as one.
 */
export function countWords(text: string, language?: string): number {
  const characters = countUnit(language) === 'characters';
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' });
  let count = 0;
  for (const { segment, isWordLike } of segmenter.segment(text)) {
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
