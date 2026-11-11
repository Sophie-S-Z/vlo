/*
 * Memory Timeline dates (spec 8.2, plan Task C4). A memory date is "YYYY", "YYYY-MM" or "YYYY-MM-DD".
 * A partial date covers its whole year or month and sits at the middle of it (Review Focus 5). Places
 * count days from 1970-01-01 in UTC, so a time zone never moves a memory.
 */

export interface DateParts {
  year: number;
  month?: number;
  day?: number;
}

/** The unit of a scale: what one key step moves, and how exact a dropped date is. */
export type Unit = 'year' | 'month' | 'day';

const DAY_MS = 86_400_000;
const PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

function daysIn(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

/** How to type a date, for a field that takes one. */
export const DATE_HINT = 'A year, a month or a day: 1994, 1994-07 or 1994-07-12.';

export function parseDate(value: string): DateParts | null {
  const match = PATTERN.exec(value);
  if (!match) return null;
  const [, y = '', m, d] = match;
  const year = Number(y);
  if (m === undefined) return { year };
  const month = Number(m);
  if (month < 1 || month > 12) return null;
  if (d === undefined) return { year, month };
  const day = Number(d);
  if (day < 1 || day > daysIn(year, month)) return null;
  return { year, month, day };
}

export function isDate(value: string): boolean {
  return parseDate(value) !== null;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function write(parts: DateParts): string {
  if (parts.month === undefined) return pad(parts.year, 4);
  if (parts.day === undefined) return `${pad(parts.year, 4)}-${pad(parts.month)}`;
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Days from 1970-01-01. `setUTCFullYear` keeps years 0 to 99, which `Date.UTC` reads as 1900 to 1999. */
function dayNumber(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime() / DAY_MS;
}

/** The days a date covers: from the start of its first day to the start of the day after its last. */
export function spanOf(value: string): { start: number; end: number } {
  const parts = parseDate(value);
  if (!parts) throw new Error(`Not a memory date: ${value}`);
  const { year, month, day } = parts;
  if (month === undefined) return { start: dayNumber(year, 1, 1), end: dayNumber(year + 1, 1, 1) };
  if (day === undefined) return { start: dayNumber(year, month, 1), end: dayNumber(year, month + 1, 1) };
  const start = dayNumber(year, month, day);
  return { start, end: start + 1 };
}

/** The place of a date on the track: the middle of what it covers. */
export function dayOf(value: string): number {
  const { start, end } = spanOf(value);
  return (start + end) / 2;
}

export function compareDates(a: string, b: string): number {
  return dayOf(a) - dayOf(b) || a.length - b.length;
}

/** The parts of the day that holds a place on the track. */
function partsAt(day: number): Required<DateParts> {
  const date = new Date(Math.floor(day) * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Pixels per day at which each unit starts. Below 1.5 the track shows years, from 16 it shows days. */
export const MONTH_FROM = 1.5;
export const DAY_FROM = 16;

export function unitOf(pxPerDay: number): Unit {
  if (pxPerDay >= DAY_FROM) return 'day';
  if (pxPerDay >= MONTH_FROM) return 'month';
  return 'year';
}

export function xOf(day: number, pxPerDay: number, origin: number): number {
  return (day - origin) * pxPerDay;
}

/** The date at a place on the track, as exact as the unit of the scale allows. */
export function dateAt(x: number, pxPerDay: number, origin: number): string {
  const parts = partsAt(origin + x / pxPerDay);
  const unit = unitOf(pxPerDay);
  if (unit === 'year') return write({ year: parts.year });
  if (unit === 'month') return write({ year: parts.year, month: parts.month });
  return write(parts);
}

/** A date written at a unit: cut to it, or taken from the middle of a coarser date. */
function atUnit(value: string, unit: Unit): Required<DateParts> & { exact: Unit } {
  const parts = parseDate(value);
  if (!parts) throw new Error(`Not a memory date: ${value}`);
  const exact: Unit = parts.day !== undefined ? 'day' : parts.month !== undefined ? 'month' : 'year';
  const rank = { year: 0, month: 1, day: 2 };
  if (rank[exact] >= rank[unit])
    return { year: parts.year, month: parts.month ?? 1, day: parts.day ?? 1, exact };
  return { ...partsAt(dayOf(value)), exact: unit };
}

/**
 * Moves a date by one unit. A date that is more exact than the unit keeps its precision, and a day that
 * the new month does not have becomes the month's last day. A coarser date first takes the unit.
 */
export function stepDate(value: string, unit: Unit, step: -1 | 1): string {
  const at = atUnit(value, unit);
  let { year, month, day } = at;
  if (unit === 'year') year += step;
  else if (unit === 'month') {
    month += step;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
  } else {
    const next = partsAt(dayNumber(year, month, day) + step);
    return write(next);
  }
  day = Math.min(day, daysIn(year, month));
  if (at.exact === 'year') return write({ year });
  if (at.exact === 'month') return write({ year, month });
  return write({ year, month, day });
}

/** A date in words, at its own precision: "1994", "July 1994" or "12 July 1994". */
export function formatDate(value: string, locale?: string): string {
  const parts = parseDate(value);
  if (!parts) return value;
  if (parts.month === undefined) return String(parts.year);
  const date = new Date(dayNumber(parts.year, parts.month, parts.day ?? 1) * DAY_MS);
  const options: Intl.DateTimeFormatOptions =
    parts.day === undefined
      ? { year: 'numeric', month: 'long', timeZone: 'UTC' }
      : { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * Rows for cards of one width along a line: each card takes the first row where it does not overlap the
 * card before it. Cards go in order of their place.
 */
export function stack(
  cards: readonly { id: string; x: number }[],
  width: number,
  gap: number,
): Map<string, number> {
  const ends: number[] = [];
  const rows = new Map<string, number>();
  for (const card of [...cards].sort((a, b) => a.x - b.x)) {
    let row = ends.findIndex((end) => end <= card.x);
    if (row === -1) row = ends.length;
    ends[row] = card.x + width + gap;
    rows.set(card.id, row);
  }
  return rows;
}

export interface Tick {
  /** The day the tick marks, at the start of that day. */
  day: number;
  label: string;
  /** A year start at month scale, or a month start at day scale. */
  major: boolean;
}

const YEAR_STEPS = [1, 2, 5, 10, 20, 50, 100];

/** The axis marks between two days at a scale, with labels at least about 56 px apart. */
export function ticks(from: number, to: number, pxPerDay: number, locale?: string): Tick[] {
  const out: Tick[] = [];
  const first = partsAt(from);
  const unit = unitOf(pxPerDay);
  if (unit === 'year') {
    const step = YEAR_STEPS.find((s) => s * 365 * pxPerDay >= 56) ?? 100;
    for (let year = Math.floor(first.year / step) * step; ; year += step) {
      const day = dayNumber(year, 1, 1);
      if (day > to) break;
      if (day >= from - 366 * step) out.push({ day, label: String(year), major: false });
    }
    return out;
  }
  if (unit === 'month') {
    const short = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    for (let { year, month } = first; ;) {
      const day = dayNumber(year, month, 1);
      if (day > to) break;
      out.push({
        day,
        label: month === 1 ? String(year) : short.format(new Date(day * DAY_MS)),
        major: month === 1,
      });
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    return out;
  }
  const step = pxPerDay >= 28 ? 1 : pxPerDay >= 20 ? 2 : 5;
  const monthYear = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  for (let day = Math.floor(from); day <= to; day += 1) {
    const parts = partsAt(day);
    if (parts.day === 1) out.push({ day, label: monthYear.format(new Date(day * DAY_MS)), major: true });
    // A label too close to the next month's label is left out.
    else if (
      (parts.day - 1) % step === 0 &&
      daysIn(parts.year, parts.month) - parts.day + 1 >= Math.ceil(step / 2)
    )
      out.push({ day, label: String(parts.day), major: false });
  }
  return out;
}

/** The start of the first day of a year. */
export function yearStart(year: number): number {
  return dayNumber(year, 1, 1);
}

/** The year that holds a day. */
export function yearOf(day: number): number {
  return partsAt(day).year;
}
