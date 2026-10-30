import { Suspense, useEffect, useId, type ReactNode } from "react";

/**
 * Split hydration (speed pass, M1e). Each landing section below the hero sits in its own
 * Suspense boundary, so React hydrates it in its own short task instead of one long one.
 * `useHydrationGate` (hydrationGate.ts) reports when every boundary has hydrated; the effects wait for that,
 * because an effect that changes the DOM of a section before it hydrates would break it.
 */
type Mark = (id: string) => () => void;

export function Deferred({ mark, children }: { mark: Mark; children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      {children}
      <Mark mark={mark} />
    </Suspense>
  );
}

function Mark({ mark }: { mark: Mark }) {
  const id = useId();
  useEffect(() => mark(id), [mark, id]);
  return null;
}
