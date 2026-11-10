import { useGesture } from '@use-gesture/react';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/ui/cn';

/*
 * The ring preview of an order (spec 8.3, plan Task C6). The poem titles stand on a 3D ring. A drag, the
 * wheel or the arrow keys turn it, and it settles with the nearest poem in front. Calm mode and reduced
 * motion show a still numbered list.
 */

/** The width of one title card on the ring, in px. */
const CARD = 168;
const MIN_RADIUS = 150;
const MAX_RADIUS = 620;
/** Degrees of turn for each px of drag. */
const DRAG_TURN = 0.35;

/** The index nearest the front at this angle, from 0 to count - 1. */
export function frontIndex(angle: number, count: number): number {
  if (count === 0) return 0;
  const step = 360 / count;
  return ((Math.round(angle / step) % count) + count) % count;
}

/** The ring's radius for `count` cards: big enough that the cards do not overlap, within limits. */
export function ringRadius(count: number): number {
  return Math.round(Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, (count * CARD) / (2 * Math.PI))));
}

export function Ring({ name, titles, motion }: { name: string; titles: readonly string[]; motion: boolean }) {
  const helpId = useId();
  const count = titles.length;
  const step = count === 0 ? 0 : 360 / count;
  const [angle, setAngle] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(0);
  const wheelEnd = useRef<number | undefined>(undefined);
  const front = frontIndex(angle, count);

  // A new or changed order puts its first poem in front. The reset happens in the render, as React
  // advises for state that follows a prop.
  const order = `${name}:${String(count)}`;
  const [shown, setShown] = useState(order);
  if (shown !== order) {
    setShown(order);
    setAngle(0);
  }

  useEffect(
    () => () => {
      window.clearTimeout(wheelEnd.current);
    },
    [],
  );

  const snap = (to: number) => {
    setAngle(step === 0 ? 0 : Math.round(to / step) * step);
  };

  const ringRef = useRef<HTMLDivElement>(null);
  useGesture(
    {
      onDrag: ({ first, last, movement: [mx] }) => {
        if (first) {
          start.current = angle;
          setDragging(true);
        }
        const next = start.current - mx * DRAG_TURN;
        if (last) {
          setDragging(false);
          snap(next);
        } else {
          setAngle(next);
        }
      },
      onWheel: ({ event, delta: [dx, dy] }) => {
        const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        if (delta === 0) return;
        // The wheel turns the ring, so the page does not scroll under it.
        event.preventDefault();
        setDragging(true);
        setAngle((a) => a + delta * DRAG_TURN * 0.5);
        window.clearTimeout(wheelEnd.current);
        wheelEnd.current = window.setTimeout(() => {
          setDragging(false);
          setAngle((a) => (step === 0 ? 0 : Math.round(a / step) * step));
        }, 160);
      },
    },
    {
      target: ringRef,
      eventOptions: { passive: false },
      // The ring's own key handler turns it a whole step, so the drag does not read the keys too.
      drag: { axis: 'x', filterTaps: true, pointer: { keys: false } },
    },
  );

  if (!motion || count === 0) {
    return (
      <section aria-label={`Order of ${name}`} className="grid gap-2">
        <h2 className="text-sm font-semibold">Order of {name}</h2>
        {count === 0 ? (
          <p className="text-sm text-muted">This order has no poems yet.</p>
        ) : (
          <ol className="grid list-decimal gap-1 pl-6 text-sm">
            {titles.map((title, i) => (
              <li key={`${title}-${String(i)}`} className="[overflow-wrap:anywhere]">
                {title}
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }

  const radius = ringRadius(count);
  const ring: CSSProperties = {
    transform: `translateZ(${String(-radius)}px) rotateY(${String(-angle)}deg)`,
    transition: dragging ? 'none' : 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1)',
  };

  return (
    <section aria-label={`Ring preview of ${name}`} className="grid gap-2">
      <h2 className="text-sm font-semibold">Ring preview</h2>
      <div
        ref={ringRef}
        // The ring acts as a slider: the arrow keys and Home and End choose the poem in front.
        role="slider"
        aria-roledescription="ring"
        aria-label={`${name}, ${String(count)} ${count === 1 ? 'poem' : 'poems'}`}
        aria-describedby={helpId}
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={front + 1}
        aria-valuetext={`${String(front + 1)} of ${String(count)}: ${titles[front] ?? ''}`}
        aria-orientation="horizontal"
        tabIndex={0}
        onKeyDown={(event) => {
          const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
          if (event.key in keys) {
            event.preventDefault();
            snap(angle + (keys[event.key] ?? 0) * step);
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const target = event.key === 'Home' ? 0 : count - 1;
            const turns = Math.round(angle / 360) * 360;
            snap(turns + target * step);
          }
        }}
        className="relative h-56 cursor-grab touch-pan-y overflow-hidden rounded-[var(--radius-card)] border border-rule bg-bg select-none [perspective:1100px] focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
      >
        <div className="absolute inset-0 [transform-style:preserve-3d]" style={ring} aria-hidden="true">
          {titles.map((title, i) => {
            // How far this card sits from the front, from 0 to 180 degrees.
            const off = Math.abs(((((i * step - angle) % 360) + 540) % 360) - 180);
            return (
              <div
                key={`${title}-${String(i)}`}
                className={cn(
                  'absolute top-1/2 left-1/2 -mt-14 -ml-[76px] flex h-28 w-[152px] flex-col justify-between rounded-[var(--radius-card)] border bg-surface p-3 [backface-visibility:hidden]',
                  i === front ? 'border-accent shadow-[var(--shadow-hover)]' : 'border-rule',
                )}
                style={{
                  transform: `rotateY(${String(i * step)}deg) translateZ(${String(radius)}px)`,
                  // A card that turns past the side shows its back, which the ring hides. Each card in
                  // view keeps its full color, so its text keeps the contrast that WCAG asks for.
                  visibility: off >= 90 ? 'hidden' : 'visible',
                }}
              >
                <span className="tabular-nums text-xs text-muted">{String(i + 1).padStart(2, '0')}</span>
                <span className="line-clamp-3 font-display text-base leading-snug font-semibold">
                  {title}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p id={helpId} className="text-xs text-muted">
        Drag, scroll or press the arrow keys to turn the ring.
      </p>
      {/* The slider value already tells a screen reader the poem in front, so this line has no live role. */}
      <p className="text-sm" data-testid="ring-front">
        {String(front + 1)} of {String(count)}: {titles[front]}
      </p>
    </section>
  );
}
