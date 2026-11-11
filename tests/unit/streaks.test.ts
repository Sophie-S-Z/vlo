import { describe, expect, it } from 'vitest';
import {
  addDays,
  addWordsToDay,
  dayKey,
  deadlineGoal,
  deadlineProgress,
  goalRecord,
  isCut,
  lastDays,
  streakOf,
  weekdayOf,
} from '@/features/progress/streaks';

/*
 * Plan Task C9 (F21): the streak rules. A day counts when its words reach the goal. A rest day that misses
 * the goal keeps the streak and adds nothing. Today keeps the streak open until it ends.
 */

const rules = (goal: number, restDays: number[] = []) => ({ goal, restDays });

describe('calendar days', () => {
  it('names the day in the time zone of the writer', () => {
    // 2026-03-08 06:30 UTC is still 7 March in Los Angeles and already 8 March in Auckland.
    const at = Date.UTC(2026, 2, 8, 6, 30);
    expect(dayKey(at, 'America/Los_Angeles')).toBe('2026-03-07');
    expect(dayKey(at, 'Pacific/Auckland')).toBe('2026-03-08');
    expect(dayKey(at, 'UTC')).toBe('2026-03-08');
  });

  it('keeps one key for each local day across a daylight saving change', () => {
    // New York moves its clocks forward at 02:00 on 8 March 2026 and back at 02:00 on 1 November 2026.
    const zone = 'America/New_York';
    expect(dayKey(Date.UTC(2026, 2, 8, 4, 59), zone)).toBe('2026-03-07'); // 23:59 EST
    expect(dayKey(Date.UTC(2026, 2, 8, 5, 0), zone)).toBe('2026-03-08'); // 00:00 EST
    expect(dayKey(Date.UTC(2026, 2, 9, 3, 59), zone)).toBe('2026-03-08'); // 23:59 EDT, a 23-hour day
    expect(dayKey(Date.UTC(2026, 2, 9, 4, 0), zone)).toBe('2026-03-09');
    expect(dayKey(Date.UTC(2026, 10, 2, 4, 59), zone)).toBe('2026-11-01'); // 23:59 EST, a 25-hour day
    expect(dayKey(Date.UTC(2026, 10, 2, 5, 0), zone)).toBe('2026-11-02');
  });

  it('steps and names weekdays by calendar day, whatever the time zone', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayOf('2026-11-05')).toBe(4); // Thursday
    expect(weekdayOf('2026-11-08')).toBe(0); // Sunday
  });

  it('adds words to a day and keeps the other days', () => {
    const once = addWordsToDay({ '2026-11-04': 300 }, '2026-11-05', 120);
    expect(once).toEqual({ '2026-11-04': 300, '2026-11-05': 120 });
    expect(addWordsToDay(once, '2026-11-05', -20)).toEqual({ '2026-11-04': 300, '2026-11-05': 100 });
    // A cut and a paste of the same words add nothing, and the reads floor a day at 0.
    const cut = addWordsToDay({}, '2026-11-05', -400);
    expect(cut).toEqual({ '2026-11-05': -400 });
    expect(streakOf(cut, rules(1), '2026-11-05')).toMatchObject({ today: 0, todayMet: false });
    expect(lastDays(cut, rules(1), '2026-11-05', 1)).toEqual([
      { day: '2026-11-05', words: 0, state: 'today' },
    ]);
    expect(addWordsToDay(cut, '2026-11-05', 400)).toEqual({});
    // A day that ends at 0 leaves the record.
    expect(addWordsToDay(once, '2026-11-05', -120)).toEqual({ '2026-11-04': 300 });
  });
});

describe('streakOf', () => {
  it('counts the days in a row that reach the goal', () => {
    const words = { '2026-11-02': 500, '2026-11-03': 650, '2026-11-04': 510, '2026-11-05': 520 };
    expect(streakOf(words, rules(500), '2026-11-05')).toEqual({
      current: 4,
      best: 4,
      today: 520,
      todayMet: true,
    });
  });

  it('keeps the streak open while today is under the goal', () => {
    const words = { '2026-11-03': 500, '2026-11-04': 500, '2026-11-05': 200 };
    expect(streakOf(words, rules(500), '2026-11-05')).toMatchObject({
      current: 2,
      todayMet: false,
      today: 200,
    });
  });

  it('ends the streak on a missed day that is no rest day', () => {
    const words = { '2026-11-01': 900, '2026-11-02': 900, '2026-11-03': 100, '2026-11-04': 600 };
    expect(streakOf(words, rules(500), '2026-11-04')).toMatchObject({ current: 1, best: 2 });
    // A day with no words at all is a missed day too.
    expect(streakOf({ '2026-11-01': 900 }, rules(500), '2026-11-04')).toMatchObject({ current: 0, best: 1 });
  });

  it('keeps the streak over a rest day, which adds nothing', () => {
    // 7 and 8 November 2026 are a Saturday and a Sunday.
    const words = { '2026-11-05': 500, '2026-11-06': 500, '2026-11-09': 500 };
    const weekend = rules(500, [6, 0]);
    expect(streakOf(words, weekend, '2026-11-09')).toMatchObject({ current: 3, best: 3 });
    expect(streakOf(words, rules(500), '2026-11-09')).toMatchObject({ current: 1, best: 2 });
  });

  it('counts a rest day on which the writer reaches the goal', () => {
    const words = { '2026-11-06': 500, '2026-11-07': 800, '2026-11-08': 0, '2026-11-09': 500 };
    expect(streakOf(words, rules(500, [6, 0]), '2026-11-09')).toMatchObject({ current: 3 });
  });

  it('counts any words as a met day when the goal is 0 or less', () => {
    expect(streakOf({ '2026-11-04': 1, '2026-11-05': 3 }, rules(0), '2026-11-05')).toMatchObject({
      current: 2,
    });
  });

  it('stops at the first day of the record, even when every day is a rest day', () => {
    const everyDay = rules(500, [0, 1, 2, 3, 4, 5, 6]);
    expect(streakOf({ '2026-11-01': 600 }, everyDay, '2026-11-05')).toMatchObject({ current: 1, best: 1 });
    expect(streakOf({}, everyDay, '2026-11-05')).toEqual({ current: 0, best: 0, today: 0, todayMet: false });
  });

  it('counts the same days across a daylight saving change', () => {
    // The clocks change on 8 March in New York. Each local day is one day, so the streak is 3.
    const zone = 'America/New_York';
    let words: Record<string, number> = {};
    for (const at of [Date.UTC(2026, 2, 8, 4, 0), Date.UTC(2026, 2, 8, 23, 0), Date.UTC(2026, 2, 10, 2, 0)])
      words = addWordsToDay(words, dayKey(at, zone), 500);
    expect(Object.keys(words)).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
    expect(streakOf(words, rules(500), '2026-03-09')).toMatchObject({ current: 3 });
  });

  it('ignores days after today, such as a day written in a time zone further east', () => {
    const words = { '2026-11-04': 500, '2026-11-05': 500, '2026-11-06': 500 };
    expect(streakOf(words, rules(500), '2026-11-05')).toMatchObject({ current: 2, best: 2 });
  });
});

describe('lastDays', () => {
  it('gives each of the last days its state, oldest first', () => {
    const words = { '2026-11-03': 500, '2026-11-04': 100 };
    // 1 November 2026 is a Sunday, the rest day here.
    expect(lastDays(words, rules(500, [0]), '2026-11-05', 5)).toEqual([
      { day: '2026-11-01', words: 0, state: 'rest' },
      { day: '2026-11-02', words: 0, state: 'missed' },
      { day: '2026-11-03', words: 500, state: 'met' },
      { day: '2026-11-04', words: 100, state: 'missed' },
      { day: '2026-11-05', words: 0, state: 'today' },
    ]);
  });
});

describe('deadlineGoal (plan Task H2, F46)', () => {
  // 9 November 2026 is a Monday. The deadline is Wednesday 18 November: 10 days, today and that day in.
  const deadline = { date: '2026-11-18', words: 15_000 };

  it('divides the words left by the writing days left', () => {
    expect(deadlineGoal(deadline, 5_000, {}, [], '2026-11-09')).toEqual({ perDay: 1_000, daysLeft: 10 });
  });

  it('leaves the rest days out', () => {
    // Saturday 14 and Sunday 15 are rest days, so 8 writing days are left.
    expect(deadlineGoal(deadline, 5_000, {}, [6, 0], '2026-11-09')).toEqual({ perDay: 1_250, daysLeft: 8 });
  });

  it('spreads a missed day over the days left, with no penalty', () => {
    expect(deadlineGoal(deadline, 5_000, {}, [], '2026-11-10')).toEqual({ perDay: 1_112, daysLeft: 9 });
  });

  it('keeps the goal of today the same while the writer writes', () => {
    const record = { '2026-11-09': 600 };
    expect(deadlineGoal(deadline, 5_600, record, [], '2026-11-09')).toEqual({ perDay: 1_000, daysLeft: 10 });
  });

  it('counts the deadline day as the last writing day, even on a rest day', () => {
    expect(deadlineGoal(deadline, 14_000, {}, [], '2026-11-18')).toEqual({ perDay: 1_000, daysLeft: 1 });
    expect(deadlineGoal({ ...deadline, date: '2026-11-15' }, 14_000, {}, [0], '2026-11-15')).toEqual({
      perDay: 1_000,
      daysLeft: 1,
    });
  });

  it('gives null after the deadline or when the target is met', () => {
    expect(deadlineGoal(deadline, 5_000, {}, [], '2026-11-19')).toBeNull();
    expect(deadlineGoal(deadline, 15_000, {}, [], '2026-11-09')).toBeNull();
  });
});

describe('a goal to cut a draft down (Ellipsus October 2026 comparison)', () => {
  // The writer set the deadline at 100,000 words and wants 90,000 by Wednesday 18 November.
  const cut = { date: '2026-11-18', words: 90_000, from: 100_000 };

  it('is a cut only when the target is under the words of the day it was set', () => {
    expect(isCut(cut)).toBe(true);
    expect(isCut({ ...cut, words: 120_000 })).toBe(false);
    // A deadline from before this change has no start total, so it stays a goal to write.
    expect(isCut({ date: '2026-11-18', words: 90_000 })).toBe(false);
  });

  it('divides the words to remove by the writing days left', () => {
    expect(deadlineGoal(cut, 100_000, {}, [], '2026-11-09')).toEqual({ perDay: 1_000, daysLeft: 10 });
    // Today's cut goes back into what is left, so the goal stays the same all day.
    const record = { '2026-11-09': -400 };
    expect(deadlineGoal(cut, 99_600, record, [], '2026-11-09')).toEqual({ perDay: 1_000, daysLeft: 10 });
    expect(deadlineGoal(cut, 90_000, {}, [], '2026-11-10')).toBeNull();
  });

  it('counts the day of the set from the moment of the set', () => {
    // The writer added 2,000 words earlier today, then set the goal at 100,000 words.
    const today = { ...cut, since: '2026-11-09' };
    const record = { '2026-11-09': 2_000 };
    expect(deadlineGoal(today, 100_000, record, [], '2026-11-09')).toEqual({ perDay: 1_000, daysLeft: 10 });
    expect(goalRecord(today, 99_700, record, '2026-11-09')).toEqual({ '2026-11-09': -300 });
    expect(deadlineGoal(today, 99_700, record, [], '2026-11-09')).toEqual({ perDay: 1_000, daysLeft: 10 });
    // The next day uses the record as it is.
    expect(goalRecord(today, 99_700, record, '2026-11-10')).toBe(record);
  });

  it('counts the words that each day removed toward the streak', () => {
    const record = { '2026-11-02': -500, '2026-11-03': 800, '2026-11-04': -200 };
    const days = lastDays(record, { goal: 400, restDays: [], cut: true }, '2026-11-04', 3);
    expect(days).toEqual([
      { day: '2026-11-02', words: 500, state: 'met' },
      { day: '2026-11-03', words: 0, state: 'missed' },
      { day: '2026-11-04', words: 200, state: 'today' },
    ]);
    expect(streakOf(record, { goal: 400, restDays: [], cut: true }, '2026-11-04')).toMatchObject({
      today: 200,
      todayMet: false,
    });
  });

  it('shows the share of the target', () => {
    expect(deadlineProgress(cut, 97_500)).toEqual({ done: 2_500, need: 10_000, share: 0.25 });
    // New words since the start show as no progress, never as a loss under 0.
    expect(deadlineProgress(cut, 101_000)).toMatchObject({ done: 0, share: 0 });
    expect(deadlineProgress(cut, 85_000)).toMatchObject({ done: 10_000, share: 1 });
    expect(deadlineProgress({ date: '2026-11-18', words: 80_000 }, 20_000)).toEqual({
      done: 20_000,
      need: 80_000,
      share: 0.25,
    });
  });
});
