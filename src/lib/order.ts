import { generateKeyBetween } from 'fractional-indexing';

/** A key that sorts between two neighbours. Pass null for an open end. */
export function orderBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** A key that sorts after every key in the list. */
export function orderAfterLast(keys: readonly string[]): string {
  let last: string | null = null;
  for (const key of keys) if (last === null || key > last) last = key;
  return generateKeyBetween(last, null);
}

/** Sorts by order key with plain code-unit comparison, which is how fractional keys sort. */
export function sortByOrder<T extends { order: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
}
