import type { TemplateDef } from '@/features/library/templates';
import type { Item, ItemKind } from '@/lib/db';
import { orderBetween, sortByOrder } from '@/lib/order';

/* Pure binder tree logic. The binder shows the tree as one flat list, so drag and drop works on rows. */

export interface FlatNode {
  item: Item;
  depth: number;
  parentId: string | null;
}

/** Where an item goes: its new parent, its new order key and, for drags, its new depth. */
export interface Placement {
  parentId: string | null;
  order: string;
  depth: number;
}

/** Depth-first list: each parent, then its children by order. Rows with a missing parent stay at the top. */
export function flattenTree(items: readonly Item[]): FlatNode[] {
  const ids = new Set(items.map((i) => i.id));
  const children = new Map<string | null, Item[]>();
  for (const item of items) {
    const parent = item.parentId !== null && ids.has(item.parentId) ? item.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(item);
    children.set(parent, list);
  }
  const out: FlatNode[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const item of sortByOrder(children.get(parentId) ?? [])) {
      out.push({ item, depth, parentId });
      visit(item.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

/** True when the template lets `kind` sit under `parent` (or at the top level for null). */
export function allowedUnder(template: TemplateDef, parent: Item | null, kind: ItemKind): boolean {
  return (template.childKinds[parent?.kind ?? 'root'] ?? []).includes(kind);
}

/** Ids of every row under `id`. */
export function descendantIds(nodes: readonly FlatNode[], id: string): Set<string> {
  const out = new Set<string>();
  const start = nodes.findIndex((n) => n.item.id === id);
  const node = nodes[start];
  if (!node) return out;
  for (let i = start + 1; i < nodes.length; i += 1) {
    const next = nodes[i];
    if (!next || next.depth <= node.depth) break;
    out.add(next.item.id);
  }
  return out;
}

/** The order key for a row placed at `index` of `rows` (which already holds it there) under `parentId`. */
function orderAt(
  rows: readonly FlatNode[],
  index: number,
  parentId: string | null,
  activeId: string,
): string {
  let before: string | null = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row?.parentId === parentId && row.item.id !== activeId) {
      before = row.item.order;
      break;
    }
  }
  let after: string | null = null;
  for (let i = index + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row?.parentId === parentId && row.item.id !== activeId) {
      after = row.item.order;
      break;
    }
  }
  return orderBetween(before, after);
}

function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  const out = [...rows];
  const [moved] = out.splice(from, 1);
  if (moved !== undefined) out.splice(to, 0, moved);
  return out;
}

/**
 * Where a dragged row lands when dropped on `overId`, pushed `offsetDepth` levels right (or left when
 * negative). Returns null when the template does not allow that kind there.
 */
export function projectDrop(
  nodes: readonly FlatNode[],
  activeId: string,
  overId: string,
  offsetDepth: number,
  template: TemplateDef,
): Placement | null {
  const hidden = descendantIds(nodes, activeId);
  const rows = nodes.filter((n) => !hidden.has(n.item.id));
  const activeIndex = rows.findIndex((n) => n.item.id === activeId);
  const overIndex = rows.findIndex((n) => n.item.id === overId);
  const active = rows[activeIndex];
  if (!active || overIndex < 0) return null;

  const moved = moveRow(rows, activeIndex, overIndex);
  const previous = moved[overIndex - 1];
  const next = moved[overIndex + 1];
  const maxDepth = previous ? previous.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.min(Math.max(active.depth + offsetDepth, minDepth), maxDepth);

  let parent: Item | null = null;
  if (depth > 0 && previous) {
    if (depth === previous.depth + 1) {
      parent = previous.item;
    } else {
      // The nearest earlier row at this depth is a sibling. Its parent is the new parent.
      const sibling = moved
        .slice(0, overIndex)
        .reverse()
        .find((n) => n.depth === depth);
      const parentId = sibling?.parentId ?? null;
      parent = parentId === null ? null : (nodes.find((n) => n.item.id === parentId)?.item ?? null);
    }
  }
  if (!allowedUnder(template, parent, active.item.kind)) return null;

  const parentId = parent?.id ?? null;
  const placed = moved.map((n, i) => (i === overIndex ? { ...n, parentId, depth } : n));
  return { parentId, order: orderAt(placed, overIndex, parentId, activeId), depth };
}

function siblingsOf(nodes: readonly FlatNode[], node: FlatNode): FlatNode[] {
  return nodes.filter((n) => n.parentId === node.parentId);
}

/** Move up or down among siblings. Null at the end of the list. */
export function moveTarget(
  nodes: readonly FlatNode[],
  id: string,
  direction: 'up' | 'down',
): Placement | null {
  const node = nodes.find((n) => n.item.id === id);
  if (!node) return null;
  const siblings = siblingsOf(nodes, node);
  const index = siblings.indexOf(node);
  if (direction === 'up') {
    const above = siblings[index - 1];
    if (!above) return null;
    const order = orderBetween(siblings[index - 2]?.item.order ?? null, above.item.order);
    return { parentId: node.parentId, order, depth: node.depth };
  }
  const below = siblings[index + 1];
  if (!below) return null;
  const order = orderBetween(below.item.order, siblings[index + 2]?.item.order ?? null);
  return { parentId: node.parentId, order, depth: node.depth };
}

/** Make the item the last child of its previous sibling. Null when there is none or the template refuses. */
export function indentTarget(
  nodes: readonly FlatNode[],
  id: string,
  template: TemplateDef,
): Placement | null {
  const node = nodes.find((n) => n.item.id === id);
  if (!node) return null;
  const siblings = siblingsOf(nodes, node);
  const above = siblings[siblings.indexOf(node) - 1];
  if (!above || !allowedUnder(template, above.item, node.item.kind)) return null;
  const children = nodes.filter((n) => n.parentId === above.item.id);
  const order = orderBetween(children.at(-1)?.item.order ?? null, null);
  return { parentId: above.item.id, order, depth: node.depth + 1 };
}

/** Make the item the next sibling of its parent. Null at the top level or when the template refuses. */
export function outdentTarget(
  nodes: readonly FlatNode[],
  id: string,
  template: TemplateDef,
): Placement | null {
  const node = nodes.find((n) => n.item.id === id);
  const parent = node && nodes.find((n) => n.item.id === node.parentId);
  if (!node || !parent) return null;
  const grandparent = nodes.find((n) => n.item.id === parent.parentId)?.item ?? null;
  if (!allowedUnder(template, grandparent, node.item.kind)) return null;
  const parentSiblings = siblingsOf(nodes, parent);
  const after = parentSiblings[parentSiblings.indexOf(parent) + 1];
  const order = orderBetween(parent.item.order, after?.item.order ?? null);
  return { parentId: parent.parentId, order, depth: parent.depth };
}
