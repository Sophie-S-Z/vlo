import { readStorage, writeStorage } from "./storage";

// A tiny external store over localStorage for useSyncExternalStore. With a server snapshot it keeps
// prerendered HTML and hydration in agreement. When storage is blocked, values live in memory.

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export function getStoredValue(key: string): string | null {
  return readStorage(key) ?? memory.get(key) ?? null;
}

export function setStoredValue(key: string, value: string): void {
  memory.set(key, value);
  writeStorage(key, value);
  for (const listener of listeners) listener();
}

export function subscribeStoredValues(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed a preference.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function resetStoredValuesForTests(): void {
  memory.clear();
}
