import { Extension, InputRule } from '@tiptap/core';
import { getWritingPrefs, type WritingPrefs } from '../writingPrefs';

/*
 * Text shortcuts and the typo list (Phase 19, Task D3). A shortcut runs when the writer ends a word with a
 * space or a punctuation mark, so a shortcut inside a longer word never runs. Backspace right after it
 * puts back what the writer typed, as smart punctuation does. The rule reads the settings at each word, so
 * a new shortcut works at once.
 */

/** The marks that end a word and run a shortcut. */
const TRIGGER = /^[\s.,;:!?)\]}"”’]$/u;
/** The last word before the trigger: it starts the line, or follows a space or an opening mark. */
const LAST_WORD = /(?<=^|[\s"“‘([{])[^\s"“‘([{]+$/u;
/** What may come just before a word. */
const WORD_START = /[\s"“‘([{]/u;

/** The writer's shortcut at the end of the text. It can hold an opening mark, such as "(c)". */
function ownShortcutAt(text: string, prefs: Pick<WritingPrefs, 'shortcuts'>): string | undefined {
  return prefs.shortcuts.find(({ on, from }) => {
    if (!on || !text.endsWith(from)) return false;
    const start = text.length - from.length;
    return start === 0 || WORD_START.test(text.charAt(start - 1));
  })?.from;
}

/** Common typos in English, each with its fix. A capital in the typo gives a capital in the fix. */
const TYPOS: Readonly<Record<string, string>> = {
  abotu: 'about',
  accomodate: 'accommodate',
  acheive: 'achieve',
  acommodate: 'accommodate',
  adn: 'and',
  agian: 'again',
  alot: 'a lot',
  alwasy: 'always',
  aroudn: 'around',
  becasue: 'because',
  beacuse: 'because',
  becuase: 'because',
  beleive: 'believe',
  calender: 'calendar',
  comming: 'coming',
  definately: 'definitely',
  didnt: 'didn’t',
  doesnt: 'doesn’t',
  dont: 'don’t',
  existance: 'existence',
  freind: 'friend',
  goign: 'going',
  hadnt: 'hadn’t',
  hasnt: 'hasn’t',
  havent: 'haven’t',
  hte: 'the',
  isnt: 'isn’t',
  jsut: 'just',
  knwo: 'know',
  liek: 'like',
  mkae: 'make',
  nad: 'and',
  noone: 'no one',
  occured: 'occurred',
  occurence: 'occurrence',
  peice: 'piece',
  recieve: 'receive',
  recieved: 'received',
  seperate: 'separate',
  shoudl: 'should',
  shouldnt: 'shouldn’t',
  siad: 'said',
  somthing: 'something',
  taht: 'that',
  teh: 'the',
  thier: 'their',
  thign: 'thing',
  thna: 'than',
  tihs: 'this',
  tommorow: 'tomorrow',
  tomorow: 'tomorrow',
  truely: 'truly',
  untill: 'until',
  wasnt: 'wasn’t',
  waht: 'what',
  wehn: 'when',
  werent: 'weren’t',
  whcih: 'which',
  wierd: 'weird',
  wiht: 'with',
  woudl: 'would',
  wouldnt: 'wouldn’t',
  yoru: 'your',
};

/** The fix in the case of the typo: "Teh" gives "The", and "TEH" gives "THE". */
function inCase(typo: string, fix: string): string {
  if (typo.length > 1 && typo === typo.toUpperCase()) return fix.toUpperCase();
  const first = typo.charAt(0);
  return first !== first.toLowerCase() ? fix.charAt(0).toUpperCase() + fix.slice(1) : fix;
}

interface Options {
  /** The typo list is English, so only an English prose item gets it. */
  typos: boolean;
  /** A typo fix gets a curly apostrophe while smart punctuation is on, else a straight one. */
  curly: boolean;
}

/** The text that the last word gets, or null when no shortcut or typo matches it. */
export function shortcutFor(
  word: string,
  prefs: Pick<WritingPrefs, 'shortcuts' | 'typoFixes'>,
  { typos, curly }: Options,
): string | null {
  const own = prefs.shortcuts.find((s) => s.on && s.from === word);
  if (own) return own.to;
  if (!typos || !prefs.typoFixes) return null;
  const key = word.toLowerCase();
  // Only the list's own keys: "constructor" is not a typo.
  if (!Object.hasOwn(TYPOS, key)) return null;
  const fix = TYPOS[key] ?? '';
  return inCase(word, curly ? fix : fix.replaceAll('’', "'"));
}

export const TextShortcuts = Extension.create<Options>({
  name: 'textShortcuts',

  addOptions() {
    return { typos: true, curly: true };
  },

  addInputRules() {
    const options = this.options;
    return [
      new InputRule({
        find: (text) => {
          if (!TRIGGER.test(text.slice(-1))) return null;
          const before = text.slice(0, -1);
          const prefs = getWritingPrefs();
          const word = ownShortcutAt(before, prefs) ?? LAST_WORD.exec(before)?.[0];
          if (word === undefined) return null;
          const replacement = shortcutFor(word, prefs, options);
          if (replacement === null) return null;
          return {
            index: text.length - word.length - 1,
            text: word + text.slice(-1),
            data: { word, replacement },
          };
        },
        handler: ({ state, range, match }) => {
          const { word, replacement } = match.data as { word: string; replacement: string };
          state.tr.insertText(replacement, range.from, range.from + word.length);
        },
      }),
    ];
  },
});
