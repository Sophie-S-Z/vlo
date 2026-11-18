import { localStore, useLocalStore } from '@/app/localStore';
import { ignoreKey } from './lints';

/*
 * The writer's spelling and grammar settings on this device (Phase 19, Task D1): the switch, the personal
 * dictionary, the rules that the writer turned off, and the marks that the writer ignored in each item.
 * None of them goes in an export, a share or an AI request.
 */

export interface GrammarPrefs {
  /** Off until the writer asks, because the first check downloads Harper (about 8 MB). */
  on: boolean;
  /** The personal dictionary, in the order the writer added the words. */
  words: readonly string[];
  /** Harper's rules that the writer turned off. */
  offRules: readonly string[];
  /** For each item, the `ignoreKey` of each ignored mark. */
  ignored: Readonly<Record<string, readonly string[]>>;
}

export const MAX_WORD = 64;
const MAX_WORDS = 5000;
const MAX_IGNORED = 500;

function strings(value: unknown, max: number, longest: number): string[] {
  if (!Array.isArray(value)) return [];
  const clean = value.filter((v): v is string => typeof v === 'string' && v !== '' && v.length <= longest);
  return [...new Set(clean)].slice(-max);
}

function cleanPrefs(value: unknown): GrammarPrefs {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const ignored: Record<string, string[]> = {};
  if (raw.ignored && typeof raw.ignored === 'object')
    for (const [itemId, keys] of Object.entries(raw.ignored as Record<string, unknown>)) {
      const list = strings(keys, MAX_IGNORED, 1000);
      if (list.length > 0) ignored[itemId] = list;
    }
  return {
    on: raw.on === true,
    words: strings(raw.words, MAX_WORDS, MAX_WORD),
    offRules: strings(raw.offRules, 2000, 200),
    ignored,
  };
}

const store = localStore('vlo:grammar', cleanPrefs);

export const getGrammarPrefs = store.get;
export const subscribeGrammarPrefs = store.subscribe;

function set(change: Partial<GrammarPrefs>): void {
  store.set({ ...store.get(), ...change });
}

export function setGrammarOn(on: boolean): void {
  set({ on });
}

/** Adds a word to the personal dictionary. False for an empty or long word. */
export function addWord(word: string): boolean {
  const clean = word.trim();
  if (clean === '' || clean.length > MAX_WORD || /\s/.test(clean)) return false;
  const { words } = store.get();
  if (!words.includes(clean)) set({ words: [...words, clean].slice(-MAX_WORDS) });
  return true;
}

export function removeWord(word: string): void {
  set({ words: store.get().words.filter((w) => w !== word) });
}

export function setRuleOn(rule: string, on: boolean): void {
  const others = store.get().offRules.filter((r) => r !== rule);
  set({ offRules: on ? others : [...others, rule] });
}

/** Keeps the rule off for these words in the item. */
export function ignoreMark(itemId: string, rule: string, words: string): void {
  const key = ignoreKey(rule, words);
  const { ignored } = store.get();
  const list = ignored[itemId] ?? [];
  if (list.includes(key)) return;
  set({ ignored: { ...ignored, [itemId]: [...list, key].slice(-MAX_IGNORED) } });
}

export function useGrammarPrefs(): GrammarPrefs {
  return useLocalStore(store);
}
