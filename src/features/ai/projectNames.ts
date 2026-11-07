import type { JSONContent } from '@tiptap/core';
import { updateToJson } from '@/features/export/read';
import type { Item } from '@/lib/db';
import { readItemUpdates } from '@/lib/ydocs';
import { markedNamesIn, type MarkedName } from './names';

/*
 * The marked names of a whole memoir, for an aliased AI request (spec 8.2). Ask and the continuity check
 * send passages from every item, so the names that the writer marked in each item must be known before a
 * request goes. Each stored item is read once, and again only after it changes.
 */

const cache = new Map<string, { stamp: string; names: MarkedName[] }>();

const stampOf = (item: Item) => `${String(item.updatedAt)}:${String(item.wordCount)}`;

/**
 * The marked names in `items`. The open item comes from `open`, the editor's own document, because the
 * stored copy can be a moment older.
 */
export async function projectMarkedNames(
  items: readonly Item[],
  open: { id: string; doc: JSONContent } | undefined,
): Promise<MarkedName[]> {
  const out: MarkedName[] = open ? markedNamesIn(open.doc) : [];
  const rest = items.filter((item) => item.id !== open?.id);
  const stale = rest.filter((item) => cache.get(item.id)?.stamp !== stampOf(item));
  for (const [id, update] of await readItemUpdates(stale.map((item) => item.id))) {
    const item = stale.find((i) => i.id === id);
    if (item) cache.set(id, { stamp: stampOf(item), names: markedNamesIn(updateToJson(update)) });
  }
  for (const item of rest) out.push(...(cache.get(item.id)?.names ?? []));
  return out;
}

/** For tests: forget every item read so far. */
export function clearMarkedNames(): void {
  cache.clear();
}
