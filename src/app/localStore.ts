import { useSyncExternalStore } from 'react';
import { safeStorage } from './preferences';

/** A value that this device keeps in localStorage, with listeners for React. */
export interface LocalStore<T> {
  get: () => T;
  /** Keeps the value and tells the listeners. */
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
  /** Reads the stored value again. */
  reload: () => void;
}

/**
 * Keeps a JSON value under `key`. `clean` turns the stored value, or null when there is none or it is
 * damaged, into a valid value. A browser that refuses storage keeps the value until the page closes.
 */
export function localStore<T>(key: string, clean: (raw: unknown) => T): LocalStore<T> {
  const read = (): T => {
    try {
      return clean(JSON.parse(safeStorage()?.getItem(key) ?? 'null'));
    } catch {
      return clean(null);
    }
  };
  const listeners = new Set<() => void>();
  let current = read();
  const tell = () => {
    for (const listener of listeners) listener();
  };
  const reload = () => {
    current = read();
    tell();
  };
  // Another tab changed the value (or cleared the storage): this tab follows, so it never writes back an old copy.
  if (typeof window !== 'undefined')
    window.addEventListener('storage', (event) => {
      if (event.key === key || event.key === null) reload();
    });
  return {
    get: () => current,
    set: (value) => {
      current = value;
      try {
        safeStorage()?.setItem(key, JSON.stringify(value));
      } catch {
        // Private windows can refuse storage. The value still holds until the page closes.
      }
      tell();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reload,
  };
}

export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
