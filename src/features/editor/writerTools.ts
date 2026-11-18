import { localStore, useLocalStore } from '@/app/localStore';
import { clock } from '@/lib/clock';

/*
 * The writer's toolbar and keys (Phase 19, Task E1). The toolbar is a list of tool ids in order. Each key is
 * in TipTap's form, such as "Mod-Shift-h". Only the keys that the writer changed are here: an empty text
 * removes the key of a tool. `updatedAt` lets the newer copy win when a copy comes from another device.
 */

export interface WriterTools {
  /** The tools on the toolbar, in order. Null keeps Vlo's own toolbar for each form. */
  toolbar: string[] | null;
  /** The writer's key for each tool that they changed, by tool id. "" means no key. */
  keys: Record<string, string>;
  /** When the writer last changed the toolbar or a key, in ms since 1970. 0 before any change. */
  updatedAt: number;
}

export const MAX_PINNED = 40;
const MAX_KEYS = 200;
const ID = /^[a-z0-9-]{1,40}$/;
/** One or more modifiers and one key, or an F key, as the key recorder makes them. */
const KEYS = /^(?:(?:Mod|Ctrl|Meta|Alt|Shift)-){0,4}(?:\S|F\d{1,2}|[A-Z][A-Za-z]{1,15})$/;

const NO_WRITER_TOOLS: WriterTools = { toolbar: null, keys: {}, updatedAt: 0 };

/** A copy with each part checked. A damaged part gives Vlo's own toolbar or keys. */
export function cleanWriterTools(value: unknown): WriterTools {
  if (!value || typeof value !== 'object') return NO_WRITER_TOOLS;
  const raw = value as Record<string, unknown>;
  const toolbar = Array.isArray(raw.toolbar)
    ? [...new Set(raw.toolbar.filter((id): id is string => typeof id === 'string' && ID.test(id)))].slice(
        0,
        MAX_PINNED,
      )
    : null;
  const keys: Record<string, string> = {};
  if (raw.keys && typeof raw.keys === 'object')
    for (const [id, key] of Object.entries(raw.keys).slice(0, MAX_KEYS))
      if (ID.test(id) && typeof key === 'string' && (key === '' || KEYS.test(key))) keys[id] = key;
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;
  return { toolbar, keys, updatedAt };
}

const store = localStore('vlo:writer-tools', cleanWriterTools);

export const getWriterTools = store.get;
export const onWriterTools = store.subscribe;

/** Changes the toolbar or the keys on this device. */
export function setWriterTools(change: Partial<Pick<WriterTools, 'toolbar' | 'keys'>>): void {
  store.set(cleanWriterTools({ ...store.get(), ...change, updatedAt: clock.now() }));
}

/** Takes a copy from another device when it is newer than this one. Returns true when it did. */
export function takeWriterTools(copy: unknown): boolean {
  const clean = cleanWriterTools(copy);
  if (clean.updatedAt <= store.get().updatedAt) return false;
  store.set(clean);
  return true;
}

/**
 * Gives this device Vlo's own toolbar and keys, as a writer signs out. The writer's copy stays with the
 * account, so the next account that signs in here never takes it.
 */
export function resetWriterTools(): void {
  store.set(NO_WRITER_TOOLS);
}

export function useWriterTools(): WriterTools {
  return useLocalStore(store);
}
