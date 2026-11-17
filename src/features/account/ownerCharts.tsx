import { m } from 'motion/react';
import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ranked, WEEKDAYS, type OwnerDay } from './owner';

/*
 * The charts of the owner page. Each chart shows one measure in the accent hue, so its title names it and
 * no legend shows. Each one has a hover readout and a text or table view, so no value hides behind a
 * pointer. The line and area charts reveal from the left, as in bklit ui; calm mode stops it (OwnerPage).
 */

const NUMBER = new Intl.NumberFormat('en-GB');
const COMPACT = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
export const n = (value: number) => NUMBER.format(value);
export const dayText = (iso: string | null) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: iso.length === 10 ? 'UTC' : undefined,
      })
    : 'Never';

/** A clean top for a y axis at or over `max`: 1, 2 or 5 times a power of ten. */
export function niceTop(max: number): number {
  if (max <= 4) return Math.max(1, Math.ceil(max));
  const power = 10 ** Math.floor(Math.log10(max));
  return [2, 5, 10].map((f) => f * power).find((v) => v >= max) ?? 10 * power;
}

/** An axis value: in full under 10,000, compact on an axis that reaches it. */
const tickText = (value: number, top: number) => (top >= 10_000 ? COMPACT.format(value) : n(value));

const W = 600;
const H = 200;

/** One measure over time: a 2px line over a 10% wash, with a crosshair that snaps to the nearest day. */
export function TrendChart({
  days,
  value,
  unit,
}: {
  days: readonly OwnerDay[];
  value: (day: OwnerDay) => number;
  unit: string;
}) {
  const clip = useId();
  const [hover, setHover] = useState<number | null>(null);
  const values = days.map(value);
  const top = niceTop(Math.max(0, ...values));
  const last = Math.max(1, days.length - 1);
  const x = (i: number) => (i / last) * W;
  const y = (v: number) => H - (v / top) * H;
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const point = hover ?? days.length - 1;
  const day = days[point];
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(last, Math.max(0, Math.round(((e.clientX - box.left) / box.width) * last))));
  };
  const step = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (move === 0) return;
    e.preventDefault();
    setHover(Math.min(last, Math.max(0, point + move)));
  };
  return (
    <div className="grid gap-1">
      <div className="flex gap-2">
        <div
          className="flex h-[200px] flex-col justify-between text-right text-xs text-muted tabular-nums"
          aria-hidden="true"
        >
          <span>{tickText(top, top)}</span>
          <span>{tickText(top / 2, top)}</span>
          <span>0</span>
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label={`${unit} each day. Arrow keys move along the days.`}
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={point}
          aria-valuetext={`${dayText(day?.day ?? null)}: ${n(values[point] ?? 0)}`}
          className="relative h-[200px] w-full touch-pan-y rounded-sm"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => {
            setHover(null);
          }}
          onBlur={() => {
            setHover(null);
          }}
          onKeyDown={step}
        >
          <svg
            viewBox={`0 0 ${String(W)} ${String(H)}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <clipPath id={clip}>
                <m.rect
                  x={0}
                  y={-4}
                  height={H + 8}
                  initial={{ width: 0 }}
                  animate={{ width: W }}
                  transition={{ duration: 0.8, ease: [0.215, 0.61, 0.355, 1] }}
                />
              </clipPath>
            </defs>
            {[0, 0.5, 1].map((f) => (
              <line
                key={f}
                x1={0}
                x2={W}
                y1={H * f}
                y2={H * f}
                stroke="var(--rule)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <g clipPath={`url(#${clip})`}>
              <path
                d={`${line}L${String(W)} ${String(H)}L0 ${String(H)}Z`}
                fill="var(--accent)"
                opacity={0.1}
              />
              <path
                d={line}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
            {hover !== null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={0}
                y2={H}
                stroke="var(--muted)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {/* The dot is HTML, so the stretched SVG cannot squash it. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
            style={{
              left: `${String((point / last) * 100)}%`,
              top: `${String((y(values[point] ?? 0) / H) * 100)}%`,
            }}
          />
          {day && hover !== null && (
            <div
              role="tooltip"
              className="pointer-events-none absolute top-0 grid gap-0.5 rounded-md border border-rule bg-surface px-3 py-2 text-sm whitespace-nowrap shadow-[var(--shadow-hover)]"
              style={
                point / last > 0.6
                  ? { right: `${String(100 - (point / last) * 100 + 2)}%` }
                  : { left: `${String((point / last) * 100 + 2)}%` }
              }
            >
              <span className="text-lg font-semibold">{n(values[point] ?? 0)}</span>
              <span className="text-muted">
                {unit}, {dayText(day.day)}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-between pl-10 text-xs text-muted" aria-hidden="true">
        <span>{dayText(days[0]?.day ?? null)}</span>
        <span>{dayText(days.at(-1)?.day ?? null)}</span>
      </div>
    </div>
  );
}

/** A 14-day trend for a stat tile, with no axis: the tile holds the number. */
export function Sparkline({ values }: { values: readonly number[] }) {
  const top = Math.max(1, ...values);
  const last = Math.max(1, values.length - 1);
  const points = values.map((v, i) => `${((i / last) * 100).toFixed(1)},${(26 - (v / top) * 24).toFixed(1)}`);
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const LEVEL_OPACITY = [0.3, 0.5, 0.75, 1];

/** The level of each day with words, 1 to 4, by the quartiles of the days with words. */
function levels(words: readonly number[]): (w: number) => number {
  const sorted = words.filter((w) => w > 0).sort((a, b) => a - b);
  const q = [0.25, 0.5, 0.75].map((f) => sorted[Math.floor(f * (sorted.length - 1))] ?? 0);
  return (w) => (w <= 0 ? 0 : 1 + q.filter((t) => w > t).length);
}

const CELL = 11;
const GAP = 2;

/** Words on each day of the year, a week in each column, Monday at the top. Darker is more words. */
export function YearMap({ days }: { days: readonly OwnerDay[] }) {
  const [hover, setHover] = useState<OwnerDay | null>(null);
  const first = days[0];
  if (!first) return null;
  const offset = (new Date(`${first.day}T00:00:00Z`).getUTCDay() + 6) % 7;
  const level = levels(days.map((d) => d.words));
  const columns = Math.ceil((days.length + offset) / 7);
  const writing = days.filter((d) => d.words > 0).length;
  return (
    <div className="grid gap-2">
      <svg
        viewBox={`0 0 ${String(columns * (CELL + GAP))} ${String(7 * (CELL + GAP))}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Words each day for the last ${n(days.length)} days. ${n(writing)} days had words.`}
        onPointerLeave={() => {
          setHover(null);
        }}
      >
        <m.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
          {days.map((d, i) => {
            const slot = i + offset;
            const l = level(d.words);
            return (
              <rect
                key={d.day}
                x={Math.floor(slot / 7) * (CELL + GAP)}
                y={(slot % 7) * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2}
                fill={l === 0 ? 'var(--rule)' : 'var(--accent)'}
                opacity={l === 0 ? 1 : LEVEL_OPACITY[l - 1]}
                stroke={hover?.day === d.day ? 'var(--text)' : 'none'}
                onPointerEnter={() => {
                  setHover(d);
                }}
              />
            );
          })}
        </m.g>
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>
          {hover
            ? `${dayText(hover.day)}: ${n(hover.words)} words from ${n(hover.writers)} ${hover.writers === 1 ? 'writer' : 'writers'}`
            : `${n(writing)} of ${n(days.length)} days had words.`}
        </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          Fewer
          {[0, 1, 2, 3, 4].map((l) => (
            <span
              key={l}
              className="size-[11px] rounded-[2px]"
              style={{
                background: l === 0 ? 'var(--rule)' : 'var(--accent)',
                opacity: l === 0 ? 1 : LEVEL_OPACITY[l - 1],
              }}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

/** The average words of each weekday as columns, with each value on its cap. */
export function WeekdayBars({ values }: { values: readonly number[] }) {
  const top = Math.max(1, ...values);
  return (
    <ul aria-label="Average words on each weekday" className="grid grid-cols-7 gap-2">
      {values.map((v, i) => (
        <li key={WEEKDAYS[i]} className="grid justify-items-center gap-1">
          <div className="flex h-32 w-full flex-col items-center justify-end gap-1 border-b border-rule">
            <span className="text-xs tabular-nums">{n(v)}</span>
            <m.span
              aria-hidden="true"
              className="w-full max-w-6 rounded-t-[4px] bg-accent"
              initial={{ height: 0 }}
              animate={{ height: `${String((v / top) * 80)}%` }}
              transition={{ duration: 0.6, delay: i * 0.04 }}
            />
          </div>
          <span aria-hidden="true" className="text-xs text-muted">
            {WEEKDAYS[i]?.slice(0, 3)}
          </span>
          <span className="sr-only">{`words on ${WEEKDAYS[i] ?? ''}`}</span>
        </li>
      ))}
    </ul>
  );
}

/** A ranked list with a bar for each value: magnitude in one hue. */
export function Breakdown({
  title,
  counts,
  labels,
  note,
}: {
  title: string;
  counts: Record<string, number>;
  labels: Record<string, string>;
  note?: string;
}) {
  const rows = ranked(counts);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <section className="grid content-start gap-2">
      <h3 className="font-semibold">{title}</h3>
      {note && <p className="text-sm text-muted">{note}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="grid gap-1.5">
          {rows.slice(0, 10).map(([name, value]) => (
            <li
              key={name}
              className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-2 text-sm"
            >
              <span className="truncate" title={labels[name] ?? name}>
                {labels[name] ?? name}
              </span>
              <m.span
                className="h-3 rounded-r-[4px] bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${String((value / max) * 100)}%` }}
                transition={{ duration: 0.6 }}
                aria-hidden="true"
              />
              <span className="tabular-nums">{n(value)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** How full a store is: the fill in the accent over a track of the rule color. */
export function Meter({ label, used, of }: { label: string; used: number; of: number }) {
  const share = Math.min(1, used / of);
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{String(Math.round(share * 100))}%</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={of}
        aria-valuenow={used}
        className="h-2 overflow-hidden rounded-full bg-rule"
      >
        <m.div
          className="h-full rounded-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${String(Math.max(share * 100, 1))}%` }}
          transition={{ duration: 0.8 }}
        />
      </div>
    </div>
  );
}
