import { flattenTree } from '@/features/binder/tree';
import { clock } from '@/lib/clock';
import { db, type Item, type Label } from '@/lib/db';
import { orderBetween } from '@/lib/order';

/*
 * The Outline view (roadmap F40): every item of the binder as a row or an index card, with its synopsis,
 * status, label and words. It reads and changes the binder rows, so the binder and the Outline always agree.
 */

export interface OutlineRow {
  item: Item;
  depth: number;
  /** The item's words, and for a folder the words of every item in it. */
  words: number;
}

/** The binder in order, with each folder's total words. */
export function outlineRows(items: readonly Item[]): OutlineRow[] {
  const nodes = flattenTree(items);
  const words = new Map(nodes.map((n) => [n.item.id, n.item.wordCount]));
  // Children come after their parent, so a pass from the end adds each total to its parent once.
  for (const node of [...nodes].reverse())
    if (node.parentId !== null)
      words.set(node.parentId, (words.get(node.parentId) ?? 0) + (words.get(node.item.id) ?? 0));
  return nodes.map((n) => ({ item: n.item, depth: n.depth, words: words.get(n.item.id) ?? 0 }));
}

/** The label of an item, or null when it has none or the project no longer has its label. */
export function labelOf(labels: readonly Label[] | undefined, item: Item): Label | null {
  return labels?.find((l) => l.id === item.labelId) ?? null;
}

/** The order key for the card that moves from `from` to `to` in `siblings`, which are in order. */
export function orderForMove(siblings: readonly Item[], from: number, to: number): string {
  const rest = siblings.filter((_, i) => i !== from);
  return orderBetween(rest[to - 1]?.order ?? null, rest[to]?.order ?? null);
}

/** Gives an item a label, or takes its label off with null. */
export async function setItemLabel(itemId: string, labelId: string | null): Promise<void> {
  const now = clock.now();
  await db.transaction('rw', db.items, db.projects, async () => {
    const item = await db.items.get(itemId);
    if (!item) return;
    await db.items
      .where('id')
      .equals(itemId)
      .modify((row) => {
        if (labelId === null) delete row.labelId;
        else row.labelId = labelId;
        row.updatedAt = now;
      });
    await db.projects.update(item.projectId, { updatedAt: now });
  });
}

/** Stores the project's labels. Items whose label is gone lose it in the same transaction. */
export async function saveLabels(projectId: string, labels: readonly Label[]): Promise<void> {
  const now = clock.now();
  const kept = new Set(labels.map((l) => l.id));
  await db.transaction('rw', db.items, db.projects, async () => {
    await db.projects
      .where('id')
      .equals(projectId)
      .modify((project) => {
        project.settings = { ...project.settings, labels: [...labels] };
        project.updatedAt = now;
      });
    await db.items
      .where('projectId')
      .equals(projectId)
      .filter((item) => item.labelId !== undefined && !kept.has(item.labelId))
      .modify((item) => {
        delete item.labelId;
        item.updatedAt = now;
      });
  });
}
