import { addDays } from '@/features/progress/streaks';
import type { Challenge } from '@/lib/db';

/*
 * Month challenges (roadmap F60, plan Task K7, decision K7). The project keeps the net words of each local
 * day (`wordsByDay`), so a month is the sum of its days. A day under 0 counts as 0, as everywhere else.
 */

export interface MonthDay {
  day: string;
  words: number;
}

/** The month of a YYYY-MM-DD day, as YYYY-MM. */
export const monthOf = (day: string): string => day.slice(0, 7);

/** Each day of `month` (YYYY-MM), first to last, with its words. */
export function monthDays(record: Readonly<Record<string, number>>, month: string): MonthDay[] {
  const days: MonthDay[] = [];
  for (let day = `${month}-01`; monthOf(day) === month; day = addDays(day, 1))
    days.push({ day, words: Object.hasOwn(record, day) ? Math.max(0, record[day] ?? 0) : 0 });
  return days;
}

export interface ChallengeState {
  days: MonthDay[];
  total: number;
  /** The words for each day left, today in, that reach the target. Null once it is met or the month is over. */
  perDay: number | null;
}

/** Where a month challenge stands on `today`. */
export function challengeState(
  challenge: Challenge,
  record: Readonly<Record<string, number>>,
  today: string,
): ChallengeState {
  const days = monthDays(record, challenge.month);
  const total = days.reduce((sum, d) => sum + d.words, 0);
  const left = challenge.words - total;
  const daysLeft = days.filter((d) => d.day >= today).length;
  // Today's words go back into what is left, so today's goal stays the same all day, as with a deadline.
  const todayWords = days.find((d) => d.day === today)?.words ?? 0;
  return {
    days,
    total,
    perDay: left > 0 && daysLeft > 0 ? Math.ceil((left + todayWords) / daysLeft) : null,
  };
}
