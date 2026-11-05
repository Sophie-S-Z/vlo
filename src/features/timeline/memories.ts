import { clock } from '@/lib/clock';
import { db, type Item, type LifeStage } from '@/lib/db';
import { newId } from '@/lib/ids';
import { orderAfterLast, orderBetween, sortByOrder } from '@/lib/order';
import { compareDates, isDate } from './dates';

/*
 * Memory Timeline data (spec 8.2, plan Task C4): the date, themes and life stage of each memory, and the
 * life stages of a memoir. Each change also marks the project as changed, for the Library order, the
 * backup reminder and folder save.
 */

async function touch(projectId: string, now: number): Promise<void> {
  await db.projects.update(projectId, { updatedAt: now });
}

function checkDate(value: string, what: string): string {
  const trimmed = value.trim();
  if (!isDate(trimmed))
    throw new RangeError(
      `The ${what} date must be a year, a month or a day, such as 1994, 1994-07 or 1994-07-12.`,
    );
  return trimmed;
}

/** Themes without empty entries or repeats. Case does not make a new theme; the first spelling stays. */
export function cleanThemes(themes: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of themes) {
    const theme = raw.trim();
    const key = theme.toLocaleLowerCase();
    if (theme === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(theme);
  }
  return out;
}

export interface MemoryPatch {
  /** A date, or null to make the memory undated. */
  date?: string | null;
  lifeStageId?: string | null;
  themes?: readonly string[];
}

export async function setMemory(itemId: string, patch: MemoryPatch): Promise<void> {
  const date = patch.date === undefined || patch.date === null ? patch.date : checkDate(patch.date, 'memory');
  const now = clock.now();
  await db.transaction('rw', db.items, db.projects, async () => {
    const item = await db.items.get(itemId);
    if (!item) return;
    const next: NonNullable<Item['memory']> = { ...(item.memory ?? { themes: [] }) };
    if (date === null) delete next.date;
    else if (date !== undefined) next.date = date;
    if (patch.lifeStageId === null) delete next.lifeStageId;
    else if (patch.lifeStageId !== undefined) next.lifeStageId = patch.lifeStageId;
    if (patch.themes !== undefined) next.themes = cleanThemes(patch.themes);
    await db.items.update(itemId, { memory: next, updatedAt: now });
    await touch(item.projectId, now);
  });
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Every theme of a project's memories, in alphabetical order. The spelling of the first item in order stays. */
export function themesOf(items: readonly Item[]): string[] {
  return cleanThemes(sortByOrder(items).flatMap((i) => i.memory?.themes ?? [])).sort(collator.compare);
}

/** Memories in date order, undated ones last, in their given order. */
export function inDateOrder(memories: readonly Item[]): Item[] {
  return [...memories].sort((a, b) => {
    const x = a.memory?.date;
    const y = b.memory?.date;
    if (x === undefined || y === undefined) return (x === undefined ? 1 : 0) - (y === undefined ? 1 : 0);
    return compareDates(x, y);
  });
}

/**
 * The theme columns (US07): each memory once under each of its themes, and the memories with no theme
 * under `null`. Within a column, memories keep date order.
 */
export function byTheme(memories: readonly Item[]): { theme: string | null; memories: Item[] }[] {
  const ordered = inDateOrder(memories);
  const columns: { theme: string | null; memories: Item[] }[] = themesOf(memories).map((theme) => ({
    theme,
    memories: ordered.filter((m) =>
      (m.memory?.themes ?? []).some((t) => t.toLocaleLowerCase() === theme.toLocaleLowerCase()),
    ),
  }));
  const loose = ordered.filter((m) => (m.memory?.themes ?? []).length === 0);
  if (loose.length > 0) columns.push({ theme: null, memories: loose });
  return columns;
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') throw new RangeError('A life stage needs a name.');
  return trimmed;
}

function checkSpan(start: string, end: string): void {
  if (compareDates(end, start) < 0) throw new RangeError('A life stage must end after it starts.');
}

export async function addStage(
  projectId: string,
  stage: { name: string; start: string; end: string; color: string },
): Promise<LifeStage> {
  const name = cleanName(stage.name);
  const start = checkDate(stage.start, 'start');
  const end = checkDate(stage.end, 'end');
  checkSpan(start, end);
  const now = clock.now();
  return db.transaction('rw', db.lifeStages, db.projects, async () => {
    const stages = await db.lifeStages.where('projectId').equals(projectId).toArray();
    const row: LifeStage = {
      id: newId(),
      projectId,
      name,
      start,
      end,
      color: stage.color,
      order: orderAfterLast(stages.map((s) => s.order)),
    };
    await db.lifeStages.add(row);
    await touch(projectId, now);
    return row;
  });
}

export async function updateStage(
  id: string,
  patch: Partial<Pick<LifeStage, 'name' | 'start' | 'end' | 'color'>>,
): Promise<void> {
  const now = clock.now();
  await db.transaction('rw', db.lifeStages, db.projects, async () => {
    const stage = await db.lifeStages.get(id);
    if (!stage) return;
    const next = {
      name: patch.name === undefined ? stage.name : cleanName(patch.name),
      start: patch.start === undefined ? stage.start : checkDate(patch.start, 'start'),
      end: patch.end === undefined ? stage.end : checkDate(patch.end, 'end'),
      color: patch.color ?? stage.color,
    };
    checkSpan(next.start, next.end);
    await db.lifeStages.update(id, next);
    await touch(stage.projectId, now);
  });
}

/** Moves a life stage one place up (-1) or down (1) in the list. */
export async function moveStage(id: string, step: -1 | 1): Promise<void> {
  const now = clock.now();
  await db.transaction('rw', db.lifeStages, db.projects, async () => {
    const stage = await db.lifeStages.get(id);
    if (!stage) return;
    const stages = sortByOrder(await db.lifeStages.where('projectId').equals(stage.projectId).toArray());
    const at = stages.findIndex((s) => s.id === id);
    const target = at + step;
    if (target < 0 || target >= stages.length) return;
    const before = step === -1 ? (stages[target - 1]?.order ?? null) : (stages[target]?.order ?? null);
    const after = step === -1 ? (stages[target]?.order ?? null) : (stages[target + 1]?.order ?? null);
    await db.lifeStages.update(id, { order: orderBetween(before, after) });
    await touch(stage.projectId, now);
  });
}

/** Deletes a life stage. Its memories keep their dates and lose only the stage. */
export async function deleteStage(id: string): Promise<void> {
  const now = clock.now();
  await db.transaction('rw', db.lifeStages, db.items, db.projects, async () => {
    const stage = await db.lifeStages.get(id);
    if (!stage) return;
    await db.items
      .where('projectId')
      .equals(stage.projectId)
      .filter((i) => i.memory?.lifeStageId === id)
      .modify((i) => {
        if (i.memory) delete i.memory.lifeStageId;
      });
    await db.lifeStages.delete(id);
    await touch(stage.projectId, now);
  });
}
