import { useSyncExternalStore } from 'react';
import { sheetMatcher, type SheetMatcher } from '@/features/analysis/style';
import type { CodexEntry, StyleRule } from '@/lib/db';
import { codexMatcher, type CodexMatch } from './codex';

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
}

const EMPTY: CodexState = {
  projectId: null,
  entries: [],
  match: () => [],
  show: false,
  rules: [],
  sheet: () => [],
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

export function setShowCodexNames(show: boolean): void {
  if (show !== state.show) set({ ...state, show });
}

/** Clears the list when the writer leaves the project. */
export function resetCodex(): void {
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
