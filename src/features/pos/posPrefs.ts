import { localStore, useLocalStore } from '@/app/localStore';
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

const KINDS = new Set<string>(POS_KINDS.map((k) => k.id));

function clean(raw: unknown): PosPrefs {
  if (!raw || typeof raw !== 'object') return { on: false, off: [] };
  const value = raw as Partial<Record<keyof PosPrefs, unknown>>;
  const off = Array.isArray(value.off) ? value.off.filter((k): k is PosKind => KINDS.has(k as string)) : [];
  return { on: value.on === true, off: [...new Set(off)] };
}

const store = localStore('vlo:parts-of-speech', clean);

export const getPosPrefs = store.get;
export const subscribePosPrefs = store.subscribe;
/** For tests: read the stored value again. */
export const reloadPosPrefs = store.reload;

function set(change: Partial<PosPrefs>): void {
  store.set({ ...store.get(), ...change });
}

export function setPosOn(on: boolean): void {
  set({ on });
}

/** Gives a kind of word its color, or takes it away. */
export function setPosKindOn(kind: PosKind, on: boolean): void {
  const { off } = store.get();
  set({ off: on ? off.filter((k) => k !== kind) : [...new Set([...off, kind])] });
}

export function usePosPrefs(): PosPrefs {
  return useLocalStore(store);
}
