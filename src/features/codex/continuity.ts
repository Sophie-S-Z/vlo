import { clock } from '@/lib/clock';
import { db, type CodexEntry, type ContinuityKept } from '@/lib/db';
import type { CodexMatch } from './codex';

/*
 * The continuity check (roadmap 2 F66, plan Task N3). It runs on the device with two narrow rules and
 * never changes the text. Rule 1 marks a capital word in the middle of a sentence that is one letter away
 * from a Codex name, such as "Mria" for "Mira". Rule 2 marks a mention of an entry after the scene where it
 * leaves the story. Each mark has a reason, and "Not a problem" keeps it in the project.
 */

export type ContinuityRule = 'near-name' | 'left';

export interface ContinuityNote {
  from: number;
  to: number;
  rule: ContinuityRule;
  entryId: string;
  /** The words of the mark, as in the text. */
  word: string;
  /** Rule 1: the Codex name that the word is near. */
  name?: string;
  /** Rule 2: the item where the entry left the story. */
  leftIn?: string;
}

export interface ContinuityInput {
  /** The Codex names in a text. */
  match: (text: string) => CodexMatch[];
  /** Rule 1 reads English capitals, so it runs only in an English project. */
  nearNames: ReadonlyMap<string, { name: string; entryId: string }> | null;
  /** The entries that left the story before this item, by id, with the item where each one left. */
  left: ReadonlyMap<string, string>;
  /** The words that the writer kept with "Not a problem". */
  keptWords: ReadonlySet<string>;
}

/** The shortest name that rule 1 checks, and the shortest word. Shorter names give too many false marks. */
const MIN_LETTERS = 4;

/**
 * Each word of each Codex name and other name, in lower case, with its entry: "Mira Hale" gives "mira"
 * and "hale". A word that two entries share keeps the first entry.
 */
export function nameWords(entries: readonly CodexEntry[]): Map<string, { name: string; entryId: string }> {
  const out = new Map<string, { name: string; entryId: string }>();
  for (const entry of entries)
    for (const name of [entry.name, ...entry.aliases])
      for (const word of name.split(/[^\p{L}\p{N}'’-]+/u))
        if (word.length >= MIN_LETTERS && !out.has(word.toLowerCase()))
          out.set(word.toLowerCase(), { name: word, entryId: entry.id });
  return out;
}

/** True when two words are one edit apart: one letter changed, added or taken out, or two letters swapped. */
export function oneApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

/** A capital word, and what comes before it in the block. */
const CAPITAL_WORD = /(?<![\p{L}\p{N}'’-])\p{Lu}[\p{L}'’-]*(?![\p{L}\p{N}])/gu;
/** A sentence starts after one of these, or at the start of the block: an end mark, a quotation mark, a bracket or a dash. */
const SENTENCE_START = /(?:^|[.?!…:;"“”‘'([{«»—–-])\s*$/u;

export function continuityNotes(text: string, input: ContinuityInput): ContinuityNote[] {
  const notes: ContinuityNote[] = [];
  const named = input.match(text);
  if (input.left.size > 0)
    for (const { from, to, entryId } of named)
      if (input.left.has(entryId))
        notes.push({
          from,
          to,
          rule: 'left',
          entryId,
          word: text.slice(from, to),
          leftIn: input.left.get(entryId) ?? '',
        });
  const near = input.nearNames;
  if (near && near.size > 0) {
    CAPITAL_WORD.lastIndex = 0;
    for (let found = CAPITAL_WORD.exec(text); found !== null; found = CAPITAL_WORD.exec(text)) {
      const word = found[0].replace(/['’]s$/u, '');
      const from = found.index;
      const lower = word.toLowerCase();
      if (word.length < MIN_LETTERS || input.keptWords.has(word)) continue;
      // A Codex name and its plural, such as "the Hales" for "Hale", never mark.
      if (near.has(lower) || near.has(lower.replace(/s$/u, ''))) continue;
      if (SENTENCE_START.test(text.slice(0, from))) continue;
      if (named.some((m) => m.from <= from && from < m.to)) continue;
      for (const [other, { name, entryId }] of near)
        if (oneApart(lower, other)) {
          notes.push({ from, to: from + word.length, rule: 'near-name', entryId, word, name });
          break;
        }
    }
  }
  return notes.sort((a, b) => a.from - b.from);
}

/**
 * The entries that left the story before an item, with the item where each one left: the first "Leaves
 * the story" change at an earlier place. The scene of the change itself does not count, and neither does
 * an entry that the writer kept in this item.
 */
export function leftBefore(
  entries: readonly CodexEntry[],
  places: ReadonlyMap<string, number>,
  itemId: string,
  keptScenes: ReadonlySet<string>,
): Map<string, string> {
  const left = new Map<string, string>();
  const here = places.get(itemId);
  if (here === undefined) return left;
  for (const entry of entries) {
    if (keptScenes.has(sceneKey(entry.id, itemId))) continue;
    let first: { at: number; itemId: string } | null = null;
    for (const change of entry.changes ?? []) {
      const at = places.get(change.itemId);
      if (change.leaves && at !== undefined && at < here && (!first || at < first.at))
        first = { at, itemId: change.itemId };
    }
    if (first) left.set(entry.id, first.itemId);
  }
  return left;
}

/** The reason for a mark, for the cursor line. */
export function continuityReason(note: ContinuityNote, entryName: string, leftIn: string): string {
  return note.rule === 'near-name'
    ? `“${note.word}” is one letter away from “${note.name ?? entryName}”, a Codex name.`
    : `${entryName} left the story in “${leftIn}”.`;
}

/** The key of an entry in a scene, for a rule 2 mark that the writer kept. */
export const sceneKey = (entryId: string, itemId: string) => `${entryId}:${itemId}`;

/** "Not a problem": keeps a word (rule 1) or an entry in a scene (rule 2) in the project settings. */
export async function keepContinuity(
  projectId: string,
  kept: { word: string } | { scene: string },
): Promise<void> {
  await db.projects
    .where('id')
    .equals(projectId)
    .modify((project) => {
      const now: ContinuityKept = project.settings.continuity ?? { words: [], scenes: [] };
      project.settings = {
        ...project.settings,
        continuity:
          'word' in kept
            ? { ...now, words: [...new Set([...now.words, kept.word])] }
            : { ...now, scenes: [...new Set([...now.scenes, kept.scene])] },
      };
      project.updatedAt = clock.now();
    });
}
