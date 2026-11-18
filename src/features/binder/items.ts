import { clock } from '@/lib/clock';
import { db, MAX_ITEM_TARGET, touchProject, type Item, type ItemKind } from '@/lib/db';
import { newId } from '@/lib/ids';
import { deleteItemDoc } from '@/lib/itemDocName';
import { orderAfterLast } from '@/lib/order';
import { requiredText } from '@/lib/problem';

const cleanTitle = (title: string) => requiredText(title, 'An item needs a title.');

/** "Scene 3" when the project already has two scenes. */
export async function nextTitle(projectId: string, kind: ItemKind, label: string): Promise<string> {
  const count = await db.items
    .where('projectId')
    .equals(projectId)
    .filter((i) => i.kind === kind)
    .count();
  return `${label} ${String(count + 1)}`;
}

/** Adds an item after the last child of `parentId` (or the last top-level item). */
export async function addItem(
  projectId: string,
  parentId: string | null,
  kind: ItemKind,
  title: string,
  extra: Pick<Item, 'guide' | 'words' | 'role' | 'workingTitle'> = {},
): Promise<Item> {
  const now = clock.now();
  return db.transaction('rw', db.items, db.projects, async () => {
    const siblings = await db.items
      .where('projectId')
      .equals(projectId)
      .filter((i) => i.parentId === parentId)
      .toArray();
    const item: Item = {
      id: newId(),
      projectId,
      parentId,
      kind,
      title: cleanTitle(title),
      status: 'draft',
      order: orderAfterLast(siblings.map((i) => i.order)),
      wordCount: 0,
      createdAt: now,
      updatedAt: now,
      ...(extra.guide ? { guide: extra.guide } : {}),
      ...(extra.words ? { words: extra.words } : {}),
      ...(extra.role ? { role: extra.role } : {}),
      ...(extra.workingTitle ? { workingTitle: true as const } : {}),
    };
    await db.items.add(item);
    await touchProject(projectId, now);
    return item;
  });
}

/** Moves one item. Only that item's row changes, thanks to fractional order keys. */
export async function moveItem(id: string, parentId: string | null, order: string): Promise<void> {
  const now = clock.now();
  await db.transaction('rw', db.items, db.projects, async () => {
    const item = await db.items.get(id);
    if (!item) return;
    await db.items.update(id, { parentId, order, updatedAt: now });
    await touchProject(item.projectId, now);
  });
}

export async function updateItem(
  id: string,
  patch: Partial<Pick<Item, 'title' | 'synopsis' | 'status'>>,
): Promise<void> {
  const now = clock.now();
  const clean = patch.title === undefined ? patch : { ...patch, title: cleanTitle(patch.title) };
  await db.transaction('rw', db.items, db.projects, async () => {
    const item = await db.items.get(id);
    if (!item) return;
    await db.items.update(id, { ...clean, updatedAt: now });
    await touchProject(item.projectId, now);
  });
}

/** Marks a section's title as a working label that an export does not show, or as a heading (Phase 17). */
export async function setWorkingTitle(id: string, on: boolean): Promise<void> {
  const now = clock.now();
  await db.transaction('rw', db.items, db.projects, async () => {
    const item = await db.items.get(id);
    if (!item) return;
    await db.items
      .where('id')
      .equals(id)
      .modify((row) => {
        if (on) row.workingTitle = true;
        else delete row.workingTitle;
        row.updatedAt = now;
      });
    await touchProject(item.projectId, now);
  });
}

/** The target that the field holds: null for none, or NaN when the field holds no whole number in range. */
export function parseTarget(value: string): number | null {
  const clean = value.trim();
  if (clean === '') return null;
  // Digits, with a space, comma, dot or apostrophe between groups of three, such as 2,000 or 2 000.
  const target = /^(\d+|\d{1,3}([\s,.'’]\d{3})+)$/.test(clean) ? Number(clean.replace(/\D/g, '')) : NaN;
  return target >= 1 && target <= MAX_ITEM_TARGET ? target : NaN;
}

/** Gives an item a word target (Phase 19, Task A4), or takes the target off with null. */
export async function setItemTarget(id: string, target: number | null): Promise<void> {
  if (target !== null && (!Number.isInteger(target) || target < 1 || target > MAX_ITEM_TARGET))
    throw new RangeError(`Type a target from 1 to ${MAX_ITEM_TARGET.toLocaleString()} words.`);
  const now = clock.now();
  await db.transaction('rw', db.items, db.projects, async () => {
    const item = await db.items.get(id);
    if (!item) return;
    await db.items
      .where('id')
      .equals(id)
      .modify((row) => {
        if (target === null) delete row.target;
        else row.target = target;
        row.updatedAt = now;
      });
    await touchProject(item.projectId, now);
  });
}

/** Gives a scene its story date (F67), or takes the date off with null. */
export async function setStoryDate(id: string, date: string | null): Promise<void> {
  const now = clock.now();
  await db.transaction('rw', db.items, db.projects, async () => {
    const item = await db.items.get(id);
    if (!item) return;
    await db.items
      .where('id')
      .equals(id)
      .modify((row) => {
        if (date === null) delete row.storyDate;
        else row.storyDate = date;
        row.updatedAt = now;
      });
    await touchProject(item.projectId, now);
  });
}

/**
 * Deletes an item and everything under it, with their snapshots, versions, text copies and stored text. Board
 * cards of a deleted item stay on the board without their link, and each poem order drops the item.
 * A submission keeps the id, so the tracker can show "Deleted piece".
 */
export async function deleteItem(id: string): Promise<void> {
  const now = clock.now();
  const tables = [db.items, db.snapshots, db.itemVersions, db.itemTexts, db.projects, db.cards, db.sequences];
  const ids = await db.transaction('rw', tables, async () => {
    const root = await db.items.get(id);
    if (!root) return [];
    const all = await db.items.where('projectId').equals(root.projectId).toArray();
    const gone = [id];
    // The loop also visits ids it adds, so it reaches every depth.
    for (const parentId of gone) {
      for (const child of all) if (child.parentId === parentId) gone.push(child.id);
    }
    await db.items.bulkDelete(gone);
    await db.snapshots.where('itemId').anyOf(gone).delete();
    await db.itemVersions.where('itemId').anyOf(gone).delete();
    await db.itemTexts.bulkDelete(gone);
    await db.cards
      .where('itemId')
      .anyOf(gone)
      .modify((card) => {
        delete card.itemId;
      });
    const goneSet = new Set(gone);
    await db.sequences
      .where('projectId')
      .equals(root.projectId)
      .modify((sequence) => {
        sequence.itemIds = sequence.itemIds.filter((itemId) => !goneSet.has(itemId));
      });
    await touchProject(root.projectId, now);
    return gone;
  });
  await Promise.all(ids.map((itemId) => deleteItemDoc(itemId)));
}
