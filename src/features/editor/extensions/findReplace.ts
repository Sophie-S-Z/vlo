import { Extension, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transform } from '@tiptap/pm/transform';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { yUndoPluginKey } from '@tiptap/y-tiptap';
import { blockText, NODE_MARK } from '../textMap';

/*
 * Find and replace (plan E1). The plugin keeps the search, its matches and the current match, and marks
 * them with decorations. A match stays inside one paragraph or one poem line. Equations, footnote markers
 * and other inline nodes break a match, so a replacement never changes them. With `pattern` (Phase 19,
 * Task B4), the text is a JavaScript regular expression, and a replacement can hold its groups as $1.
 */

export interface FindQuery {
  text: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  pattern: boolean;
}

export interface FindMatch {
  from: number;
  to: number;
  /** The matched text. */
  text: string;
  /** The groups of a pattern, for $1 and $<name> in a replacement. */
  groups?: readonly (string | undefined)[];
  named?: Readonly<Record<string, string | undefined>>;
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

export const EMPTY_QUERY: FindQuery = { text: '', caseSensitive: false, wholeWord: false, pattern: false };

export const findKey = new PluginKey<FindState>('findReplace');

type FindMeta =
  { type: 'query'; query: FindQuery; from: number } | { type: 'current'; index: number } | { type: 'clear' };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The source and flags of a query's regular expression, or null when the query is empty. */
function patternParts(query: FindQuery): { source: string; flags: string } | null {
  if (query.text === '') return null;
  let source = query.pattern ? query.text : escapeRegExp(query.text);
  // A whole word has no letter, digit or underscore just before or after it.
  if (query.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  return { source, flags: query.caseSensitive ? 'gu' : 'giu' };
}

/** The pattern for a query, or null when the query is empty or its pattern has an error. */
export function queryPattern(query: FindQuery): RegExp | null {
  const parts = patternParts(query);
  if (!parts) return null;
  try {
    return new RegExp(parts.source, parts.flags);
  } catch {
    return null;
  }
}

/** The error of a query's pattern, such as "Unterminated group", or null when the pattern is good. */
export function patternError(query: FindQuery): string | null {
  const parts = patternParts(query);
  if (!parts || !query.pattern) return null;
  try {
    new RegExp(parts.source, parts.flags);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // "Invalid regular expression: /(/giu: Unterminated group" names the reason after the last colon.
    return message.slice(message.lastIndexOf(':') + 1).trim() || message;
  }
}

/** The text that replaces a match: the replacement, with $1, $<name>, $& and $$ for a pattern. */
function replacementText(template: string, match: FindMatch, query: FindQuery): string {
  if (!query.pattern) return template;
  return template.replace(/\$(\$|&|\d{1,2}|<([^>]*)>)/g, (all, token: string, name: string | undefined) => {
    if (token === '$') return '$';
    if (token === '&') return match.text;
    if (name !== undefined) return match.named?.[name] ?? '';
    const groups = match.groups ?? [];
    const n = Number(token);
    return n >= 1 && n <= groups.length ? (groups[n - 1] ?? '') : all;
  });
}

/**
 * Replaces the matches, from the end, so each earlier position stays valid. The new text takes the
 * formats that the whole match had, as typing over a selection does.
 */
export function replaceMatches(
  tr: Transform,
  matches: readonly FindMatch[],
  template: string,
  query: FindQuery,
): void {
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    if (!m) continue;
    const text = replacementText(template, m, query);
    if (text === '') {
      tr.delete(m.from, m.to);
      continue;
    }
    const marks = tr.doc.resolve(m.from).marksAcross(tr.doc.resolve(m.to)) ?? [];
    tr.replaceWith(m.from, m.to, tr.doc.type.schema.text(text, marks));
  }
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
      matches.push({
        from: at(start),
        to: at(start) + value.length,
        text: value,
        ...(query.pattern ? { groups: found.slice(1), named: found.groups } : {}),
      });
      if (matches.length >= MAX_MATCHES) break;
    }
    return false;
  });
  return matches;
}

/**
 * The place of these exact words nearest to the top-level block `near`, or null, such as for a reader's
 * quote in a block of a share. The first place wins a tie.
 */
export function findWords(doc: ProseMirrorNode, words: string, near = 0): FindMatch | null {
  if (words.trim() === '') return null;
  let best: FindMatch | null = null;
  let gap = Infinity;
  for (const match of findMatches(doc, { ...EMPTY_QUERY, text: words, caseSensitive: true })) {
    const distance = Math.abs(doc.resolve(match.from).index(0) - near);
    if (distance < gap) [best, gap] = [match, distance];
  }
  return best;
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
  const { matches, current, query } = getFindState(editor.state);
  const match = matches[current];
  if (!match) return false;
  const tr = editor.state.tr;
  replaceMatches(tr, [match], replacement, query);
  newUndoStep(editor);
  editor.view.dispatch(tr);
  newUndoStep(editor);
  // The next match is the first one after the new text, so a replacement that holds the query is skipped.
  const after = tr.mapping.map(match.to);
  const next = getFindState(editor.state);
  const index = next.matches.findIndex((m) => m.from >= after);
  editor.view.dispatch(
    editor.state.tr.setMeta(findKey, { type: 'current', index: index === -1 ? 0 : index }),
  );
  return true;
}

/**
 * Replaces every match of the query, the search of the find bar by default, in one step, so one Undo puts
 * them all back. Returns how many it replaced.
 */
export function replaceAll(
  editor: Editor,
  replacement: string,
  query: FindQuery = getFindState(editor.state).query,
): number {
  const matches = findMatches(editor.state.doc, query);
  if (matches.length === 0) return 0;
  const tr = editor.state.tr;
  replaceMatches(tr, matches, replacement, query);
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
