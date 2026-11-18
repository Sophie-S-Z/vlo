import { localStore, useLocalStore } from '@/app/localStore';

/** How Hide the text covers the words: a blur, or a bar over each line. */
export type HideStyle = 'blur' | 'bars';
export const HIDE_STYLES: readonly HideStyle[] = ['blur', 'bars'];
/** What stays clear while dimming is on: the line (or paragraph) with the caret, or its sentence. */
export type DimScope = 'line' | 'sentence';
export const DIM_SCOPES: readonly DimScope[] = ['line', 'sentence'];

export interface FocusPrefs {
  typewriter: boolean;
  dim: boolean;
  dimScope: DimScope;
  /** Hide the text on the screen, so nobody nearby can read it. The text and every export stay the same. */
  hide: boolean;
  hideStyle: HideStyle;
  /** With Hide the text on, the paragraph or stanza with the caret stays clear while the text has focus. */
  hideKeep: boolean;
}

const DEFAULTS: FocusPrefs = {
  typewriter: false,
  dim: false,
  dimScope: 'line',
  hide: false,
  hideStyle: 'blur',
  hideKeep: false,
};

function clean(raw: unknown): FocusPrefs {
  if (!raw || typeof raw !== 'object') return DEFAULTS;
  const value = raw as Partial<Record<keyof FocusPrefs, unknown>>;
  return {
    typewriter: value.typewriter === true,
    dim: value.dim === true,
    dimScope: DIM_SCOPES.includes(value.dimScope as DimScope) ? (value.dimScope as DimScope) : 'line',
    hide: value.hide === true,
    hideStyle: HIDE_STYLES.includes(value.hideStyle as HideStyle)
      ? (value.hideStyle as HideStyle)
      : DEFAULTS.hideStyle,
    hideKeep: value.hideKeep === true,
  };
}

const store = localStore('vlo:focus', clean);

/** The focus switches on this device: typewriter scrolling, focus-line dimming and Hide the text. */
export const getFocusPrefs = store.get;
/** For tests: read the stored value again. */
export const reloadFocusPrefs = store.reload;

export function setFocusPrefs(change: Partial<FocusPrefs>): void {
  store.set({ ...store.get(), ...change });
}

export function useFocusPrefs(): FocusPrefs {
  return useLocalStore(store);
}
