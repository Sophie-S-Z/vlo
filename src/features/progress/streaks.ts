/*
 * Goals and streaks (spec 8.4, plan Task C9, F21). Pure functions on calendar days, so a time zone or a
 * daylight saving change never moves a day. The project keeps the words of each day under its local date
 * as YYYY-MM-DD, at the moment the writer types them.
 */

export interface StreakRules {
  /** The daily word goal. A goal of 0 or less counts any words as a met day. */
  goal: number;
  /** Rest days as weekday numbers: 0 is Sunday and 6 is Saturday. */
  restDays: readonly number[];
}

export interface Streak {
  /** Met days in a row up to today. A rest day keeps the run and adds nothing. */
  current: number;
  /** The longest run in the record. */
  best: number;
  /** The words of today. */
  today: number;
  todayMet: boolean;
}

export type DayState = 'met' | 'rest' | 'missed' | 'today';

export interface DayEntry {
  day: string;
  words: number;
  state: DayState;
}

/** Monday first, as weekday numbers (0 is Sunday). */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];
export const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const formats = new Map<string, Intl.DateTimeFormat>();
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The calendar date of a moment as YYYY-MM-DD, in the given time zone or the device's own. The device's
 * own zone comes from the Date getters, so a writer who flies to another zone with the tab open moves to
 * the new zone at once.
 */
export function dayKey(ms: number, timeZone?: string): string {
  if (timeZone === undefined) {
    const date = new Date(ms);
    return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone,
    });
    formats.set(timeZone, format);
  }
  const parts = format.formatToParts(ms);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The day number of a YYYY-MM-DD date. Days count in UTC, so each day is the same length. */
function dayNumber(day: string): number {
  const match = ISO.exec(day);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

function fromNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return fromNumber(dayNumber(day) + n);
}

/** The weekday of a date: 0 is Sunday and 6 is Saturday. */
export function weekdayOf(day: string): number {
  return new Date(dayNumber(day) * DAY_MS).getUTCDay();
}

/**
 * The record with `delta` words added to one day. A day keeps its net change, so a cut and a paste of the
 * same words add nothing. A day that ends at exactly 0 leaves the record. The reads floor a day at 0, as
 * "Written today" and the session timer do.
 */
export function addWordsToDay(
  record: Readonly<Record<string, number>>,
  day: string,
  delta: number,
): Record<string, number> {
  const words = (Object.hasOwn(record, day) ? (record[day] ?? 0) : 0) + delta;
  const others = Object.fromEntries(Object.entries(record).filter(([key]) => key !== day));
  return words === 0 ? others : { ...others, [day]: words };
}

/** The words of one day, never under 0. */
function wordsOn(record: Readonly<Record<string, number>>, day: string): number {
  return Object.hasOwn(record, day) ? Math.max(0, record[day] ?? 0) : 0;
}

function metOn(words: number, goal: number): boolean {
  return words >= Math.max(goal, 1);
}

/** The streak up to `today`. Days after today, from a time zone further east, do not count. */
export function streakOf(
  record: Readonly<Record<string, number>>,
  rules: StreakRules,
  today: string,
): Streak {
  const end = dayNumber(today);
  const days = Object.keys(record)
    .map(dayNumber)
    .filter((n) => Number.isFinite(n) && n <= end);
  const todayWords = wordsOn(record, today);
  const todayMet = metOn(todayWords, rules.goal);
  if (days.length === 0) return { current: 0, best: 0, today: todayWords, todayMet };
  const first = Math.min(...days);
  const rest = new Set(rules.restDays);
  const stateOf = (n: number): 'met' | 'keep' | 'break' => {
    const day = fromNumber(n);
    if (metOn(wordsOn(record, day), rules.goal)) return 'met';
    // Today is not over, and a rest day is allowed off.
    return n === end || rest.has(weekdayOf(day)) ? 'keep' : 'break';
  };

  let best = 0;
  let run = 0;
  for (let n = first; n <= end; n++) {
    const state = stateOf(n);
    if (state === 'met') best = Math.max(best, ++run);
    else if (state === 'break') run = 0;
  }
  return { current: run, best, today: todayWords, todayMet };
}

/** The last `count` days up to today, oldest first, each with its words and state. */
export function lastDays(
  record: Readonly<Record<string, number>>,
  rules: StreakRules,
  today: string,
  count: number,
): DayEntry[] {
  const rest = new Set(rules.restDays);
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(today, i - count + 1);
    const words = wordsOn(record, day);
    const state: DayState = metOn(words, rules.goal)
      ? 'met'
      : day === today
        ? 'today'
        : rest.has(weekdayOf(day))
          ? 'rest'
          : 'missed';
    return { day, words, state };
  });
}

/**
 * The daily goal that reaches a deadline (F46): the words left at the start of today over the writing days
 * left, today and the deadline day included, rest days out. So a missed day spreads its words over the days
 * left, and the goal stays the same all day. Null after the deadline or when the target is met.
 */
export function deadlineGoal(
  deadline: { date: string; words: number },
  total: number,
  record: Readonly<Record<string, number>>,
  restDays: readonly number[],
  today: string,
): { perDay: number; daysLeft: number } | null {
  const start = dayNumber(today);
  const end = dayNumber(deadline.date);
  if (!(end >= start)) return null;
  const left = deadline.words - (total - (Object.hasOwn(record, today) ? (record[today] ?? 0) : 0));
  if (left <= 0) return null;
  const rest = new Set(restDays);
  let daysLeft = 0;
  for (let n = start; n <= end; n++) if (!rest.has(weekdayOf(fromNumber(n)))) daysLeft++;
  // A deadline on a rest day still has its own day to write.
  daysLeft = Math.max(daysLeft, 1);
  return { perDay: Math.ceil(left / daysLeft), daysLeft };
}
