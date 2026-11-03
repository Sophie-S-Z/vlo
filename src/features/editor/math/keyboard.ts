import { useSyncExternalStore } from 'react';

/*
 * The state of the MathLive symbol keyboard, so the equation panel can show its switch and move up out of
 * the keyboard's way. MathLive fills it in once it loads.
 */

export interface MathKeyboardState {
  visible: boolean;
  /** The keyboard's height in CSS pixels, 0 while it is hidden. */
  height: number;
}

interface KeyboardSource extends EventTarget {
  visible: boolean;
  readonly boundingRect: DOMRect;
}

const HIDDEN: MathKeyboardState = { visible: false, height: 0 };
let state = HIDDEN;
const listeners = new Set<() => void>();

function set(next: MathKeyboardState): void {
  if (next.visible === state.visible && next.height === state.height) return;
  state = next.visible ? next : HIDDEN;
  for (const listener of listeners) listener();
}

/** Follows MathLive's keyboard from now on. */
export function watchKeyboard(source: KeyboardSource): void {
  const read = () => {
    set({ visible: source.visible, height: source.visible ? Math.ceil(source.boundingRect.height) : 0 });
  };
  source.addEventListener('virtual-keyboard-toggle', read);
  source.addEventListener('geometrychange', read);
  read();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const get = () => state;

export function useMathKeyboard(): MathKeyboardState {
  return useSyncExternalStore(subscribe, get, get);
}
