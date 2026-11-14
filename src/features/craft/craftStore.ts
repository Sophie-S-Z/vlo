import { useSyncExternalStore } from 'react';
import { db } from '@/lib/db';
import type { PoemForm } from './forms';

/*
 * The Craft switch of each open poem (spec 8.3, plan Task C7). Each poem keeps its own switch in its item
 * row, off by default. In a split view (F39) two poems are open, so a menu reads the poem of its own editor.
 */

let poems: ReadonlyMap<string, boolean> = new Map();
const listeners = new Set<() => void>();

/** The switch of an open poem of a poetry collection, or undefined when that poem is not open. */
export function craftOf(itemId: string): boolean | undefined {
  return poems.get(itemId);
}

/** The writing screen calls this with an open poem and its stored switch, and with null when it closes. */
export function setCraftPoem(itemId: string, on: boolean | null): void {
  if (on === null ? !poems.has(itemId) : poems.get(itemId) === on) return;
  const next = new Map(poems);
  if (on === null) next.delete(itemId);
  else next.set(itemId, on);
  poems = next;
  for (const listener of listeners) listener();
}

export function subscribeCraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCraftOf(itemId: string): boolean | undefined {
  const read = () => poems.get(itemId);
  return useSyncExternalStore(subscribeCraft, read, read);
}

/** Turns the poem's Craft labels on or off, and keeps the choice with the poem. */
export async function setCraftLabels(itemId: string, on: boolean): Promise<void> {
  // The store changes first, so the menu and the labels answer at once.
  if (poems.has(itemId)) setCraftPoem(itemId, on);
  await db.items.update(itemId, { craft: on });
}

/** Sets the form that the poem's Craft labels check, or takes it off with null (F56). */
export async function setPoemForm(itemId: string, form: PoemForm | null): Promise<void> {
  await db.items
    .where('id')
    .equals(itemId)
    .modify((item) => {
      if (form === null) delete item.form;
      else item.form = form;
    });
}
