import { useEffect, useId, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { useMotionPreferences } from "@/motion/MotionPreferences";
import { cn } from "@/ui/lib/utils";

export const HOLD_MS = 1200;

/**
 * "Hold to sign" (spec 18.3 p.10). A pointer must hold for 1.2 s while a ring fills; an early
 * release reverses the ring. Keyboard, assistive tech and Enter in a field submit at once,
 * and so does a plain press when motion is reduced.
 */
export function HoldButton({
  label,
  busyLabel,
  busy,
  className,
}: {
  label: string;
  busyLabel: string;
  busy: boolean;
  className?: string;
}) {
  const { reduced } = useMotionPreferences();
  const hintId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [holding, setHolding] = useState(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (reduced || busy || event.button !== 0) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      button.current?.form?.requestSubmit(button.current);
    }, HOLD_MS);
  }

  function stop() {
    window.clearTimeout(timer.current);
    setHolding(false);
  }

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    // A click from a pointer has detail >= 1. The hold timer submits for pointers.
    if (!reduced && event.detail > 0) event.preventDefault();
  }

  return (
    <>
      <button
        ref={button}
        type="submit"
        disabled={busy}
        aria-describedby={hintId}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(event) => event.preventDefault()}
        onClick={onClick}
        data-hold
        className={cn("touch-manipulation select-none", className)}
      >
        <svg viewBox="0 0 20 20" className="mr-3 size-5 -rotate-90" aria-hidden="true">
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="2"
          />
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={holding ? 0 : 1}
            style={{
              transition: `stroke-dashoffset ${holding ? HOLD_MS : 300}ms ${holding ? "linear" : "var(--vlo-ease)"}`,
            }}
          />
        </svg>
        {busy ? busyLabel : label}
      </button>
      <span id={hintId} className="sr-only">
        Press and hold, or press Enter.
      </span>
    </>
  );
}
