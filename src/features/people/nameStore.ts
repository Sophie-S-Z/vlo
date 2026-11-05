import { useSyncExternalStore } from 'react';
import type { Person } from '@/lib/db';

/*
 * The people of the open memoir and the "Show aliases" switch, shared by the project screen, the editor's
 * alias preview and the "Mark as person" panel. Other templates leave the list empty.
 */

export interface NameState {
  /** The open memoir, or null on other screens and templates. */
  projectId: string | null;
  people: readonly Person[];
  /** True while the editor shows each alias in place of the real name. */
  show: boolean;
}

let state: NameState = { projectId: null, people: [], show: false };
const listeners = new Set<() => void>();

function set(next: NameState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getNames(): NameState {
  return state;
}

export function setNamePeople(projectId: string, people: readonly Person[]): void {
  if (projectId !== state.projectId || people !== state.people) set({ ...state, projectId, people });
}

export function setShowAliases(show: boolean): void {
  if (show !== state.show) set({ ...state, show });
}

/** Clears the list and turns the preview off, when the writer leaves the project. */
export function resetNames(): void {
  set({ projectId: null, people: [], show: false });
}

export function subscribeNames(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNames(): NameState {
  return useSyncExternalStore(subscribeNames, getNames, getNames);
}
