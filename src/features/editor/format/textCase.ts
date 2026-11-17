/*
 * Change case (Phase 19, Task B2). Each rule maps a text to a text of the same characters in a new case,
 * one character at a time, so each character keeps its marks. The language sets the case of each letter,
 * so a Turkish "i" becomes "İ".
 */

export const TEXT_CASES = ['upper', 'lower', 'title', 'sentence'] as const;
export type TextCase = (typeof TEXT_CASES)[number];

/**
 * English words that stay in lowercase inside a title, as in the Chicago and MLA styles: articles,
 * coordinating conjunctions and short prepositions. The first and the last word always take a capital.
 */
const SHORT_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'so',
  'yet',
  'as',
  'at',
  'by',
  'in',
  'of',
  'off',
  'on',
  'per',
  'to',
  'up',
  'via',
  'from',
  'into',
  'onto',
  'over',
  'with',
]);

const WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*/gu;
/** The text before a sentence: a ".", "!" or "?", its closing quotes, a space, and any opening quotes. */
const SENTENCE_END = /[.!?]['"’”)\]]*\s+['"‘“([]*$/u;
const LETTER = /[\p{L}\p{N}]/u;

/** The positions in `text` of the characters that take a capital in title case. */
function titleStarts(text: string, english: boolean): Set<number> {
  const words = [...text.matchAll(WORD)];
  const starts = new Set<number>();
  words.forEach((word, i) => {
    const short = english && i > 0 && i < words.length - 1 && SHORT_WORDS.has(word[0].toLowerCase());
    if (!short) starts.add(word.index);
  });
  return starts;
}

/** The positions in `text` of the first letter of each sentence. */
function sentenceStarts(text: string): Set<number> {
  const starts = new Set<number>();
  for (const word of text.matchAll(WORD)) {
    const before = text.slice(0, word.index);
    if (!LETTER.test(before) || SENTENCE_END.test(before)) starts.add(word.index);
  }
  return starts;
}

/**
 * The text in the case, as one string per character of `text`. A character can become two, as "ß" becomes
 * "SS", so the caller rebuilds each run of text from its own characters.
 */
export function caseCharacters(text: string, rule: TextCase, language = 'en'): string[] {
  // Case maps one code point at a time, so the list holds code points.
  const chars = Array.from(text);
  const upper = (c: string) => c.toLocaleUpperCase(language);
  const lower = (c: string) => c.toLocaleLowerCase(language);
  if (rule === 'upper') return chars.map(upper);
  if (rule === 'lower') return chars.map(lower);
  const starts = rule === 'title' ? titleStarts(text, language.split('-')[0] === 'en') : sentenceStarts(text);
  // The positions of the rules count UTF-16 units, and `chars` counts code points.
  let at = 0;
  return chars.map((c) => {
    const start = starts.has(at);
    at += c.length;
    return start ? upper(c) : lower(c);
  });
}

/** The text in the case. */
export function changeCase(text: string, rule: TextCase, language?: string): string {
  return caseCharacters(text, rule, language).join('');
}

/**
 * The case that Shift-F3 gives next, as in Word: UPPERCASE, lowercase, Title Case, Sentence case, and
 * round again. The step goes past each case that would not change the text.
 */
export function nextCase(text: string, language?: string): TextCase {
  const now = TEXT_CASES.findIndex((rule) => changeCase(text, rule, language) === text);
  for (let step = 1; step <= TEXT_CASES.length; step += 1) {
    const rule = TEXT_CASES[(now + step) % TEXT_CASES.length] ?? 'upper';
    if (changeCase(text, rule, language) !== text) return rule;
  }
  return 'upper';
}
