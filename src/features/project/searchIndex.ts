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

/** About 80 characters of `text` around the first query word, with "…" where it was cut. */
export function snippet(text: string, query: string): string | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  const at = words.map((w) => lower.indexOf(w)).find((i) => i >= 0);
  if (at === undefined) return null;
  const start = Math.max(0, at - 30);
  const end = Math.min(text.length, at + 50);
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}
