import { INTENSIFIERS, phrasePattern } from './ai/tells';
import { LONG_SENTENCE, STOP_WORDS } from './stats';
import type { StyleRule } from '@/lib/db';
import { plainChars, sentencesOf, wordsOf, type Span } from './text';

/*
 * The style check (roadmap F47, plan Task H4). It finds repeated words, filler words, cliches and long
 * sentences in one paragraph or poem line, and the forms that a series style sheet avoids (F59). Pure, so
 * the tests and the editor share it. The word lists are English, so the editor runs the check only in
 * English projects.
 */

export type StyleKind = 'repeat' | 'filler' | 'cliche' | 'long' | 'sheet';

export interface StyleNote extends Span {
  kind: StyleKind;
  /** The form that the style sheet asks for, on a 'sheet' note. */
  use?: string;
}

/** Finds the forms that a style sheet avoids in a text, whole words in any case. */
export type SheetMatcher = (text: string) => StyleNote[];

export function sheetMatcher(rules: readonly StyleRule[]): SheetMatcher {
  const useOf = new Map<string, string>();
  for (const rule of rules)
    for (const form of rule.avoid)
      if (!useOf.has(form.toLowerCase())) useOf.set(form.toLowerCase(), rule.use);
  if (useOf.size === 0) return () => [];
  const pattern = phrasePattern([...useOf.keys()]);
  return (text) =>
    matches(pattern, text, 'sheet').flatMap((note) => {
      const use = useOf.get(text.slice(note.from, note.to).toLowerCase());
      return use === undefined ? [] : [{ ...note, use }];
    });
}

/** A word that comes back within this many words is a repeat. */
export const REPEAT_WINDOW = 50;

const FILLER = phrasePattern([
  ...INTENSIFIERS,
  'very',
  'really',
  'just',
  'quite',
  'actually',
  'basically',
  'literally',
  'totally',
  'simply',
  'pretty much',
]);

const CLICHES = phrasePattern([
  'at the end of the day',
  'avoid it like the plague',
  'better late than never',
  'busy as a bee',
  'calm before the storm',
  'cold as ice',
  'dead as a doornail',
  'easier said than done',
  'every cloud has a silver lining',
  'few and far between',
  'fit as a fiddle',
  'in the nick of time',
  'it goes without saying',
  'last but not least',
  'light as a feather',
  'little did she know',
  'little did he know',
  'little did they know',
  'only time will tell',
  'plenty of fish in the sea',
  'quiet as a mouse',
  'read between the lines',
  'sick as a dog',
  'think outside the box',
  'time heals all wounds',
  'tip of the iceberg',
  'when all is said and done',
  'without a doubt',
  'all of a sudden',
  'heart of gold',
  'in the blink of an eye',
  'needle in a haystack',
  'scared to death',
  'the writing on the wall',
  'like a deer in the headlights',
]);

function matches(pattern: RegExp, text: string, kind: StyleKind): StyleNote[] {
  const found: StyleNote[] = [];
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    found.push({ from: match.index, to: match.index + match[0].length, kind });
  }
  return found;
}

/**
 * The style notes of one paragraph or poem line, in text order. A stop word, a word under 3 letters and a
 * word with a capital letter, such as a name, never count as a repeat. A poem line has no long sentence.
 */
export function styleNotes(text: string, form: 'prose' | 'poem', sheet?: SheetMatcher): StyleNote[] {
  const plain = plainChars(text);
  const notes = [
    ...matches(FILLER, plain, 'filler'),
    ...matches(CLICHES, plain, 'cliche'),
    ...(sheet ? sheet(plain) : []),
  ];

  const lastSeen = new Map<string, number>();
  wordsOf(plain).forEach((word, index) => {
    if (word.text.length < 3 || word.text !== word.lower || STOP_WORDS.has(word.lower)) return;
    if (!/\p{L}/u.test(word.text)) return;
    const before = lastSeen.get(word.lower);
    if (before !== undefined && index - before <= REPEAT_WINDOW)
      notes.push({ from: word.from, to: word.to, kind: 'repeat' });
    lastSeen.set(word.lower, index);
  });

  if (form === 'prose')
    for (const sentence of sentencesOf(plain))
      if (sentence.words.length > LONG_SENTENCE)
        notes.push({ from: sentence.from, to: sentence.to, kind: 'long' });

  return notes.sort((a, b) => a.from - b.from || a.to - b.to);
}

/** Why the check marks these words, for the line under the toolbar. */
export function styleReason(kind: StyleKind, text: string, use = ''): string {
  switch (kind) {
    case 'sheet':
      return `The series style sheet uses "${use}" for "${text}".`;
    case 'repeat':
      return `"${text}" comes again within ${String(REPEAT_WINDOW)} words. Use another word, or keep it on purpose.`;
    case 'filler':
      return `"${text}" adds little. Remove it, or use a stronger word.`;
    case 'cliche':
      return `"${text}" is a cliche. Say it in your own words.`;
    case 'long':
      return `This sentence has ${String(wordsOf(text).length)} words. Two sentences can be easier to read.`;
  }
}
