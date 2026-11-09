import { Extension, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { yUndoPluginKey } from '@tiptap/y-tiptap';
import { blockText, NODE_MARK } from '../textMap';

/*
 * Find and replace (plan E1). The plugin keeps the search, its matches and the current match, and marks
 * them with decorations. A match stays inside one paragraph or one poem line. Equations, footnote markers
 * and other inline nodes break a match, so a replacement never changes them.
 */

export interface FindQuery {
  text: string;
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface FindMatch {
  from: number;
  to: number;
}

export interface FindState {
  query: FindQuery;
  matches: readonly FindMatch[];
  /** The index of the current match, or -1 when there is none. */
  current: number;
  decorations: DecorationSet;
}

/** More matches than this are not marked or counted, so a one-letter search stays fast. */
export const MAX_MATCHES = 5000;

export const EMPTY_QUERY: FindQuery = { text: '', caseSensitive: false, wholeWord: false };

export const findKey = new PluginKey<FindState>('findReplace');

type FindMeta =
  { type: 'query'; query: FindQuery; from: number } | { type: 'current'; index: number } | { type: 'clear' };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The pattern for a query, or null when the query is empty. */
export function queryPattern(query: FindQuery): RegExp | null {
  if (query.text === '') return null;
  let source = escapeRegExp(query.text);
  // A whole word has no letter, digit or underscore just before or after it.
  if (query.wholeWord) source = `(?<![\\p{L}\\p{N}_])${source}(?![\\p{L}\\p{N}_])`;
  return new RegExp(source, query.caseSensitive ? 'gu' : 'giu');
}

/** Every match of the query in the document, in document order. */
export function findMatches(doc: ProseMirrorNode, query: FindQuery): FindMatch[] {
  const pattern = queryPattern(query);
  if (!pattern) return [];
  const matches: FindMatch[] = [];
  doc.descendants((block, blockPos) => {
    if (matches.length >= MAX_MATCHES) return false;
    if (!block.isTextblock) return true;
    const { text, at } = blockText(block, blockPos);
    pattern.lastIndex = 0;
    for (const found of text.matchAll(pattern)) {
      const value = found[0];
      if (value === '' || value.includes(NODE_MARK)) continue;
      const start = found.index;
      matches.push({ from: at(start), to: at(start) + value.length });
      if (matches.length >= MAX_MATCHES) break;
    }
    return false;
  });
  return matches;
}

/** The first place of these exact words in the document, or null, such as for a reader's quote. */
export function findWords(doc: ProseMirrorNode, words: string): FindMatch | null {
  if (words.trim() === '') return null;
  return findMatches(doc, { text: words, caseSensitive: true, wholeWord: false })[0] ?? null;
}

function decorate(doc: ProseMirrorNode, matches: readonly FindMatch[], current: number): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === current ? 'vlo-find-match vlo-find-current' : 'vlo-find-match',
      }),
    ),
  );
}

/** The first match that starts at or after `pos`, or the first match when none does. */
function firstFrom(matches: readonly FindMatch[], pos: number): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((m) => m.from >= pos);
  return index === -1 ? 0 : index;
}

const EMPTY_STATE: FindState = {
  query: EMPTY_QUERY,
  matches: [],
  current: -1,
  decorations: DecorationSet.empty,
};

function nextState(tr: Transaction, previous: FindState): FindState {
  const meta = tr.getMeta(findKey) as FindMeta | undefined;
  if (meta?.type === 'clear') return EMPTY_STATE;
  if (meta?.type === 'query') {
    const matches = findMatches(tr.doc, meta.query);
    const current = firstFrom(matches, meta.from);
    return { query: meta.query, matches, current, decorations: decorate(tr.doc, matches, current) };
  }
  if (meta?.type === 'current') {
    const current = previous.matches.length === 0 ? -1 : meta.index;
    return { ...previous, current, decorations: decorate(tr.doc, previous.matches, current) };
  }
  if (!tr.docChanged || previous.query.text === '') return previous;
  // The text changed: search again, and keep the current match where the old one was.
  const was = previous.matches[previous.current];
  const matches = findMatches(tr.doc, previous.query);
  const current = was ? firstFrom(matches, tr.mapping.map(was.from, -1)) : firstFrom(matches, 0);
  return { ...previous, matches, current, decorations: decorate(tr.doc, matches, current) };
}

export function getFindState(state: EditorState): FindState {
  return findKey.getState(state) ?? EMPTY_STATE;
}

/** Searches for the query. The current match is the first one at or after the selection. */
export function setFindQuery(editor: Editor, query: FindQuery): void {
  const { state } = editor;
  editor.view.dispatch(state.tr.setMeta(findKey, { type: 'query', query, from: state.selection.from }));
}

/** Moves to the next match (step 1) or the previous one (step -1), round the end of the text. */
export function stepMatch(editor: Editor, step: 1 | -1): void {
  const { matches, current } = getFindState(editor.state);
  if (matches.length === 0) return;
  const index = (current + step + matches.length) % matches.length;
  editor.view.dispatch(editor.state.tr.setMeta(findKey, { type: 'current', index }));
}

/**
 * Ends the current undo step. The text history joins changes made close together, so without this one
 * Undo would take back a replacement together with the typing or the replacement just before it.
 */
function newUndoStep(editor: Editor): void {
  yUndoPluginKey.getState(editor.state)?.undoManager.stopCapturing();
}

/** Replaces the current match and moves to the next one. Returns false when there is no current match. */
export function replaceCurrent(editor: Editor, replacement: string): boolean {
  const { matches, current } = getFindState(editor.state);
  const match = matches[current];
  if (!match) return false;
  const tr = editor.state.tr;
  if (replacement === '') tr.delete(match.from, match.to);
  else tr.insertText(replacement, match.from, match.to);
  newUndoStep(editor);
  editor.view.dispatch(tr);
  newUndoStep(editor);
  // The next match is the first one after the new text, so a replacement that holds the query is skipped.
  const after = match.from + replacement.length;
  const next = getFindState(editor.state);
  const index = next.matches.findIndex((m) => m.from >= after);
  editor.view.dispatch(
    editor.state.tr.setMeta(findKey, { type: 'current', index: index === -1 ? 0 : index }),
  );
  return true;
}

/** Replaces every match in one step, so one Undo puts them all back. Returns how many it replaced. */
export function replaceAll(editor: Editor, replacement: string): number {
  const { matches } = getFindState(editor.state);
  if (matches.length === 0) return 0;
  const tr = editor.state.tr;
  // From the end, so each earlier position stays valid.
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    if (!m) continue;
    if (replacement === '') tr.delete(m.from, m.to);
    else tr.insertText(replacement, m.from, m.to);
  }
  newUndoStep(editor);
  editor.view.dispatch(tr);
  newUndoStep(editor);
  return matches.length;
}

/** Ends the search. With `select`, the text gets focus with the current match selected. */
export function endFind(editor: Editor, select: boolean): void {
  if (editor.isDestroyed) return;
  const { matches, current } = getFindState(editor.state);
  const match = matches[current];
  const tr = editor.state.tr.setMeta(findKey, { type: 'clear' });
  if (select && match) tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView();
  editor.view.dispatch(tr);
  if (select) editor.view.focus();
}

export interface FindReplaceOptions {
  /** Opens the find bar: 'find' puts focus in the search field, 'replace' in the replacement field. */
  onOpen: (editor: Editor, field: 'find' | 'replace') => void;
}

export const FindReplace = Extension.create<FindReplaceOptions>({
  name: 'findReplace',

  addOptions() {
    return { onOpen: () => undefined };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-f': () => {
        this.options.onOpen(this.editor, 'find');
        return true;
      },
      'Mod-h': () => {
        this.options.onOpen(this.editor, 'replace');
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => EMPTY_STATE,
          apply: (tr, previous) => nextState(tr, previous),
        },
        props: {
          decorations: (state) => findKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});
