import { useSyncExternalStore } from 'react';
import { updateProjectSettings } from '@/features/library/projects';
import type { Pass, Tracking } from '@/lib/db';

/*
 * Track changes of the open project (roadmap F44, plan Task I1). The project screen sets it from the
 * project's settings, and the editor's suggestion plugin reads it on each edit.
 */

export interface TrackingState extends Tracking {
  /** The open project, or null on other screens. */
  projectId: string | null;
}

const OFF: TrackingState = { projectId: null, on: false, pass: 1 };
let state: TrackingState = OFF;
const listeners = new Set<() => void>();

function set(next: TrackingState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getTracking(): TrackingState {
  return state;
}

/** Called by the project screen with the project's stored setting. */
export function setProjectTracking(projectId: string, tracking: Tracking | undefined): void {
  const on = tracking?.on ?? false;
  const pass = tracking?.pass ?? 1;
  if (projectId !== state.projectId || on !== state.on || pass !== state.pass) set({ projectId, on, pass });
}

/** Clears the state when the writer leaves the project. */
export function resetTracking(): void {
  set(OFF);
}

/** Stores a change of the switch or the pass in the open project. The editor follows at once. */
export async function saveTracking(change: Partial<Tracking>): Promise<void> {
  const { projectId, on, pass } = state;
  if (projectId === null) return;
  const next: Tracking = { on: change.on ?? on, pass: change.pass ?? pass };
  setProjectTracking(projectId, next);
  await updateProjectSettings(projectId, { tracking: next });
}

export function subscribeTracking(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTracking(): TrackingState {
  return useSyncExternalStore(subscribeTracking, getTracking);
}

export const PASSES: readonly Pass[] = [1, 2, 3, 4, 5];
