import { describe, expect, test } from 'vitest';
import {
  compareDates,
  dateAt,
  dayOf,
  formatDate,
  isDate,
  parseDate,
  spanOf,
  stack,
  stepDate,
  ticks,
  unitOf,
  xOf,
} from '@/features/timeline/dates';

/* Memory Timeline dates (spec 8.2, plan Task C4, Review Focus 5). Days count from 1970-01-01 in UTC. */

describe('parse', () => {
  test('reads a year, a month or a day, and refuses anything else', () => {
    expect(parseDate('1994')).toEqual({ year: 1994 });
    expect(parseDate('1994-07')).toEqual({ year: 1994, month: 7 });
    expect(parseDate('1994-07-12')).toEqual({ year: 1994, month: 7, day: 12 });
    expect(parseDate('2000-02-29')).toEqual({ year: 2000, month: 2, day: 29 });
    for (const bad of [
      '',
      '94',
      '1994-7',
      '1994-13',
      '1994-00',
      '1994-02-30',
      '1900-02-29',
      '1994-07-12T00',
      'July',
    ])
      expect(parseDate(bad), bad).toBeNull();
    expect(isDate('1994-07')).toBe(true);
    expect(isDate('1994-02-30')).toBe(false);
  });
});

describe('spans and places', () => {
  test('a partial date covers its whole year or month, and sits at the middle of it', () => {
    const year = spanOf('1994');
    expect(year.end - year.start).toBe(365);
    expect(dayOf('1994')).toBe(year.start + 182.5);

    const month = spanOf('1994-07');
    expect(month.end - month.start).toBe(31);
    expect(dayOf('1994-07')).toBe(month.start + 15.5);

    const day = spanOf('1994-07-12');
    expect(day.end - day.start).toBe(1);
    expect(dayOf('1994-07-12')).toBe(day.start + 0.5);
    expect(day.start).toBe(Date.UTC(1994, 6, 12) / 86_400_000);
  });

  test('dates sort by their middle, so "1994" sits after "1994-03" and before "1994-11"', () => {
    const sorted = ['1994-11', '1994', '1993-12-31', '1994-03'].sort(compareDates);
    expect(sorted).toEqual(['1993-12-31', '1994-03', '1994', '1994-11']);
  });
});

describe('scale', () => {
  test('the unit follows the zoom: years, then months, then days', () => {
    expect(unitOf(0.3)).toBe('year');
    expect(unitOf(3)).toBe('month');
    expect(unitOf(32)).toBe('day');
  });

  test('a drop gives a date at the unit of the scale, and a full date only at day scale', () => {
    const origin = Date.UTC(1990, 0, 1) / 86_400_000;
    const at = (date: string, pxPerDay: number) => xOf(dayOf(date), pxPerDay, origin);

    expect(dateAt(at('1994-07-12', 0.3), 0.3, origin)).toBe('1994');
    expect(dateAt(at('1994-07-12', 3), 3, origin)).toBe('1994-07');
    expect(dateAt(at('1994-07-12', 32), 32, origin)).toBe('1994-07-12');
    // A place before the origin works too.
    expect(dateAt(at('1985-02', 3), 3, origin)).toBe('1985-02');
  });

  test('a key step moves a date by one unit and keeps its precision where it can', () => {
    expect(stepDate('1994', 'year', 1)).toBe('1995');
    expect(stepDate('1994-07-12', 'year', -1)).toBe('1993-07-12');
    expect(stepDate('2000-02-29', 'year', 1)).toBe('2001-02-28');
    expect(stepDate('1994-12', 'month', 1)).toBe('1995-01');
    expect(stepDate('1994-01-31', 'month', 1)).toBe('1994-02-28');
    expect(stepDate('1994-12-31', 'day', 1)).toBe('1995-01-01');
    // A coarser date takes the unit of the scale from its middle.
    expect(stepDate('1994', 'month', 1)).toBe('1994-08');
    expect(stepDate('1994-07', 'day', -1)).toBe('1994-07-15');
  });
});

describe('words', () => {
  test('each precision has its own words', () => {
    expect(formatDate('1994', 'en-GB')).toBe('1994');
    expect(formatDate('1994-07', 'en-GB')).toBe('July 1994');
    expect(formatDate('1994-07-12', 'en-GB')).toBe('12 July 1994');
  });
});

describe('stack', () => {
  test('cards that overlap go to the next free row', () => {
    const rows = stack(
      [
        { id: 'a', x: 0 },
        { id: 'b', x: 100 },
        { id: 'c', x: 250 },
        { id: 'd', x: 440 },
      ],
      176,
      8,
    );
    expect(rows.get('a')).toBe(0);
    expect(rows.get('b')).toBe(1);
    expect(rows.get('c')).toBe(0);
    expect(rows.get('d')).toBe(0);
  });
});

test('a year below 100 stays that year', () => {
  expect(dateAt(xOf(dayOf('0050-03-04'), 32, 0), 32, 0)).toBe('0050-03-04');
  expect(spanOf('0004').end - spanOf('0004').start).toBe(366);
});

describe('ticks', () => {
  const day = (value: string) => spanOf(value).start;

  test('years, with a step that keeps the labels apart', () => {
    const close = ticks(day('1990'), day('1995'), 0.3, 'en-GB');
    expect(close.map((t) => t.label)).toEqual(['1990', '1991', '1992', '1993', '1994', '1995']);
    const far = ticks(day('1950'), day('2000'), 0.05, 'en-GB');
    expect(far.every((t) => Number(t.label) % 5 === 0)).toBe(true);
  });

  test('months, with the year at each January', () => {
    const labels = ticks(day('1994-11'), day('1995-02'), 3, 'en-GB').map((t) => [t.label, t.major]);
    expect(labels).toEqual([
      ['Nov', false],
      ['Dec', false],
      ['1995', true],
      ['Feb', false],
    ]);
  });

  test('days, with the month at each first day', () => {
    const marks = ticks(day('1994-07-30'), day('1994-08-02'), 32, 'en-GB');
    expect(marks.map((t) => t.label)).toEqual(['30', '31', 'Aug 1994', '2']);
    expect(marks[2]?.major).toBe(true);
  });
});
