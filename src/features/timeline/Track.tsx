import { useDrag, useGesture } from '@use-gesture/react';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { cardBackground, threadStroke } from '@/features/board/board';
import type { Item, LifeStage } from '@/lib/db';
import { cn } from '@/ui/cn';
import { MotionViewTransition } from '@/ui/MotionViewTransition';
import {
  dateAt,
  dayOf,
  formatDate,
  spanOf,
  stack,
  stepDate,
  ticks,
  unitOf,
  xOf,
  yearOf,
  yearStart,
  type Unit,
} from './dates';
import { MemoryMenu, type MemoryActions } from './MemoryMenu';
import { memoryTransitionName } from './useTimeline';

/*
 * The Memory Timeline track (spec 8.2, plan Task C4). Life stages are colored bands and memories are
 * cards placed by date, stacked when they overlap. The vertical wheel moves the track sideways. Pinch and
 * Ctrl-wheel change the scale. A drag moves a memory to a new date; a drag onto the Undated shelf (E3)
 * takes its date away, and a drag from the shelf onto the track gives one.
 */

export const MIN_PX_PER_DAY = 0.05;
export const MAX_PX_PER_DAY = 64;
const CARD_WIDTH = 176;
const CARD_HEIGHT = 76;
const GAP = 8;
const AXIS_HEIGHT = 32;
const BAND_HEIGHT = 28;
const MIN_HEIGHT = 280;
/** Empty years shown before the first date and after the last, so a drop there still works. */
const MARGIN_YEARS = 2;

const clampScale = (z: number) => Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, z));

/** Where a drag would leave a memory: a date on the track, the shelf (null), or nowhere (undefined). */
type Drop = string | null | undefined;

interface Dragging {
  id: string;
  /** The middle of the dragged card on the screen. */
  x: number;
  y: number;
  drop: Drop;
}

interface TrackProps {
  /** Every memory, in binder order. Undated ones go to the shelf. */
  memories: readonly Item[];
  stages: readonly LifeStage[];
  pxPerDay: number;
  onPxPerDay: (z: number) => void;
  actions: MemoryActions;
  /** Gives a memory a date, or takes it away (null). */
  onDate: (memory: Item, date: string | null) => void;
  announce: (message: string) => void;
}

export function Track({ memories, stages, pxPerDay, onPxPerDay, actions, onDate, announce }: TrackProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const shelf = useRef<HTMLElement>(null);
  const helpId = useId();
  const shelfHeading = useId();
  const [view, setView] = useState({ left: 0, width: 0 });
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const unit = unitOf(pxPerDay);

  const dated = useMemo(() => memories.filter((m) => m.memory?.date !== undefined), [memories]);
  const undated = useMemo(() => memories.filter((m) => m.memory?.date === undefined), [memories]);

  // The range: every date and stage, with empty years on each side. An empty track shows the last ten years.
  const { origin, end } = useMemo(() => {
    const days = [
      ...dated.flatMap((m) => {
        const span = spanOf(m.memory?.date ?? '');
        return [span.start, span.end];
      }),
      ...stages.flatMap((s) => [spanOf(s.start).start, spanOf(s.end).end]),
    ];
    const now = new Date().getUTCFullYear();
    const first = days.length === 0 ? now - 10 : yearOf(Math.min(...days));
    const last = days.length === 0 ? now : yearOf(Math.max(...days) - 1);
    return { origin: yearStart(first - MARGIN_YEARS), end: yearStart(last + MARGIN_YEARS + 1) };
  }, [dated, stages]);
  const width = (end - origin) * pxPerDay;

  // Bands: a stage that overlaps another goes to the next row.
  const bands = useMemo(() => {
    const placed = stages.map((s) => ({
      stage: s,
      from: spanOf(s.start).start,
      to: spanOf(s.end).end,
    }));
    const ends: number[] = [];
    const rows = placed
      .sort((a, b) => a.from - b.from)
      .map((band) => {
        let row = ends.findIndex((e) => e <= band.from);
        if (row === -1) row = ends.length;
        ends[row] = band.to;
        return { ...band, row };
      });
    return { rows, count: ends.length };
  }, [stages]);

  const places = useMemo(() => {
    const xs = dated.map((m) => ({ id: m.id, x: xOf(dayOf(m.memory?.date ?? ''), pxPerDay, origin) }));
    const lanes = stack(
      xs.map((p) => ({ id: p.id, x: p.x - CARD_WIDTH / 2 })),
      CARD_WIDTH,
      GAP,
    );
    return { x: new Map(xs.map((p) => [p.id, p.x])), lanes };
  }, [dated, pxPerDay, origin]);
  const laneCount = Math.max(0, ...places.lanes.values()) + (dated.length > 0 ? 1 : 0);
  const cardsTop = AXIS_HEIGHT + bands.count * BAND_HEIGHT + 12;
  const height = Math.max(MIN_HEIGHT, cardsTop + laneCount * (CARD_HEIGHT + GAP) + 24);

  // The visible part of the track, for the axis marks.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setView({ left: el.scrollLeft, width: el.clientWidth });
      });
    };
    setView({ left: el.scrollLeft, width: el.clientWidth });
    el.addEventListener('scroll', read, { passive: true });
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', read);
      observer.disconnect();
    };
  }, []);

  // A scale change keeps the day under the pointer (or the middle) in place.
  const anchor = useRef<{ day: number; at: number } | null>(null);
  const scale = useRef(pxPerDay);
  const zoomTo = useCallback(
    (next: number, at?: number) => {
      const el = scroller.current;
      if (!el) return;
      const point = at ?? el.clientWidth / 2;
      anchor.current = { day: origin + (el.scrollLeft + point) / scale.current, at: point };
      const clamped = clampScale(next);
      scale.current = clamped;
      onPxPerDay(clamped);
    },
    [onPxPerDay, origin],
  );
  useLayoutEffect(() => {
    const el = scroller.current;
    const before = scale.current;
    scale.current = pxPerDay;
    if (!el) return;
    // A scale from the Years, Months or Days buttons keeps the middle of the track in place.
    const keep =
      anchor.current ??
      (before === pxPerDay
        ? null
        : { day: origin + (el.scrollLeft + el.clientWidth / 2) / before, at: el.clientWidth / 2 });
    anchor.current = null;
    if (keep) el.scrollLeft = (keep.day - origin) * pxPerDay - keep.at;
  }, [pxPerDay, origin]);

  // The first look starts at the first memory, or at the end of an empty track. Later, a memory that gets
  // its first date (from its form or the shelf) comes into view.
  const started = useRef(false);
  const seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    const fresh = [...places.x.keys()].filter((id) => !seen.current.has(id));
    seen.current = new Set(places.x.keys());
    if (!started.current) {
      started.current = true;
      const first = [...places.x.values()].sort((a, b) => a - b)[0];
      el.scrollLeft = first === undefined ? el.scrollWidth : first - CARD_WIDTH;
      return;
    }
    const x = fresh[0] === undefined ? undefined : places.x.get(fresh[0]);
    if (x !== undefined && (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth))
      el.scrollLeft = x - el.clientWidth / 2;
  }, [places]);

  // Pan by drag on the empty track, wheel, and pinch.
  useGesture(
    {
      onDrag: ({ delta: [dx], first, cancel, pinching, event }) => {
        if (pinching) {
          cancel();
          return;
        }
        if (first && event.target instanceof Element && event.target.closest('[data-memory-card]')) {
          cancel();
          return;
        }
        if (scroller.current) scroller.current.scrollLeft -= dx;
      },
      onPinch: ({ origin: [ox], offset: [z] }) => {
        const rect = scroller.current?.getBoundingClientRect();
        if (rect) zoomTo(z, ox - rect.left);
      },
      onWheel: ({ event, delta: [dx, dy] }) => {
        const el = scroller.current;
        if (!el) return;
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          const rect = el.getBoundingClientRect();
          zoomTo(scale.current * Math.exp(-dy * 0.01), event.clientX - rect.left);
          return;
        }
        // The vertical wheel moves the track sideways (spec 8.2).
        el.scrollLeft += Math.abs(dx) > Math.abs(dy) ? dx : dy;
      },
    },
    {
      target: scroller,
      eventOptions: { passive: false },
      drag: { filterTaps: true, axis: 'x' },
      pinch: {
        scaleBounds: { min: MIN_PX_PER_DAY, max: MAX_PX_PER_DAY },
        from: () => [scale.current, 0],
      },
    },
  );

  // Where a card whose middle is at a point of the screen would land.
  const dropAt = useCallback(
    (clientX: number, clientY: number): Drop => {
      const shelfRect = shelf.current?.getBoundingClientRect();
      if (
        shelfRect &&
        clientX >= shelfRect.left &&
        clientX <= shelfRect.right &&
        clientY >= shelfRect.top &&
        clientY <= shelfRect.bottom
      )
        return null;
      const el = scroller.current;
      const rect = el?.getBoundingClientRect();
      if (
        !el ||
        !rect ||
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      )
        return undefined;
      return dateAt(clientX - rect.left + el.scrollLeft, scale.current, origin);
    },
    [origin],
  );

  const release = useCallback(
    (memory: Item, drop: Drop) => {
      setDragging(null);
      if (drop === undefined || drop === (memory.memory?.date ?? null)) return;
      onDate(memory, drop);
    },
    [onDate],
  );

  const step = useCallback(
    (memory: Item, direction: -1 | 1, el: HTMLElement) => {
      const date = memory.memory?.date;
      if (date === undefined) {
        announce(`${memory.title} has no date. Give it one with Date, stage and themes in its menu.`);
        return;
      }
      onDate(memory, stepDate(date, unitOf(scale.current), direction));
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    },
    [announce, onDate],
  );

  const visible = useMemo(() => {
    const from = origin + (view.left - 200) / pxPerDay;
    const to = origin + (view.left + view.width + 200) / pxPerDay;
    return ticks(from, to, pxPerDay);
  }, [origin, view, pxPerDay]);

  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const overShelf = dragging?.drop === null;
  const draggedMemory = dragging ? memories.find((m) => m.id === dragging.id) : undefined;

  return (
    <div className="grid gap-4">
      <p id={helpId} className="sr-only">
        Left and Right move a memory by one {unit} of the scale. Enter opens it. The menu of a memory gives it
        a date, a life stage and themes. The List view has every memory in a table.
      </p>
      <div
        ref={scroller}
        role="region"
        aria-label="Memory Timeline"
        className="relative touch-none overflow-x-auto overflow-y-hidden rounded-[var(--radius-card)] border border-rule bg-bg select-none"
      >
        <div className="relative" style={{ width, height }}>
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 border-b border-rule"
            style={{ height: AXIS_HEIGHT }}
          >
            {visible.map((tick) => (
              <span
                key={tick.day}
                className={cn(
                  'absolute top-0 flex h-full items-end border-l pb-1.5 pl-1.5 text-xs whitespace-nowrap',
                  tick.major ? 'border-text/40 font-medium text-text' : 'border-rule text-muted',
                )}
                style={{ left: xOf(tick.day, pxPerDay, origin) }}
              >
                {tick.label}
              </span>
            ))}
          </div>
          {bands.rows.map(({ stage, from, to, row }) => (
            <div
              key={stage.id}
              className="absolute flex items-center rounded-sm border-t-2 px-2 text-xs font-medium whitespace-nowrap"
              style={{
                left: xOf(from, pxPerDay, origin),
                width: Math.max(2, (to - from) * pxPerDay),
                top: AXIS_HEIGHT + 4 + row * BAND_HEIGHT,
                height: BAND_HEIGHT - 4,
                background: cardBackground(stage.color),
                borderColor: threadStroke(stage.color),
                // A clip, not overflow, so the name can stay in view while the track scrolls past the start.
                clipPath: 'inset(0)',
              }}
              title={`${stage.name}: ${formatDate(stage.start)} to ${formatDate(stage.end)}`}
            >
              <span className="sticky left-2">
                {stage.name}
                <span className="sr-only">
                  , {formatDate(stage.start)} to {formatDate(stage.end)}
                </span>
              </span>
            </div>
          ))}
          {dated.map((memory) => {
            const x = places.x.get(memory.id) ?? 0;
            const lane = places.lanes.get(memory.id) ?? 0;
            return (
              <MemoryCard
                key={memory.id}
                memory={memory}
                stage={memory.memory?.lifeStageId ? stageById.get(memory.memory.lifeStageId) : undefined}
                style={{
                  position: 'absolute',
                  left: x - CARD_WIDTH / 2,
                  top: cardsTop + lane * (CARD_HEIGHT + GAP),
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                }}
                dragging={dragging?.id === memory.id ? dragging : null}
                helpId={helpId}
                actions={actions}
                dropAt={dropAt}
                onDragging={setDragging}
                onRelease={release}
                onStep={step}
              />
            );
          })}
          {dated.length === 0 && (
            <p
              className="sticky left-0 max-w-sm px-4 text-muted"
              style={{ top: cardsTop, position: 'absolute' }}
            >
              No memory has a date yet. Drag one from Undated onto the track, or give it a date in its menu.
            </p>
          )}
        </div>
      </div>

      {dragging && draggedMemory && (
        // The card under the pointer, above the track and the shelf, with the place it would land.
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 flex flex-col rounded-[var(--radius-card)] border border-text/30 bg-surface p-2.5 shadow-lg"
          style={{
            left: dragging.x - CARD_WIDTH / 2,
            top: dragging.y - CARD_HEIGHT / 2,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
          }}
        >
          <span className="line-clamp-2 font-display text-base leading-snug font-semibold">
            {draggedMemory.title}
          </span>
          <span className="mt-auto text-xs font-medium">
            {dragging.drop === null
              ? 'To Undated'
              : dragging.drop === undefined
                ? 'Not on the track'
                : formatDate(dragging.drop)}
          </span>
        </div>
      )}
      <section
        ref={shelf}
        aria-labelledby={shelfHeading}
        className={cn(
          'grid gap-3 rounded-[var(--radius-card)] border border-dashed p-3 transition-colors',
          overShelf ? 'border-accent bg-surface' : 'border-rule',
        )}
      >
        <h2 id={shelfHeading} className="font-display text-lg font-semibold">
          Undated <span className="font-sans text-sm font-normal text-muted">({undated.length})</span>
        </h2>
        {undated.length === 0 ? (
          <p className="text-sm text-muted">
            Every memory has a date. Drag a memory here to take its date away.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Undated memories">
            {undated.map((memory) => (
              <li key={memory.id}>
                <MemoryCard
                  memory={memory}
                  stage={memory.memory?.lifeStageId ? stageById.get(memory.memory.lifeStageId) : undefined}
                  style={{ position: 'relative', width: CARD_WIDTH, height: CARD_HEIGHT }}
                  dragging={dragging?.id === memory.id ? dragging : null}
                  helpId={helpId}
                  actions={actions}
                  dropAt={dropAt}
                  onDragging={setDragging}
                  onRelease={release}
                  onStep={step}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface MemoryCardProps {
  memory: Item;
  stage: LifeStage | undefined;
  style: CSSProperties;
  dragging: Dragging | null;
  helpId: string;
  actions: MemoryActions;
  dropAt: (clientX: number, clientY: number) => Drop;
  onDragging: (state: Dragging | null) => void;
  onRelease: (memory: Item, drop: Drop) => void;
  onStep: (memory: Item, direction: -1 | 1, el: HTMLElement) => void;
}

const MemoryCard = memo(function MemoryCard({
  memory,
  stage,
  style,
  dragging,
  helpId,
  actions,
  dropAt,
  onDragging,
  onRelease,
  onStep,
}: MemoryCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const date = memory.memory?.date;

  const bind = useDrag(
    ({ movement: [mx, my], first, last, tap, event }) => {
      if (tap) return;
      event.stopPropagation();
      if (first || !start.current) {
        const rect = ref.current?.getBoundingClientRect();
        start.current = rect
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : { x: 0, y: 0 };
      }
      const y = start.current.y + my;
      // Near the top or bottom of the window, the page scrolls, so the track and the shelf both stay reachable.
      if (!last && y < 48) window.scrollBy(0, -16);
      else if (!last && y > window.innerHeight - 48) window.scrollBy(0, 16);
      const drop = dropAt(start.current.x + mx, y);
      if (last) {
        start.current = null;
        onRelease(memory, drop);
        return;
      }
      onDragging({ id: memory.id, x: start.current.x + mx, y: start.current.y + my, drop });
    },
    { filterTaps: true, pointer: { keys: false } },
  );

  useEffect(() => {
    if (dragging === null) start.current = null;
  }, [dragging]);

  return (
    <MotionViewTransition name={memoryTransitionName(memory.id)} update="none">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see tabIndex below. */}
      <div
        {...bind()}
        ref={ref}
        data-memory-card=""
        role="group"
        aria-roledescription="memory"
        aria-label={`${memory.title}, ${date === undefined ? 'no date' : formatDate(date)}`}
        aria-describedby={helpId}
        // The card moves with the arrow keys and opens with Enter, and its menu button sits inside it, so it
        // cannot be a button. The help text names the keys.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onDoubleClick={() => {
          actions.open(memory);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            onStep(memory, event.key === 'ArrowLeft' ? -1 : 1, event.currentTarget);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            actions.open(memory);
          }
        }}
        className={cn(
          'flex touch-none cursor-grab flex-col rounded-[var(--radius-card)] border border-rule bg-surface p-2.5 pr-1 shadow-sm active:cursor-grabbing',
          dragging && 'opacity-40',
        )}
        style={style}
      >
        <div className="flex min-w-0 items-start gap-1">
          <h3 className="line-clamp-2 min-w-0 flex-1 font-display text-base leading-snug font-semibold break-words">
            {memory.title}
          </h3>
          <MemoryMenu memory={memory} actions={actions} className="-mt-2" />
        </div>
        <p className="mt-auto flex items-center gap-1.5 text-xs text-muted">
          {stage && (
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ background: threadStroke(stage.color) }}
            />
          )}
          <span className="truncate">{date === undefined ? 'No date' : formatDate(date)}</span>
        </p>
      </div>
    </MotionViewTransition>
  );
});

/** The scale presets of the Years, Months and Days buttons, in pixels per day. */
export const SCALE_PRESETS: Record<Unit, number> = { year: 0.33, month: 3, day: 32 };
