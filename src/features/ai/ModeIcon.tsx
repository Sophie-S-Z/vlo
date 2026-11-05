import { useLayoutEffect, useRef, useState } from 'react';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import type { AiMode } from '@/lib/db';
import { cn } from '@/ui/cn';
import { ICONS, mix, toPath } from './modeIcons';

/*
 * The mode icon (plan decision P1). A change of mode morphs the shape point by point, from the shape on
 * show, so a change in the middle of a morph starts from where it is. Calm mode and reduced motion swap
 * the icon at once.
 */

const DURATION = 420;
/** Ease-out quart. */
const ease = (t: number) => 1 - (1 - t) ** 4;

export function ModeIcon({ mode, className }: { mode: AiMode; className?: string }) {
  const motion = useMotionAllowed();
  const pathRef = useRef<SVGPathElement>(null);
  const shown = useRef<readonly number[]>(ICONS[mode]);
  // React writes the first shape only. Each later shape comes from the effect.
  const [first] = useState(() => toPath(ICONS[mode]));

  useLayoutEffect(() => {
    const path = pathRef.current;
    const to = ICONS[mode];
    if (!path || shown.current === to) return;
    const from = shown.current;
    if (!motion) {
      shown.current = to;
      path.setAttribute('d', toPath(to));
      return;
    }
    let frame = 0;
    let began: number | null = null;
    const step = (time: number) => {
      began ??= time;
      const t = Math.min(1, (time - began) / DURATION);
      const now = t === 1 ? to : mix(from, to, ease(t));
      shown.current = now;
      path.setAttribute('d', toPath(now));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [mode, motion]);

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-mode={mode}
      className={cn('size-5 shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path ref={pathRef} d={first} />
    </svg>
  );
}
