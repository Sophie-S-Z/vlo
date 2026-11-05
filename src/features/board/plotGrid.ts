import { flattenTree } from '@/features/binder/tree';
import type { Card, CardLink, Item, Thread } from '@/lib/db';

/*
 * The Plot Grid (spec 8.1, plan Task C3): rows are chapters in binder order, columns are threads, and each
 * cell holds the cards on that thread whose scene sits in that chapter. A card on two threads shows in
 * both columns. A card on no thread, or with no scene in a chapter, gets a "No thread" column or a
 * "No chapter" row, so every card shows at least once.
 */

export const NONE = 'none';

export interface PlotGrid {
  rows: { id: string; title: string }[];
  columns: { id: string; title: string; color: string | null }[];
  /** Cards by row id, then column id. */
  cells: Map<string, Map<string, Card[]>>;
}

/** The chapter that holds an item: the item itself, or its nearest chapter above it. */
function chapterOf(itemId: string, byId: ReadonlyMap<string, Item>): string | null {
  let step = byId.get(itemId);
  for (let depth = 0; step && depth <= byId.size; depth += 1) {
    if (step.kind === 'chapter') return step.id;
    step = step.parentId === null ? undefined : byId.get(step.parentId);
  }
  return null;
}

export function plotGrid(
  items: readonly Item[],
  cards: readonly Card[],
  links: readonly CardLink[],
  threads: readonly Thread[],
): PlotGrid {
  const byId = new Map(items.map((i) => [i.id, i]));
  const chapters = flattenTree(items)
    .map((n) => n.item)
    .filter((i) => i.kind === 'chapter');
  const threadIds = new Set(threads.map((t) => t.id));

  const placed = cards.map((card) => {
    const onThreads = new Set(
      links
        .filter((l) => l.fromCardId === card.id || l.toCardId === card.id)
        .flatMap((l) => (l.threadId !== undefined && threadIds.has(l.threadId) ? [l.threadId] : [])),
    );
    return {
      card,
      row: (card.itemId === undefined ? null : chapterOf(card.itemId, byId)) ?? NONE,
      columns: onThreads.size === 0 ? [NONE] : threads.filter((t) => onThreads.has(t.id)).map((t) => t.id),
    };
  });

  const rows = chapters.map((c) => ({ id: c.id, title: c.title }));
  if (placed.some((p) => p.row === NONE)) rows.push({ id: NONE, title: 'No chapter' });
  const columns: PlotGrid['columns'] = threads.map((t) => ({ id: t.id, title: t.name, color: t.color }));
  if (placed.some((p) => p.columns.includes(NONE)) || columns.length === 0)
    columns.push({ id: NONE, title: 'No thread', color: null });

  const cells = new Map(rows.map((r) => [r.id, new Map(columns.map((c) => [c.id, [] as Card[]]))]));
  for (const p of placed) for (const column of p.columns) cells.get(p.row)?.get(column)?.push(p.card);
  return { rows, columns, cells };
}
