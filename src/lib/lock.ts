const queues = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` alone under `name`: after each earlier run of this tab, and, with Web Locks, alone among the
 * tabs of this browser. A browser without Web Locks (Safari before 15.4) still runs one at a time in a tab.
 */
export function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locked = () =>
    typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks.request(name, fn) : fn();
  const run = (queues.get(name) ?? Promise.resolve()).then(locked);
  queues.set(
    name,
    run.catch(() => undefined),
  );
  return run;
}
