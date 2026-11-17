import { useSyncExternalStore } from 'react';
import { safeStorage } from '@/app/preferences';
import { POS_KINDS, type PosKind } from './posTags';

/*
 * The parts-of-speech colors on this device (Phase 19, Task D5): the switch, and the kinds of word that
 * the writer turned off in the legend.
 */

export interface PosPrefs {
  on: boolean;
  /** The kinds without color. */
  off: readonly PosKind[];
}

const KEY = 'vlo:parts-of-speech';
const KINDS = new Set<string>(POS_KINDS.map((k) => k.id));

function load(): PosPrefs {
  try {
    const raw: unknown = JSON.parse(safeStorage()?.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const value = raw as Partial<Record<keyof PosPrefs, unknown>>;
      const off = Array.isArray(value.off)
        ? value.off.filter((k): k is PosKind => KINDS.has(k as string))
        : [];
      return { on: value.on === true, off: [...new Set(off)] };
    }
  } catch {
    // A damaged value falls back to the defaults.
  }
  return { on: false, off: [] };
}

let current = load();
const listeners = new Set<() => void>();

export function getPosPrefs(): PosPrefs {
  return current;
}

function set(change: Partial<PosPrefs>): void {
  current = { ...current, ...change };
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private windows can refuse storage. The change still holds until the page closes.
  }
  for (const listener of listeners) listener();
}

export function setPosOn(on: boolean): void {
  set({ on });
}

/** Gives a kind of word its color, or takes it away. */
export function setPosKindOn(kind: PosKind, on: boolean): void {
  set({ off: on ? current.off.filter((k) => k !== kind) : [...new Set([...current.off, kind])] });
}

export function subscribePosPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePosPrefs(): PosPrefs {
  return useSyncExternalStore(subscribePosPrefs, getPosPrefs, getPosPrefs);
}

/** For tests: read the stored value again. */
export function reloadPosPrefs(): void {
  current = load();
  for (const listener of listeners) listener();
}
