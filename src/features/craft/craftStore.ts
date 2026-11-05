import { useSyncExternalStore } from 'react';
import { db } from '@/lib/db';

/*
 * The Craft switch of the open poem (spec 8.3, plan Task C7). Each poem keeps its own switch in its item
 * row, off by default. The editor's More tools menu, the command menu and the labels read it here.
 */

export interface CraftState {
  /** The open poem of a poetry collection, or null on other screens. */
  itemId: string | null;
  on: boolean;
}

let state: CraftState = { itemId: null, on: false };
const listeners = new Set<() => void>();

export function getCraft(): CraftState {
  return state;
}

/** The writing screen calls this with the open poem and its stored switch. */
export function setCraftItem(itemId: string | null, on: boolean): void {
  if (itemId === state.itemId && on === state.on) return;
  state = { itemId, on: itemId !== null && on };
  for (const listener of listeners) listener();
}

export function subscribeCraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCraft(): CraftState {
  return useSyncExternalStore(subscribeCraft, getCraft, getCraft);
}

/** Turns the poem's Craft labels on or off, and keeps the choice with the poem. */
export async function setCraftLabels(itemId: string, on: boolean): Promise<void> {
  // The store changes first, so the menu and the labels answer at once.
  if (state.itemId === itemId) setCraftItem(itemId, on);
  await db.items.update(itemId, { craft: on });
}
