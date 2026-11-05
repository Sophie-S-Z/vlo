import { describe, expect, it } from 'vitest';
import { addDays, addWordsToDay, dayKey, lastDays, streakOf, weekdayOf } from '@/features/progress/streaks';

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
