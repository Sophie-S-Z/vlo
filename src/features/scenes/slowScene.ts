import { useSyncExternalStore } from 'react';

/*
 * The guard for slow devices (plan Task A8, product owner decision). A device that draws the moving scene
 * slowly also answers keys slowly. Vlo times the frames for a short while after the scene starts to move.
 * When the middle frame takes longer than SLOW_FRAME_MS, the scene stays still for the rest of the visit,
 * so typing stays fast. The writer can try the motion again from the Scene panel.
 */

/** 20 frames a second. Below that, the main thread has no time left for keys. */
export const SLOW_FRAME_MS = 50;
/** The wait after motion starts, so the first frames of a new scene do not count. */
export const WARM_UP_MS = 1500;
/** How long Vlo times the frames. */
export const SAMPLE_MS = 2000;

/** True when the middle gap between frames is longer than SLOW_FRAME_MS. */
export function framesTooSlow(gaps: readonly number[]): boolean {
  if (gaps.length === 0) return true;
  const sorted = [...gaps].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return middle > SLOW_FRAME_MS;
}

let slow = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (slow === next) return;
  slow = next;
  for (const listener of listeners) listener();
}

export function markSceneSlow(): void {
  set(true);
}

/** The writer asks for the motion again. Vlo times the frames again the next time the scene moves. */
export function retrySceneMotion(): void {
  set(false);
}

export function isSceneSlow(): boolean {
  return slow;
}

export function useSceneSlow(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isSceneSlow,
    isSceneSlow,
  );
}

/**
 * Times the frames after a warm-up and calls `onSlow` when they are too slow. Returns a function that
 * stops the timing, for when the scene stops moving first.
 */
export function watchSceneFrames(onSlow: () => void): () => void {
  let frame = 0;
  let stopped = false;
  const gaps: number[] = [];
  const timer = setTimeout(() => {
    let last = performance.now();
    const end = last + SAMPLE_MS;
    const step = (now: number) => {
      if (stopped) return;
      gaps.push(now - last);
      last = now;
      if (now < end) {
        frame = requestAnimationFrame(step);
        return;
      }
      if (framesTooSlow(gaps)) onSlow();
    };
    frame = requestAnimationFrame(step);
  }, WARM_UP_MS);
  return () => {
    stopped = true;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
  };
}
