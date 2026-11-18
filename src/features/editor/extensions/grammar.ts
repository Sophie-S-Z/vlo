import { Extension } from '@tiptap/core';
import { PluginKey, type EditorState } from '@tiptap/pm/state';
import { getCodex, subscribeCodex } from '@/features/codex/codexStore';
import { checkInWorker } from '@/features/grammar/grammarClient';
import { getGrammarPrefs, subscribeGrammarPrefs, type GrammarPrefs } from '@/features/grammar/grammarPrefs';
import { dialectOf, ignoreKey, type GrammarLint } from '@/features/grammar/lints';
import { getNames, subscribeNames } from '@/features/people/nameStore';
import { blockCheckPlugin, type BlockCheckState } from './blockChecks';

/*
 * Spelling and grammar in the text (Phase 19, Task D1). Harper checks each paragraph near the screen in a
 * worker, after a pause in typing (blockChecks.ts). The writer's dictionary, the Codex names and the
 * people's names, the rules that are off and the ignored marks hide marks at each redraw.
 */

/** The marks show after this pause in typing. */
export const GRAMMAR_PAUSE_MS = 1500;
/** Harper's kinds that draw the spelling line. The others draw the grammar line. */
const SPELLING_KINDS = new Set(['Spelling', 'Typo']);
/** "loading" until Harper is ready for the first check of the tab. */
export type GrammarStatus = 'idle' | 'loading' | 'failed';

interface GrammarSpec {
  lint: GrammarLint;
}

const grammarKey = new PluginKey<BlockCheckState>('vloGrammar');

/** True when this editor can check spelling and grammar: an English prose item. */
export function canCheckGrammar(state: EditorState): boolean {
  return grammarKey.getState(state) !== undefined;
}

/** The mark at the cursor, with its words and range, or null. */
export function grammarLintAt(state: EditorState): { lint: GrammarLint; from: number; to: number } | null {
  const value = grammarKey.getState(state);
  if (!value?.on) return null;
  const { from, to } = state.selection;
  const found = value.decorations.find(from, to).find((d) => d.from <= from && d.to >= to);
  return found ? { lint: (found.spec as GrammarSpec).lint, from: found.from, to: found.to } : null;
}

/** The words of a name list, each in lower case. */
function wordsOf(names: Iterable<string>): Set<string> {
  const words = new Set<string>();
  for (const name of names)
    for (const [word] of name.matchAll(/[\p{L}\p{N}'’-]+/gu)) words.add(word.toLowerCase());
  return words;
}

/** A word without its possessive ending, so "Mira's" is a known word when "Mira" is. */
const bare = (word: string) => word.toLowerCase().replace(/['’]s$/, '');

/** The marks that the writer wants: no rule that is off, no ignored mark, no known word. */
function keeper(
  prefs: GrammarPrefs,
  itemId: string | undefined,
): (lint: GrammarLint, words: string) => boolean {
  const codex = getCodex().entries.flatMap((e) => [e.name, ...e.aliases]);
  const people = getNames().people.flatMap((p) => [p.label, ...p.variants.flatMap((v) => [v.real, v.alias])]);
  const known = wordsOf([...prefs.words, ...codex, ...people]);
  const off = new Set(prefs.offRules);
  const ignored = new Set(itemId === undefined ? [] : (prefs.ignored[itemId] ?? []));
  return (lint, words) =>
    !off.has(lint.rule) &&
    !ignored.has(ignoreKey(lint.rule, words)) &&
    !(lint.kind === 'Spelling' && known.has(bare(words)));
}

let status: GrammarStatus = 'idle';
/** True after the first check of the tab, when Harper is in memory. */
let loaded = false;
const statusListeners = new Set<() => void>();

function setStatus(next: GrammarStatus): void {
  if (next === status) return;
  status = next;
  for (const listener of statusListeners) listener();
}

/** Whether the first check is still loading Harper, or failed to load it. */
export function getGrammarStatus(): GrammarStatus {
  return status;
}

export function subscribeGrammarStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export const GrammarCheck = Extension.create<{ itemId: string | undefined; language: string | undefined }>({
  name: 'grammarCheck',

  addOptions() {
    return { itemId: undefined, language: undefined };
  },

  addProseMirrorPlugins() {
    const { itemId, language } = this.options;
    const dialect = dialectOf(language);
    return [
      blockCheckPlugin<GrammarLint>({
        key: grammarKey,
        isOn: () => getGrammarPrefs().on,
        pauseMs: GRAMMAR_PAUSE_MS,
        run: (blocks) => checkInWorker(blocks, dialect),
        drawer: () => {
          const keep = keeper(getGrammarPrefs(), itemId);
          return (lint, words) =>
            keep(lint, words)
              ? {
                  attrs: { class: SPELLING_KINDS.has(lint.kind) ? 'vlo-spelling' : 'vlo-grammar' },
                  spec: { lint } satisfies GrammarSpec,
                }
              : null;
        },
        sources: [subscribeGrammarPrefs, subscribeCodex, subscribeNames],
        onRun: () => {
          if (!loaded) setStatus('loading');
        },
        onDone: (ok) => {
          loaded ||= ok;
          setStatus(ok ? 'idle' : 'failed');
        },
      }),
    ];
  },
});
