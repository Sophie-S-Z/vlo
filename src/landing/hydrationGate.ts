import { useCallback, useState } from "react";

/** Counts hydrated `Deferred` boundaries; `hydrated` turns true once all of them report. */
export function useHydrationGate(total: number) {
  // A Set of boundary ids, so StrictMode's second effect run in development does not count twice.
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set());
  const mark = useCallback((id: string) => {
    setDone((set) => (set.has(id) ? set : new Set(set).add(id)));
    return () =>
      setDone((set) => {
        const next = new Set(set);
        next.delete(id);
        return next;
      });
  }, []);
  return { hydrated: done.size >= total, mark };
}
