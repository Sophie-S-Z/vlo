import { useLiveQuery } from 'dexie-react-hooks';
import { clock } from '@/lib/clock';
import { db, type CodexEntry, type CodexKind } from '@/lib/db';
import { newId } from '@/lib/ids';
import { orderAfterLast, sortByOrder } from '@/lib/order';

/*
 * The Codex of a project (roadmap F42, plan Task H5): characters, places, things and lore, each with
 * other names and a note. It lives in its own table, so no export, share or AI request reads it. People
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

/** The entries of a project in the order the writer added them, live. Undefined while they load. */
export function useCodex(projectId: string): CodexEntry[] | undefined {
  return useLiveQuery(
    async () => sortByOrder(await db.codex.where('projectId').equals(projectId).toArray()),
    [projectId],
  );
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
