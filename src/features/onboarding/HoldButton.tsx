import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { Button } from '@/ui/button';

interface HoldButtonProps {
  /** The name while the button asks for a hold, such as "Hold to open your first page". */
  label: string;
  /** The name when motion is off and a click confirms. Defaults to `label`. */
  plainLabel?: string;
  holdMs?: number;
  /** Return false (or a promise of false) when the action failed, so the button works again. */
  onConfirm: () => boolean | undefined | Promise<boolean | undefined>;
}

const RING = 2 * Math.PI * 9;

/**
 * Confirms after a 1.2 s hold of the pointer, Space or Enter. A click that no press started (a screen
 * reader's activate command) confirms at once, so the hold never locks anyone out. With Calm mode or
 * reduced motion it is a plain button.
 */
export function HoldButton({ label, plainLabel = label, holdMs = 1200, onConfirm }: HoldButtonProps) {
  const motion = useMotionAllowed();
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const pressed = useRef(false);
  const done = useRef(false);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function confirm() {
    if (done.current) return;
    done.current = true;
    void Promise.resolve(onConfirm()).then(
      (ok) => {
        if (ok === false) done.current = false;
      },
      () => {
        done.current = false;
      },
    );
  }

  function start() {
    if (done.current || timer.current !== null) return;
    pressed.current = true;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      confirm();
    }, holdMs);
  }

  function stop() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    // The browser sends the press's own click, if any, in this same task. Forget the press after it.
    window.setTimeout(() => {
      pressed.current = false;
    }, 0);
  }

  if (!motion) {
    return (
      <Button type="button" onClick={confirm} className="min-h-12 px-6 text-base">
        {plainLabel}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      className="min-h-12 touch-none px-6 text-base select-none"
      data-holding={holding}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        if (!event.repeat) start();
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') stop();
      }}
      onClick={() => {
        // A click after a pointer or key press belongs to that press. Only a bare click confirms.
        if (!pressed.current) confirm();
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 -rotate-90">
        <circle
          cx="10"
          cy="10"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="2"
        />
        <circle
          cx="10"
          cy="10"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING}
          strokeDashoffset={holding ? 0 : RING}
          style={
            {
              transition: holding
                ? `stroke-dashoffset ${String(holdMs)}ms linear`
                : 'stroke-dashoffset 200ms ease-out',
            } satisfies CSSProperties
          }
        />
      </svg>
      {label}
    </Button>
  );
}
