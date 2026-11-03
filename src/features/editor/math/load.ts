/*
 * Loads MathLive on first use only (plan Task A6). Text without equations never loads it.
 */

export type MathModule = typeof import('./mathlive');

let pending: Promise<MathModule> | null = null;
let ready: MathModule | null = null;

export function loadMath(): Promise<MathModule> {
  pending ??= import('./mathlive').then(
    (module) => {
      ready = module;
      return module;
    },
    (error: unknown) => {
      // A failed load (for example, offline before the app was cached) can try again next time.
      pending = null;
      throw error;
    },
  );
  return pending;
}

/** MathLive when it has loaded, so a drawing can happen at once. */
export function loadedMath(): MathModule | null {
  return ready;
}
