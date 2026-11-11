import { useSyncExternalStore } from 'react';
import { sheetMatcher, type SheetMatcher } from '@/features/analysis/style';
import type { CodexEntry, ContinuityKept, StyleRule } from '@/lib/db';
import { codexMatcher, placesOf, type CodexMatch, type ReadingItem } from './codex';

/*
 * The Codex of the open project and the "Show Codex names" switch, shared by the project screen and the
 * editor. The editor reads the names, so the browser does not mark them as misspelled. The style sheet of
 * the project's series (F59) comes here too, for the style check.
 */

export interface CodexState {
  /** The open project, or null on other screens. */
  projectId: string | null;
  entries: readonly CodexEntry[];
  match: (text: string) => CodexMatch[];
  /** True while the editor underlines each Codex name. */
  show: boolean;
  /** The rules of the series style sheet. */
  rules: readonly StyleRule[];
  sheet: SheetMatcher;
  /** The place of each item in reading order, for the changes at a scene (F65), and its title. */
  places: ReadonlyMap<string, number>;
  titles: ReadonlyMap<string, string>;
  /** The continuity marks that the writer kept (F66). */
  kept: ContinuityKept;
}

const NONE_KEPT: ContinuityKept = { words: [], scenes: [] };

const EMPTY: CodexState = {
  projectId: null,
  entries: [],
  match: () => [],
  show: false,
  rules: [],
  sheet: () => [],
  places: new Map(),
  titles: new Map(),
  kept: NONE_KEPT,
};
let state = EMPTY;
const listeners = new Set<() => void>();

function set(next: CodexState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getCodex(): CodexState {
  return state;
}

export function setCodexEntries(projectId: string, entries: readonly CodexEntry[]): void {
  if (projectId !== state.projectId || entries !== state.entries)
    set({ ...state, projectId, entries, match: codexMatcher(entries) });
}

export function setStyleSheetRules(rules: readonly StyleRule[]): void {
  if (rules !== state.rules) set({ ...state, rules, sheet: sheetMatcher(rules) });
}

let orderKey = '';

/** The reading order changes with each save of an item, so only a new order or a new title sets it. */
export function setReadingOrder(order: readonly ReadingItem[]): void {
  const key = order.map(({ item }) => `${item.id}\u0000${item.title}`).join('\u0001');
  if (key === orderKey) return;
  orderKey = key;
  set({ ...state, places: placesOf(order), titles: new Map(order.map(({ item }) => [item.id, item.title])) });
}

const keptKey = (kept: ContinuityKept) => [...kept.words, '\u0001', ...kept.scenes].join('\u0000');

/** Each save reads the project again as a new object, so only new kept marks set them. */
export function setContinuityKept(kept: ContinuityKept = NONE_KEPT): void {
  if (keptKey(kept) !== keptKey(state.kept)) set({ ...state, kept });
}

export function setShowCodexNames(show: boolean): void {
  if (show !== state.show) set({ ...state, show });
}

/** Clears the list when the writer leaves the project. */
export function resetCodex(): void {
  orderKey = '';
  set(EMPTY);
}

export function subscribeCodex(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCodexState(): CodexState {
  return useSyncExternalStore(subscribeCodex, getCodex, getCodex);
}
