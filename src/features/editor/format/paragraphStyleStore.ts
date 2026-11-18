import { useSyncExternalStore } from 'react';
import { updateProjectSettings } from '@/features/library/projects';
import { DEFAULT_PARAGRAPH_STYLES, stylesOf, type ParagraphStyle } from './paragraphStyles';

/* The paragraph styles of the open project (Phase 19, Task E2), for the editor, its menus and its dialogs. */

interface StyleState {
  projectId: string | null;
  styles: readonly ParagraphStyle[];
}

let state: StyleState = { projectId: null, styles: DEFAULT_PARAGRAPH_STYLES };
let stateKey = '';
const listeners = new Set<() => void>();

function set(next: StyleState): void {
  const key = JSON.stringify(next);
  if (key === stateKey) return;
  stateKey = key;
  state = next;
  for (const listener of listeners) listener();
}

/** Each save reads the project again as a new object, so only a change of the styles sets them. */
export function openParagraphStyles(projectId: string | null, stored: unknown): void {
  set({ projectId, styles: stylesOf(stored) });
}

export function getParagraphStyles(): readonly ParagraphStyle[] {
  return state.styles;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useParagraphStyles(): readonly ParagraphStyle[] {
  return useSyncExternalStore(subscribe, getParagraphStyles);
}

/** The style with this id, or undefined for no id or a deleted style. */
export function findStyle(id: unknown): ParagraphStyle | undefined {
  return id === null || id === undefined ? undefined : state.styles.find((s) => s.id === id);
}

/** Saves the open project's styles. The text shows the change at once. */
export async function saveParagraphStyles(styles: readonly ParagraphStyle[]): Promise<void> {
  const { projectId } = state;
  set({ projectId, styles });
  if (projectId !== null) await updateProjectSettings(projectId, { paragraphStyles: [...styles] });
}
