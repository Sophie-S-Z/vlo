import { describe, expect, test } from 'vitest';
import { inReadingOrder } from '@/features/codex/codex';
import { seriesTimeline } from '@/features/series/series';
import type { Item } from '@/lib/db';

/* Roadmap 2 F67, plan Task N5, Review Focus 4: the scenes of a series on one timeline. */

const scene = (id: string, projectId: string, order: string, storyDate?: string): Item =>
  ({
    id,
    projectId,
    parentId: null,
    kind: 'scene',
    title: id,
    order,
    ...(storyDate !== undefined && { storyDate }),
  }) as Item;

const books = [
  { id: 'b1', title: 'Salt' },
  { id: 'b2', title: 'Tide' },
];
const timeline = (items: Item[]) => {
  const { dated, undated } = seriesTimeline(inReadingOrder(books, items));
  return { dated: dated.map((r) => `${r.book}:${r.item.id}`), undated: undated.map((r) => r.item.id) };
};

describe('seriesTimeline', () => {
  test('dated scenes of two books sort by date, and a partial date sorts at its middle', () => {
    const items = [
      scene('s1', 'b1', 'a0', '1994-12-30'),
      scene('s2', 'b1', 'a1', '1994-01-02'),
      scene('t1', 'b2', 'a0', '1994'),
      scene('t2', 'b2', 'a1', '1993-07'),
    ];
    expect(timeline(items).dated).toEqual(['Tide:t2', 'Salt:s2', 'Tide:t1', 'Salt:s1']);
  });

  test('scenes with one date keep their reading order, and undated scenes follow in reading order', () => {
    const items = [
      scene('t1', 'b2', 'a0', '1994-07'),
      scene('s2', 'b1', 'a1'),
      scene('s1', 'b1', 'a0', '1994-07'),
      scene('t2', 'b2', 'a1'),
    ];
    expect(timeline(items)).toEqual({ dated: ['Salt:s1', 'Tide:t1'], undated: ['s2', 't2'] });
  });
});
