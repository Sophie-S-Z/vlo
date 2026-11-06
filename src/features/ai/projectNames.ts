import type { JSONContent } from '@tiptap/core';
import { updateToJson } from '@/features/export/read';
import type { Item } from '@/lib/db';
import { readItemUpdate } from '@/lib/ydocs';
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
  const lists = await Promise.all(
    rest.map(async (item) => {
      const stamp = stampOf(item);
      const hit = cache.get(item.id);
      if (hit?.stamp === stamp) return hit.names;
      const names = markedNamesIn(updateToJson(await readItemUpdate(item.id)));
      cache.set(item.id, { stamp, names });
      return names;
    }),
  );
  for (const list of lists) out.push(...list);
  return out;
}

/** For tests: forget every item read so far. */
export function clearMarkedNames(): void {
  cache.clear();
}
