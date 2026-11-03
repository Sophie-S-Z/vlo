import { useSyncExternalStore } from 'react';
import { safeStorage } from '@/app/preferences';

/*
 * Writing switches on this device. Smart punctuation turns straight quotes into curly quotes, "--" into an
 * em dash, "..." into an ellipsis and similar. It is on for prose. Poems keep every typed character until
 * the poet turns it on, because a poem's punctuation can be deliberate.
 */

export interface WritingPrefs {
  smartProse: boolean;
  smartPoems: boolean;
}

const KEY = 'vlo:writing';
export const WRITING_DEFAULTS: WritingPrefs = { smartProse: true, smartPoems: false };
const listeners = new Set<() => void>();

function load(): WritingPrefs {
  try {
    const raw: unknown = JSON.parse(safeStorage()?.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const value = raw as Partial<Record<keyof WritingPrefs, unknown>>;
      return {
        smartProse: typeof value.smartProse === 'boolean' ? value.smartProse : WRITING_DEFAULTS.smartProse,
        smartPoems: typeof value.smartPoems === 'boolean' ? value.smartPoems : WRITING_DEFAULTS.smartPoems,
      };
    }
  } catch {
    // A damaged value falls back to the defaults.
  }
  return WRITING_DEFAULTS;
}

let current = load();

export function getWritingPrefs(): WritingPrefs {
  return current;
}

export function setWritingPrefs(change: Partial<WritingPrefs>): void {
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

export function useWritingPrefs(): WritingPrefs {
  return useSyncExternalStore(subscribe, getWritingPrefs, getWritingPrefs);
}

/** For tests: read the stored value again. */
export function reloadWritingPrefs(): void {
  current = load();
  for (const listener of listeners) listener();
}
