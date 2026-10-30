import { useState } from "react";
import { useLocation } from "react-router";
import { useMotionPreferences } from "./MotionPreferences";

const BARS = [0, 1, 2, 3, 4];

/**
 * Five vermilion bars sweep across the screen when the route changes (spec 18.3). CSS runs the
 * sweep; each route change mounts new bars, so the animation starts again. Reduced motion and
 * Calm show no bars.
 */
export function RouteWipe() {
  const { pathname } = useLocation();
  const { reduced } = useMotionPreferences();
  const [seen, setSeen] = useState(pathname);
  const [wipes, setWipes] = useState(0);

  // Adjust state while rendering when the path changes (React docs: "You might not need an effect").
  if (pathname !== seen) {
    setSeen(pathname);
    if (!reduced) setWipes((count) => count + 1);
  }

  if (wipes === 0 || reduced) return null;
  return (
    <div
      key={wipes}
      data-route-wipe
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 flex flex-col"
    >
      {BARS.map((i) => (
        <div
          key={i}
          data-wipe-bar
          className="flex-1 bg-accent"
          style={{ "--i": i } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
