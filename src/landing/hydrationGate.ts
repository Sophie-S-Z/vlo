import { useCallback, useState } from "react";

/** Counts hydrated `Deferred` boundaries; `hydrated` turns true once all of them report. */
export function useHydrationGate(total: number) {
  const [done, setDone] = useState(0);
  const mark = useCallback(() => setDone((count) => count + 1), []);
  return { hydrated: done >= total, mark };
}
