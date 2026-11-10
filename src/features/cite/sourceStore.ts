import { useSyncExternalStore } from 'react';
import type { CiteStyle, Source } from '@/lib/db';

/*
 * The sources and the citation style of the open project (F64), shared by the project screen, the
 * "Cite a source" panel and each citation in the text. Other screens leave the list empty.
 */

export interface SourceState {
  /** The open project, or null on other screens. */
  projectId: string | null;
  sources: readonly Source[];
  style: CiteStyle;
}

const EMPTY: SourceState = { projectId: null, sources: [], style: 'apa' };
let state = EMPTY;
const listeners = new Set<() => void>();

function set(next: SourceState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getSources(): SourceState {
  return state;
}

export function setSources(projectId: string, sources: readonly Source[], style: CiteStyle = 'apa'): void {
  if (projectId !== state.projectId || sources !== state.sources || style !== state.style)
    set({ projectId, sources, style });
}

/** Clears the list when the writer leaves the project. */
export function resetSources(): void {
  set(EMPTY);
}

export function subscribeSources(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSourceState(): SourceState {
  return useSyncExternalStore(subscribeSources, getSources, getSources);
}
