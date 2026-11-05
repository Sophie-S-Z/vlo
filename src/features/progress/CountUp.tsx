import { useEffect, useRef, useState } from 'react';
import { useMotionAllowed } from '@/app/PreferencesProvider';

/*
 * A number that counts up to its value (spec 8.4 and 13: "counting numbers"). It counts from 0 the first
 * time and from the last value after a change. Calm mode and reduced motion show the value at once. A
 * screen reader reads the final value only, never the steps.
 */

const DURATION = 900;
const numbers = new Intl.NumberFormat();
/** Ease-out quart: fast at the start, slow into the value. */
const ease = (t: number) => 1 - (1 - t) ** 4;

export function CountUp({ value, className }: { value: number; className?: string }) {
  const motion = useMotionAllowed();
  const [shown, setShown] = useState(motion ? 0 : value);
  const from = useRef(motion ? 0 : value);

  useEffect(() => {
    if (!motion) {
      from.current = value;
      return;
    }
    const start = from.current;
    let frame = 0;
    let began: number | null = null;
    const step = (time: number) => {
      began ??= time;
      const t = Math.min(1, (time - began) / DURATION);
      const now = Math.round(start + (value - start) * ease(t));
      from.current = now;
      setShown(now);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value, motion]);

  return (
    <span className={className}>
      <span aria-hidden="true" className="tabular-nums" data-count-up={value}>
        {numbers.format(motion ? shown : value)}
      </span>
      <span className="sr-only">{numbers.format(value)}</span>
    </span>
  );
}
