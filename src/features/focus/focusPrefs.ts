import { useSyncExternalStore } from 'react';
import { safeStorage } from '@/app/preferences';

export interface FocusPrefs {
  typewriter: boolean;
  dim: boolean;
}

const KEY = 'vlo:focus';
const DEFAULTS: FocusPrefs = { typewriter: false, dim: false };
const listeners = new Set<() => void>();

function load(): FocusPrefs {
  try {
    const raw: unknown = JSON.parse(safeStorage()?.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const value = raw as Partial<Record<keyof FocusPrefs, unknown>>;
      return { typewriter: value.typewriter === true, dim: value.dim === true };
    }
  } catch {
    // A damaged value falls back to the defaults.
  }
  return DEFAULTS;
}

let current = load();

/** The focus switches on this device: typewriter scrolling and focus-line dimming. */
export function getFocusPrefs(): FocusPrefs {
  return current;
}

export function setFocusPrefs(change: Partial<FocusPrefs>): void {
  current = { ...current, ...change };
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private windows can refuse storage. The switch still works until the page closes.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFocusPrefs(): FocusPrefs {
  return useSyncExternalStore(subscribe, getFocusPrefs, getFocusPrefs);
}

/** For tests: read the stored value again. */
export function reloadFocusPrefs(): void {
  current = load();
  for (const listener of listeners) listener();
}
