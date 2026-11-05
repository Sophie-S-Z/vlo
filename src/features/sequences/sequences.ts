import { useLiveQuery } from 'dexie-react-hooks';
import { flattenTree } from '@/features/binder/tree';
import { clock } from '@/lib/clock';
import { db, type Item, type Sequence } from '@/lib/db';
import { newId } from '@/lib/ids';

/*
 * The Collection Sequencer data (spec 8.3, plan Task C6, US08). A poetry collection keeps many named orders
 * of its poems. Each order is its own row, so a move in one order never changes another. Each change also
 * marks the project as changed, for the Library order, the backup reminder and folder save.
 */

export const MAX_SEQUENCE_NAME = 80;

/** The poems of a project in binder order. */
export function poemsOf(items: readonly Item[]): Item[] {
  return flattenTree(items)
    .map((n) => n.item)
    .filter((i) => i.kind === 'poem');
}

/**
 * The poems of an order, in that order. A poem that the order does not hold yet, such as a new poem,
 * joins the end in binder order. A deleted poem leaves no gap (Review Focus 4).
 */
export function orderedPoems(sequence: Pick<Sequence, 'itemIds'>, poems: readonly Item[]): Item[] {
  const byId = new Map(poems.map((p) => [p.id, p]));
  const held = new Set<string>();
  const out: Item[] = [];
  for (const id of sequence.itemIds) {
    const poem = byId.get(id);
    if (poem && !held.has(id)) {
      held.add(id);
      out.push(poem);
    }
  }
  for (const poem of poems) if (!held.has(poem.id)) out.push(poem);
  return out;
}

/** The ids with one moved from `from` to `to`. */
export function moved(ids: readonly string[], from: number, to: number): string[] {
  const out = [...ids];
  const [id] = out.splice(from, 1);
  if (id === undefined) return out;
  out.splice(Math.max(0, Math.min(to, out.length)), 0, id);
  return out;
}

/** The orders of a project, oldest first, live. Undefined while they load. */
export function useSequences(projectId: string): Sequence[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.sequences.where('projectId').equals(projectId).toArray()).sort(
        (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
      ),
    [projectId],
  );
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') throw new RangeError('Type a name for the order.');
  if (trimmed.length > MAX_SEQUENCE_NAME)
    throw new RangeError(`A name can have up to ${String(MAX_SEQUENCE_NAME)} characters.`);
  return trimmed;
}

async function touch(projectId: string): Promise<void> {
  await db.projects.update(projectId, { updatedAt: clock.now() });
}

/** Adds an order that starts with the poems in binder order. */
export async function addSequence(projectId: string, name: string): Promise<Sequence> {
  const clean = cleanName(name);
  return db.transaction('rw', db.sequences, db.items, db.projects, async () => {
    const items = await db.items.where('projectId').equals(projectId).toArray();
    const sequence: Sequence = {
      id: newId(),
      projectId,
      name: clean,
      itemIds: poemsOf(items).map((p) => p.id),
      createdAt: clock.now(),
    };
    await db.sequences.add(sequence);
    await touch(projectId);
    return sequence;
  });
}

/** Adds a copy of an order, with the same poems in the same order. */
export async function copySequence(id: string, name: string): Promise<Sequence | undefined> {
  const clean = cleanName(name);
  return db.transaction('rw', db.sequences, db.projects, async () => {
    const source = await db.sequences.get(id);
    if (!source) return undefined;
    const copy: Sequence = { ...source, id: newId(), name: clean, createdAt: clock.now() };
    await db.sequences.add(copy);
    await touch(source.projectId);
    return copy;
  });
}

export async function renameSequence(id: string, name: string): Promise<void> {
  const clean = cleanName(name);
  await db.transaction('rw', db.sequences, db.projects, async () => {
    const sequence = await db.sequences.get(id);
    if (!sequence) return;
    await db.sequences.update(id, { name: clean });
    await touch(sequence.projectId);
  });
}

/** Stores the poems of an order in a new order. Only this row changes (US08). */
export async function setSequenceOrder(id: string, itemIds: readonly string[]): Promise<void> {
  await db.transaction('rw', db.sequences, db.projects, async () => {
    const sequence = await db.sequences.get(id);
    if (!sequence) return;
    await db.sequences.update(id, { itemIds: [...new Set(itemIds)] });
    await touch(sequence.projectId);
  });
}

/** Deletes an order and returns the row, for Undo. The poems stay. */
export async function deleteSequence(id: string): Promise<Sequence | undefined> {
  return db.transaction('rw', db.sequences, db.projects, async () => {
    const sequence = await db.sequences.get(id);
    if (!sequence) return undefined;
    await db.sequences.delete(id);
    await touch(sequence.projectId);
    return sequence;
  });
}

export async function restoreSequence(sequence: Sequence): Promise<void> {
  await db.transaction('rw', db.sequences, db.projects, async () => {
    await db.sequences.put(sequence);
    await touch(sequence.projectId);
  });
}
