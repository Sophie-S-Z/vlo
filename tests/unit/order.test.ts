import { describe, expect, test } from 'vitest';
import { orderAfterLast, orderBetween, sortByOrder } from '@/lib/order';

describe('fractional ordering', () => {
  test('1,000 inserts between the same two neighbours stay strictly sorted', () => {
    const low = orderBetween(null, null);
    const high = orderBetween(low, null);
    let right = high;
    const keys = [low, high];
    for (let i = 0; i < 1000; i += 1) {
      right = orderBetween(low, right);
      keys.push(right);
    }
    const sorted = sortByOrder(keys.map((order) => ({ order })));
    for (let i = 1; i < sorted.length; i += 1) {
      expect((sorted[i - 1]?.order ?? '') < (sorted[i]?.order ?? '')).toBe(true);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('sortByOrder compares code units, never locale rules', () => {
    const rows = [{ order: 'a0' }, { order: 'Zz' }];
    expect(sortByOrder(rows).map((r) => r.order)).toEqual(['Zz', 'a0']);
  });

  test('orderAfterLast places a key after every existing key', () => {
    const keys = ['a0', 'a1', 'a2'];
    const next = orderAfterLast(keys);
    expect(keys.every((k) => k < next)).toBe(true);
    expect(orderAfterLast([])).toBe(orderBetween(null, null));
  });

  test('orderAfterLast works on unsorted input', () => {
    expect(orderAfterLast(['a2', 'a0', 'a1']) > 'a2').toBe(true);
  });

  test('moving one row between two others needs a new key for that row only', () => {
    const rows = [
      { id: 'x', order: 'a0' },
      { id: 'y', order: 'a1' },
      { id: 'z', order: 'a2' },
    ];
    const moved = { ...rows[2], order: orderBetween('a0', 'a1') } as { id: string; order: string };
    const after = sortByOrder([rows[0], rows[1], moved] as { id: string; order: string }[]);
    expect(after.map((r) => r.id)).toEqual(['x', 'z', 'y']);
    expect(rows[0]?.order).toBe('a0');
    expect(rows[1]?.order).toBe('a1');
  });

  test('equal or swapped neighbours give a key after the first one, so a duplicate never crashes', () => {
    expect(orderBetween('a1', 'a1') > 'a1').toBe(true);
    expect(orderBetween('a2', 'a1') > 'a2').toBe(true);
  });
});
