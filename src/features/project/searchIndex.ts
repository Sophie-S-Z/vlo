import MiniSearch from 'minisearch';
import type { Item, ItemText } from '@/lib/db';

export interface SearchDoc {
  id: string;
  title: string;
  text: string;
}

export type ItemSearch = MiniSearch<SearchDoc>;

/** A full-text index over item titles and the plain-text copies (ADR 0003). */
export function buildSearchIndex(texts: readonly ItemText[], items: readonly Item[]): ItemSearch {
  const textById = new Map(texts.map((t) => [t.itemId, t.text]));
  const index = new MiniSearch<SearchDoc>({
    fields: ['title', 'text'],
    storeFields: ['title'],
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 2 }, combineWith: 'AND' },
  });
  index.addAll(items.map((item) => ({ id: item.id, title: item.title, text: textById.get(item.id) ?? '' })));
  return index;
}

/**
 * About 80 characters of `text` around the first place that one of `terms` occurs, with "…" where it
 * was cut. Pass the query words and the terms MiniSearch matched, so prefix and fuzzy hits get a
 * snippet too.
 */
export function snippet(text: string, terms: readonly string[]): string | null {
  const lower = text.toLowerCase();
  const places = terms
    .map((t) => t.toLowerCase())
    .filter(Boolean)
    .map((t) => lower.indexOf(t))
    .filter((i) => i >= 0);
  if (places.length === 0) return null;
  const at = Math.min(...places);
  const start = Math.max(0, at - 30);
  const end = Math.min(text.length, at + 50);
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}
