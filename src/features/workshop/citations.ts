import type { JSONContent } from '@tiptap/core';
import { CITE } from '@/features/editor/format/cite';
import { updateToJson } from '@/features/export/read';
import { readItemUpdates } from '@/lib/ydocs';

/*
 * The citation check of a research paper (Phase 17 decision D1): how many times the text cites each source.
 * A source with no citation is either one to cite or one to drop. A citation of a key with no source is a
 * source that the writer deleted.
 */

/** Adds each citation key in a document to the counts. */
export function countCitations(json: JSONContent, counts: Map<string, number>): void {
  if (json.type === CITE) {
    const key = typeof json.attrs?.key === 'string' ? json.attrs.key : '';
    if (key !== '') counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const child of json.content ?? []) countCitations(child, counts);
}

/** The citations of each source key in the items, read from their stored documents. */
export async function citationCounts(itemIds: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const [, update] of await readItemUpdates(itemIds)) countCitations(updateToJson(update), counts);
  return counts;
}
