/*
 * Spelling and grammar (Phase 19, Task D1): the parts of a check that the worker and the editor share.
 * Harper counts in Unicode code points, and the editor counts in UTF-16 units, so each offset goes through
 * `utf16Offsets` before it leaves the worker.
 */

/** One problem in the text of a block, with offsets in UTF-16 units. */
export interface GrammarLint {
  from: number;
  to: number;
  /** Harper's rule, such as "SpellCheck". "Turn off" and "Ignore" name it. */
  rule: string;
  /** The kind of problem for people, such as "Spelling". */
  kind: string;
  message: string;
  /** The text that each fix puts in place of the problem. An empty text deletes it. */
  fixes: string[];
}

/** The placeholder of `blockText` for a footnote, an equation or an image in the line. */
export const OBJECT = '￼';

/** The most fixes that a mark offers. */
const MAX_FIXES = 3;

/** The UTF-16 offset of each code point index in the text, and one more for the end. */
export function utf16Offsets(text: string): number[] {
  const offsets: number[] = [];
  let at = 0;
  for (const char of text) {
    offsets.push(at);
    at += char.length;
  }
  offsets.push(at);
  return offsets;
}

/** Fixes in order, with no repeats and no fix that keeps the problem. */
export function cleanFixes(problem: string, fixes: readonly string[]): string[] {
  return [...new Set(fixes)].filter((fix) => fix !== problem).slice(0, MAX_FIXES);
}

/** A rule's name for people: "SentenceCapitalization" gives "Sentence capitalization". */
export function ruleLabel(rule: string): string {
  const words = rule
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(' ');
  return words.map((word, i) => (i === 0 || /^[A-Z]{2,}$/.test(word) ? word : word.toLowerCase())).join(' ');
}

/** The key of an "Ignore": the rule and the words. */
export function ignoreKey(rule: string, words: string): string {
  return `${rule}\u0000${words}`;
}

/** Harper's dialect for a project language, by its number in Harper's `Dialect`. US English is the default. */
export function dialectOf(language: string | undefined): number {
  const region = (language ?? '').split('-')[1]?.toUpperCase();
  return { GB: 1, IE: 1, NZ: 1, AU: 2, CA: 3, IN: 4 }[region ?? ''] ?? 0;
}
