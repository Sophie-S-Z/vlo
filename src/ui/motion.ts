import { flushSync } from 'react-dom';

/**
 * Runs a React state update inside a view transition, so the browser cross-fades or morphs the change.
 * With motion off, or in a browser without view transitions, the update runs at once with no animation.
 * `origin` sets `--vt-x` and `--vt-y` on the root, for effects that grow from a control.
 */
export function withViewTransition(
  motionAllowed: boolean,
  update: () => void,
  opts?: { origin?: { x: number; y: number } },
): void {
  const root = document.documentElement;
  if (!motionAllowed || typeof document.startViewTransition !== 'function') {
    update();
    return;
  }
  if (opts?.origin) {
    root.style.setProperty('--vt-x', `${String(opts.origin.x)}px`);
    root.style.setProperty('--vt-y', `${String(opts.origin.y)}px`);
  }
  document.startViewTransition(() => {
    flushSync(update);
  });
}
