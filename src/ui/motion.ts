import { flushSync } from 'react-dom';

/**
 * Runs a React state update inside a view transition, so the browser cross-fades or morphs the change.
 * With motion off, or in a browser without view transitions, the update runs at once with no animation.
 * `origin` sets `--vt-x` and `--vt-y` on the root, for effects that grow from a control. `className` is on the
 * root only while the transition runs, so its CSS can pick this transition out.
 */
export function withViewTransition(
  motionAllowed: boolean,
  update: () => void,
  opts?: { origin?: { x: number; y: number } | undefined; className?: string },
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
  const { className } = opts ?? {};
  if (className) root.classList.add(className);
  const transition = document.startViewTransition(() => {
    flushSync(update);
  });
  if (className) {
    void transition.finished.finally(() => {
      root.classList.remove(className);
    });
  }
}
