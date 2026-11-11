import { useLiveQuery } from 'dexie-react-hooks';
import { clock } from '@/lib/clock';
import { flattenTree } from '@/features/binder/tree';
import { db, type CodexChange, type CodexEntry, type CodexKind, type Item } from '@/lib/db';
import { newId } from '@/lib/ids';
import { orderAfterLast, sortByOrder } from '@/lib/order';

/*
 * The Codex of a project (roadmap F42, plan Task H5): characters, places, things and lore, each with
 * other names and a note. It lives in its own table, so no export or share reads it. Only the reader panel
 * (F61) sends the notes of the names in its text. The books of a series share some entries (F59). People
 * stays the memoir's private-names tool (decision Q3).
 */

export const CODEX_KINDS: readonly { id: CodexKind; label: string; heading: string }[] = [
  { id: 'character', label: 'Character', heading: 'Characters' },
  { id: 'place', label: 'Place', heading: 'Places' },
  { id: 'thing', label: 'Thing', heading: 'Things' },
  { id: 'lore', label: 'Lore', heading: 'Lore' },
];

export const MAX_CODEX_NAME = 80;
export const MAX_CODEX_NOTE = 5000;
export const MAX_ALIASES = 20;
export const MAX_CHANGES = 200;
export const MAX_CHANGE_TEXT = 500;

/**
 * The Codex of a project: its own entries and the shared entries of its series (F59), in the order the
 * writer added them. A shared entry has the series id as its `projectId`.
 */
export async function codexFor(projectId: string): Promise<CodexEntry[]> {
  return db.transaction('r', db.series, db.codex, async () => {
    const series = await db.series.where('projectIds').equals(projectId).first();
    const scopes = series ? [projectId, series.id] : [projectId];
    return sortByOrder(await db.codex.where('projectId').anyOf(scopes).toArray());
  });
}

/** The Codex of a project, live. Undefined while it loads. */
export function useCodex(projectId: string): CodexEntry[] | undefined {
  return useLiveQuery(() => codexFor(projectId), [projectId]);
}

function cleanName(name: string): string {
  const clean = name.trim();
  if (clean === '') throw new RangeError('Type a name.');
  if (clean.length > MAX_CODEX_NAME)
    throw new RangeError(`A name can have up to ${String(MAX_CODEX_NAME)} characters.`);
  return clean;
}

/** Other names from a list with commas, such as "Mi, the girl". Each one once, and not the name itself. */
export function cleanAliases(typed: string, name: string): string[] {
  const out: string[] = [];
  for (const raw of typed.split(',')) {
    const alias = raw.trim();
    if (alias === '' || alias === name || out.includes(alias)) continue;
    if (alias.length > MAX_CODEX_NAME)
      throw new RangeError(`A name can have up to ${String(MAX_CODEX_NAME)} characters.`);
    out.push(alias);
  }
  if (out.length > MAX_ALIASES)
    throw new RangeError(`An entry can have up to ${String(MAX_ALIASES)} other names.`);
  return out;
}

async function touch(projectId: string): Promise<void> {
  await db.projects.update(projectId, { updatedAt: clock.now() });
}

export async function addEntry(projectId: string, kind: CodexKind, name: string): Promise<CodexEntry> {
  const clean = cleanName(name);
  return db.transaction('rw', db.codex, db.projects, async () => {
    const orders = (await db.codex.where('projectId').equals(projectId).toArray()).map((e) => e.order);
    const entry: CodexEntry = {
      id: newId(),
      projectId,
      kind,
      name: clean,
      aliases: [],
      order: orderAfterLast(orders),
    };
    await db.codex.add(entry);
    await touch(projectId);
    return entry;
  });
}

export async function updateEntry(
  id: string,
  patch: { kind?: CodexKind; name?: string; aliases?: string; note?: string },
): Promise<void> {
  await db.transaction('rw', db.codex, db.projects, async () => {
    const entry = await db.codex.get(id);
    if (!entry) return;
    const name = patch.name === undefined ? entry.name : cleanName(patch.name);
    const note = patch.note === undefined ? entry.note : patch.note.trim().slice(0, MAX_CODEX_NOTE);
    const next: CodexEntry = {
      ...entry,
      kind: patch.kind ?? entry.kind,
      name,
      aliases:
        patch.aliases === undefined
          ? entry.aliases.filter((a) => a !== name)
          : cleanAliases(patch.aliases, name),
    };
    if (note) next.note = note;
    else delete next.note;
    await db.codex.put(next);
    await touch(entry.projectId);
  });
}

/** Deletes an entry and returns it, for Undo. */
export async function deleteEntry(id: string): Promise<CodexEntry | undefined> {
  return db.transaction('rw', db.codex, db.projects, async () => {
    const entry = await db.codex.get(id);
    if (!entry) return undefined;
    await db.codex.delete(id);
    await touch(entry.projectId);
    return entry;
  });
}

export async function restoreEntry(entry: CodexEntry): Promise<void> {
  await db.transaction('rw', db.codex, db.projects, async () => {
    await db.codex.put(entry);
    await touch(entry.projectId);
  });
}

/* ------------------------------------------------------------------ Changes at a scene (F65) */

/** Adds a change to an entry, or saves one that the entry has. Returns the saved change. */
export async function saveChange(
  entryId: string,
  change: { id?: string; itemId: string; text: string; leaves: boolean },
): Promise<CodexChange> {
  const text = change.text.trim();
  if (text === '') throw new RangeError('Type the change.');
  if (text.length > MAX_CHANGE_TEXT)
    throw new RangeError(`A change can have up to ${String(MAX_CHANGE_TEXT)} characters.`);
  const saved: CodexChange = {
    id: change.id ?? newId(),
    itemId: change.itemId,
    text,
    ...(change.leaves ? { leaves: true } : {}),
  };
  await db.transaction('rw', db.codex, db.projects, async () => {
    const entry = await db.codex.get(entryId);
    if (!entry) throw new RangeError('This entry is not on this device now.');
    const changes = entry.changes ?? [];
    const known = changes.some((c) => c.id === saved.id);
    if (!known && changes.length >= MAX_CHANGES)
      throw new RangeError(`An entry can have up to ${String(MAX_CHANGES)} changes.`);
    await db.codex.put({
      ...entry,
      changes: known ? changes.map((c) => (c.id === saved.id ? saved : c)) : [...changes, saved],
    });
    await touch(entry.projectId);
  });
  return saved;
}

/** Deletes a change and returns it, for Undo. */
export async function deleteChange(entryId: string, changeId: string): Promise<CodexChange | undefined> {
  return db.transaction('rw', db.codex, db.projects, async () => {
    const entry = await db.codex.get(entryId);
    const gone = entry?.changes?.find((c) => c.id === changeId);
    if (!entry || !gone) return undefined;
    const { changes = [], ...rest } = entry;
    const left = changes.filter((c) => c.id !== changeId);
    await db.codex.put(left.length > 0 ? { ...rest, changes: left } : rest);
    await touch(entry.projectId);
    return gone;
  });
}

/** An item in reading order, with the title of its book. */
export interface ReadingItem {
  item: Item;
  book: string;
}

/**
 * The items of a project in reading order: the binder order. In a series, the books before it come
 * first, in the series order, and the books after it follow, so a change in book 1 holds in book 2.
 */
export async function readingOrder(projectId: string): Promise<ReadingItem[]> {
  return db.transaction('r', db.series, db.items, db.projects, async () => {
    const series = await db.series.where('projectIds').equals(projectId).first();
    const books = series?.projectIds ?? [projectId];
    const [items, projects] = await Promise.all([
      db.items.where('projectId').anyOf(books).toArray(),
      db.projects.bulkGet(books),
    ]);
    return books.flatMap((book, i) =>
      flattenTree(items.filter((item) => item.projectId === book)).map(({ item }) => ({
        item,
        book: projects[i]?.title ?? '',
      })),
    );
  });
}

/** The reading order of a project, live. Undefined while it loads. */
export function useReadingOrder(projectId: string): ReadingItem[] | undefined {
  return useLiveQuery(() => readingOrder(projectId), [projectId]);
}

/** The place of each item in reading order, from 0. */
export const placesOf = (order: readonly ReadingItem[]): ReadonlyMap<string, number> =>
  new Map(order.map(({ item }, i) => [item.id, i]));

/**
 * The changes of an entry that hold at an item, in reading order: those at the item or before it. A
 * change whose scene is gone holds nowhere, and so does each change at an item with no place.
 */
export function changesAt(
  entry: CodexEntry,
  places: ReadonlyMap<string, number>,
  itemId: string,
): CodexChange[] {
  const here = places.get(itemId);
  if (here === undefined) return [];
  return (entry.changes ?? [])
    .map((change) => ({ change, at: places.get(change.itemId) ?? Infinity }))
    .filter(({ at }) => at <= here)
    .sort((a, b) => a.at - b.at)
    .map(({ change }) => change);
}

/** Ends a part of a note with a period, unless it ends with a period, a question mark or an exclamation mark. */
const stop = (text: string) => (/[.?!]$/.test(text) ? text : `${text}.`);

/** The entry as it is at an item: its note, then the text of each change that holds there. */
export function entryAt(entry: CodexEntry, places: ReadonlyMap<string, number>, itemId: string): CodexEntry {
  const held = changesAt(entry, places, itemId);
  if (held.length === 0) return entry;
  const parts = [entry.note?.trim() ?? '', ...held.map((change) => change.text)].filter(Boolean);
  return { ...entry, note: parts.map(stop).join(' ') };
}

/** The Codex of a project as it is at an item (F65), for the reader panel. */
export async function codexAt(projectId: string, itemId: string): Promise<CodexEntry[]> {
  const [entries, order] = await Promise.all([codexFor(projectId), readingOrder(projectId)]);
  const places = placesOf(order);
  return entries.map((entry) => entryAt(entry, places, itemId));
}

export interface CodexMatch {
  from: number;
  to: number;
  entryId: string;
}

/**
 * Finds the names of the entries in a text: whole words, in the case that the writer typed, the longest
 * name first. "Mira" finds "Mira's" and not "Miranda". A name that two entries share finds the first one.
 */
export function codexMatcher(entries: readonly CodexEntry[]): (text: string) => CodexMatch[] {
  const owner = new Map<string, string>();
  for (const entry of entries)
    for (const name of [entry.name, ...entry.aliases]) if (!owner.has(name)) owner.set(name, entry.id);
  if (owner.size === 0) return () => [];
  const names = [...owner.keys()].sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  return (text) => {
    const found: CodexMatch[] = [];
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
      const entryId = owner.get(match[0]);
      if (entryId) found.push({ from: match.index, to: match.index + match[0].length, entryId });
    }
    return found;
  };
}

/** How many times each entry's names come in each item's text. An item with no mention has no count. */
export function mentionMatrix(
  entries: readonly CodexEntry[],
  texts: readonly { itemId: string; text: string }[],
): Map<string, Map<string, number>> {
  const match = codexMatcher(entries);
  const matrix = new Map(entries.map((entry) => [entry.id, new Map<string, number>()]));
  for (const { itemId, text } of texts)
    for (const { entryId } of match(text)) {
      const row = matrix.get(entryId);
      row?.set(itemId, (row.get(itemId) ?? 0) + 1);
    }
  return matrix;
}
