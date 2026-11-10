import { describe, expect, test } from 'vitest';
import { bookMargins, bookOf, DEFAULT_BOOK, gutterFor, TRIM_POINTS } from '@/features/book/book';
import { TRIMS } from '@/lib/db';
import { project } from './export-fixtures';

/* Book settings (roadmap F51, plan Task J4). */

describe('book settings', () => {
  test('each trim has its page size in points', () => {
    expect(TRIMS.map((trim) => TRIM_POINTS[trim])).toEqual([
      [360, 576],
      [378, 576],
      [396, 612],
      [432, 648],
      [419.53, 595.28],
    ]);
  });

  test('the gutter follows the KDP table for the page count', () => {
    const inches = [24, 150, 151, 300, 301, 500, 501, 700, 701, 828].map((pages) => gutterFor(pages) / 72);
    expect(inches).toEqual([0.375, 0.375, 0.5, 0.5, 0.625, 0.625, 0.75, 0.75, 0.875, 0.875]);
    // The inside margin is the gutter and a quarter inch.
    expect(bookMargins(100)).toEqual({ inside: 45, outside: 36, top: 54, bottom: 54 });
    expect(bookMargins(400).inside).toBe(63);
  });

  test('a project with no book settings gets the defaults, and its own settings win', () => {
    expect(bookOf(project('novel'))).toEqual(DEFAULT_BOOK);
    const own = { ...DEFAULT_BOOK, trim: '6x9', dedication: 'For Ada.' } as const;
    expect(bookOf(project('novel', { settings: { book: own } }))).toEqual(own);
  });
});
