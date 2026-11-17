import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { getCodex, subscribeCodex } from '@/features/codex/codexStore';
import { checkInWorker } from '@/features/grammar/grammarClient';
import { getGrammarPrefs, subscribeGrammarPrefs, type GrammarPrefs } from '@/features/grammar/grammarPrefs';
import { dialectOf, ignoreKey, type GrammarLint } from '@/features/grammar/lints';
import { getNames, subscribeNames } from '@/features/people/nameStore';
import { blockText } from './blockScan';

/*
 * Spelling and grammar in the text (Phase 19, Task D1). Harper checks each paragraph in a worker, after a
 * pause in typing, and only in the blocks on the screen and two screens above and below it. A result
 * belongs to the paragraph node that the worker read, so an edit during the check never moves a mark to the
 * wrong words: a changed paragraph is a new node, and it gets a new check at the next pause. The marks are
 * decorations, so they never reach the document, an export or a share.
 */

/** The marks show after this pause in typing. */
export const GRAMMAR_PAUSE_MS = 1500;
/** A scroll checks the new blocks after this pause. */
const SCROLL_PAUSE_MS = 300;
/** Harper's kinds that draw the spelling line. The others draw the grammar line. */
const SPELLING_KINDS = new Set(['Spelling', 'Typo']);
/** The screens above and below the window that the check reads. */
const SCREENS = 2;

interface GrammarState {
  on: boolean;
  decorations: DecorationSet;
}

/** "loading" until Harper is ready for the first check of the tab. */
export type GrammarStatus = 'idle' | 'loading' | 'failed';

interface GrammarSpec {
  lint: GrammarLint;
}

export const grammarKey = new PluginKey<GrammarState>('vloGrammar');

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

/** The ranges of the new document that the transaction changed. */
function changedRanges(tr: Transaction): [number, number][] {
  const ranges: [number, number][] = [];
  tr.mapping.maps.forEach((map, i) => {
    const after = tr.mapping.slice(i + 1);
    map.forEach((_oldFrom, _oldTo, from, to) => {
      ranges.push([after.map(from, -1), after.map(to, 1)]);
    });
  });
  return ranges;
}

/** The text blocks on the screen and the screens around it, in document order. */
function blocksNearView(view: EditorView): { node: ProseMirrorNode; pos: number }[] {
  const tops: { node: ProseMirrorNode; pos: number }[] = [];
  view.state.doc.forEach((node, pos) => tops.push({ node, pos }));
  const height = window.innerHeight;
  const above = -SCREENS * height;
  const below = (SCREENS + 1) * height;
  const rectOf = (i: number): DOMRect | null => {
    const top = tops[i];
    const dom = top ? view.nodeDOM(top.pos) : null;
    return dom instanceof Element ? dom.getBoundingClientRect() : null;
  };
  // The first block whose bottom is under the top edge, by a binary search on the blocks in page order.
  let low = 0;
  let high = tops.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const rect = rectOf(mid);
    if (rect && rect.bottom < above) low = mid + 1;
    else high = mid;
  }
  const found: { node: ProseMirrorNode; pos: number }[] = [];
  for (let i = low; i < tops.length; i++) {
    const rect = rectOf(i);
    if (rect && rect.top > below) break;
    const top = tops[i];
    if (!top) break;
    if (top.node.isTextblock) found.push(top);
    else
      top.node.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        found.push({ node, pos: top.pos + 1 + pos });
        return false;
      });
  }
  return found;
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
    // Each paragraph node keeps its marks from the worker until an edit makes a new node.
    const results = new WeakMap<ProseMirrorNode, GrammarLint[]>();
    const asked = new WeakSet<ProseMirrorNode>();

    const build = (doc: ProseMirrorNode): DecorationSet => {
      const keep = keeper(getGrammarPrefs(), itemId);
      const decorations: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        for (const lint of results.get(node) ?? []) {
          const from = pos + 1 + lint.from;
          const to = pos + 1 + lint.to;
          if (!keep(lint, node.textBetween(lint.from, lint.to, ' ', ' '))) continue;
          const kind = SPELLING_KINDS.has(lint.kind) ? 'vlo-spelling' : 'vlo-grammar';
          decorations.push(Decoration.inline(from, to, { class: kind }, { lint } satisfies GrammarSpec));
        }
        return false;
      });
      return DecorationSet.create(doc, decorations);
    };

    return [
      new Plugin<GrammarState>({
        key: grammarKey,
        state: {
          init: () => ({ on: getGrammarPrefs().on, decorations: DecorationSet.empty }),
          apply: (tr, value, _old, state) => {
            if (tr.getMeta(grammarKey) !== undefined) {
              const on = getGrammarPrefs().on;
              return { on, decorations: on ? build(state.doc) : DecorationSet.empty };
            }
            if (!tr.docChanged || !value.on) return value;
            // A mark on words that the writer changes goes away until the next check.
            let decorations = value.decorations.map(tr.mapping, tr.doc);
            for (const [from, to] of changedRanges(tr))
              decorations = decorations.remove(decorations.find(Math.max(0, from - 1), to + 1));
            return { on: true, decorations };
          },
        },
        props: {
          decorations: (state) => grammarKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
        view: (view) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const redraw = () => {
            if (!view.isDestroyed)
              view.dispatch(view.state.tr.setMeta(grammarKey, true).setMeta('addToHistory', false));
          };
          const check = () => {
            if (view.isDestroyed || !getGrammarPrefs().on) return;
            const blocks = blocksNearView(view).filter(({ node }) => !results.has(node) && !asked.has(node));
            if (blocks.length === 0) return;
            for (const { node } of blocks) asked.add(node);
            if (!loaded) setStatus('loading');
            checkInWorker(
              blocks.map(({ node }) => blockText(node)),
              dialect,
            ).then(
              (lints) => {
                loaded = true;
                setStatus('idle');
                blocks.forEach(({ node }, i) => results.set(node, lints[i] ?? []));
                redraw();
              },
              () => {
                // The blocks get another check at the next pause, such as after the device goes online.
                for (const { node } of blocks) asked.delete(node);
                setStatus('failed');
              },
            );
          };
          const later = (ms: number) => {
            clearTimeout(timer);
            timer = setTimeout(check, ms);
          };
          const onScroll = () => {
            if (getGrammarPrefs().on) later(SCROLL_PAUSE_MS);
          };
          let prefs = getGrammarPrefs();
          // The switch, the dictionary and the names live outside the editor. A change draws the marks again.
          const onOutside = () => {
            const next = getGrammarPrefs();
            const turnedOn = next.on && !prefs.on;
            prefs = next;
            redraw();
            if (turnedOn) later(0);
          };
          const stops = [subscribeGrammarPrefs(onOutside), subscribeCodex(redraw), subscribeNames(redraw)];
          window.addEventListener('scroll', onScroll, { capture: true, passive: true });
          if (prefs.on) later(GRAMMAR_PAUSE_MS);
          return {
            update: (next, previous) => {
              if (next.state.doc !== previous.doc && getGrammarPrefs().on) later(GRAMMAR_PAUSE_MS);
            },
            destroy: () => {
              clearTimeout(timer);
              window.removeEventListener('scroll', onScroll, { capture: true });
              for (const stop of stops) stop();
            },
          };
        },
      }),
    ];
  },
});
