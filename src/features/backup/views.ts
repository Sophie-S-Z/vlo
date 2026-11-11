import type { CodexEntry, CodexKind, SourceType, SubmissionStatus, ViewRows } from '@/lib/db';
import { emptyViewRows, SOURCE_TYPES } from '@/lib/db';
import { SOURCE_KEY } from '@/features/cite/sources';
import { newId } from '@/lib/ids';
import {
  checkOrder,
  checkRows,
  count,
  DAMAGED,
  fail,
  id,
  ID,
  list,
  optionalText,
  text,
  type Json,
} from './check';

/*
 * The view rows in a backup file (plan Tasks C1, H5 and M5): board cards, threads and links, life stages,
 * poem orders, people, submissions, Codex entries and sources. A version 1 file has none of them. Each reference must point to a
 * row of the same file, except a submission, which may name a piece that the writer deleted.
 */

const CODEX_KINDS: readonly CodexKind[] = ['character', 'place', 'thing', 'lore'];

const SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  'sent',
  'accepted',
  'declined',
  'withdrawn',
  'no-reply',
];

/** A number that may be below zero, such as a board position. */
function coordinate(row: Json, key: string, what: string): void {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${DAMAGED} ${what} has a wrong ${key}.`);
}

export function ids(row: Json, key: string, what: string): string[] {
  const value = row[key];
  if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string' && ID.test(v)))
    fail(`${DAMAGED} ${what} has a wrong ${key}.`);
  return value;
}

function unique(rows: Json[], what: string): Set<string> {
  const seen = new Set<string>();
  for (const row of rows) {
    const rowId = id(row, 'id', what);
    if (seen.has(rowId)) fail(`${DAMAGED} Two rows of ${what} share one id.`);
    seen.add(rowId);
  }
  return seen;
}

/** The rows of one Phase 3 table, or none when the file is older than the table. */
function rowsOf(manifest: Json, key: keyof ViewRows): Json[] {
  return manifest[key] === undefined ? [] : list(manifest, key);
}

/** Checks the Phase 3 rows of a backup file against its project and items. */
export function checkViews(manifest: Json, projectId: string, itemIds: ReadonlySet<string>): ViewRows {
  const views = emptyViewRows();

  const cardRows = rowsOf(manifest, 'cards');
  const cardIds = unique(cardRows, 'the board cards');
  views.cards = checkRows(cardRows, projectId, 'A board card', (row) => {
    if (row.itemId !== undefined && !itemIds.has(id(row, 'itemId', 'A board card')))
      fail(`${DAMAGED} A board card links to an item that is not in it.`);
    text(row, 'title', 'A board card');
    optionalText(row, 'note', 'A board card');
    coordinate(row, 'x', 'A board card');
    coordinate(row, 'y', 'A board card');
    text(row, 'color', 'A board card');
  });

  const threadRows = rowsOf(manifest, 'threads');
  const threadIds = unique(threadRows, 'the threads');
  views.threads = checkRows(threadRows, projectId, 'A thread', (row) => {
    text(row, 'name', 'A thread');
    text(row, 'color', 'A thread');
    checkOrder(text(row, 'order', 'A thread'), 'A thread');
  });

  const linkRows = rowsOf(manifest, 'cardLinks');
  unique(linkRows, 'the card links');
  views.cardLinks = checkRows(linkRows, projectId, 'A card link', (row) => {
    for (const key of ['fromCardId', 'toCardId'])
      if (!cardIds.has(id(row, key, 'A card link'))) fail(`${DAMAGED} A card link has no card.`);
    if (row.threadId !== undefined && !threadIds.has(id(row, 'threadId', 'A card link')))
      fail(`${DAMAGED} A card link has no thread.`);
  });

  const stageRows = rowsOf(manifest, 'lifeStages');
  unique(stageRows, 'the life stages');
  views.lifeStages = checkRows(stageRows, projectId, 'A life stage', (row) => {
    for (const key of ['name', 'start', 'end', 'color']) text(row, key, 'A life stage');
    checkOrder(text(row, 'order', 'A life stage'), 'A life stage');
  });

  const sequenceRows = rowsOf(manifest, 'sequences');
  unique(sequenceRows, 'the poem orders');
  views.sequences = checkRows(sequenceRows, projectId, 'A poem order', (row) => {
    text(row, 'name', 'A poem order');
    if (!ids(row, 'itemIds', 'A poem order').every((itemId) => itemIds.has(itemId)))
      fail(`${DAMAGED} A poem order holds a poem that is not in it.`);
    count(row, 'createdAt', 'A poem order');
  });

  const personRows = rowsOf(manifest, 'people');
  unique(personRows, 'the people');
  views.people = checkRows(personRows, projectId, 'A person', (row) => {
    text(row, 'label', 'A person');
    const variants = row.variants;
    if (
      !Array.isArray(variants) ||
      !variants.every(
        (v: unknown) =>
          typeof v === 'object' &&
          v !== null &&
          typeof (v as Json).real === 'string' &&
          typeof (v as Json).alias === 'string',
      )
    )
      fail(`${DAMAGED} A person has wrong names.`);
  });

  const submissionRows = rowsOf(manifest, 'submissions');
  unique(submissionRows, 'the submissions');
  views.submissions = checkRows(submissionRows, projectId, 'A submission', (row) => {
    ids(row, 'itemIds', 'A submission');
    text(row, 'venue', 'A submission');
    text(row, 'sentAt', 'A submission');
    if (!SUBMISSION_STATUSES.includes(text(row, 'status', 'A submission') as SubmissionStatus))
      fail(`${DAMAGED} A submission has a wrong status.`);
    optionalText(row, 'replyAt', 'A submission');
    optionalText(row, 'notes', 'A submission');
  });

  views.codex = checkCodex(rowsOf(manifest, 'codex'), projectId);

  const sourceRows = rowsOf(manifest, 'sources');
  unique(sourceRows, 'the sources');
  // Two devices can add the same key before they sync, so a key can be on two rows. The first one is cited.
  views.sources = checkRows(sourceRows, projectId, 'A source', (row) => {
    if (!SOURCE_KEY.test(text(row, 'key', 'A source'))) fail(`${DAMAGED} A source has a wrong key.`);
    if (!SOURCE_TYPES.includes(text(row, 'type', 'A source') as SourceType))
      fail(`${DAMAGED} A source has a wrong type.`);
    names(row, 'authors');
    if (row.editors !== undefined) names(row, 'editors');
    text(row, 'title', 'A source');
    for (const key of ['container', 'publisher', 'year', 'volume', 'issue', 'pages', 'doi', 'url'])
      optionalText(row, key, 'A source');
  });

  return views;
}

/** The authors or editors of a source: a list of names, each with a family name. */
function names(row: Json, key: string): void {
  const value = row[key];
  if (
    !Array.isArray(value) ||
    !value.every(
      (name: unknown) =>
        typeof name === 'object' &&
        name !== null &&
        typeof (name as Json).family === 'string' &&
        ((name as Json).given === undefined || typeof (name as Json).given === 'string'),
    )
  )
    fail(`${DAMAGED} A source has wrong ${key}.`);
}

/** Codex entries of a project, or the shared entries of a series (F59) when `scopeId` is the series id. */
export function checkCodex(rows: Json[], scopeId: string): CodexEntry[] {
  unique(rows, 'the Codex entries');
  return checkRows(rows, scopeId, 'A Codex entry', (row) => {
    if (!CODEX_KINDS.includes(text(row, 'kind', 'A Codex entry') as CodexKind))
      fail(`${DAMAGED} A Codex entry has a wrong kind.`);
    if (text(row, 'name', 'A Codex entry').trim() === '') fail(`${DAMAGED} A Codex entry has no name.`);
    const aliases = row.aliases;
    if (!Array.isArray(aliases) || !aliases.every((a: unknown) => typeof a === 'string'))
      fail(`${DAMAGED} A Codex entry has wrong other names.`);
    optionalText(row, 'note', 'A Codex entry');
    checkOrder(text(row, 'order', 'A Codex entry'), 'A Codex entry');
    if (row.changes !== undefined) changes(row.changes);
  });
}

/**
 * The changes of a Codex entry at scenes (F65). A change may name a scene of another book of the series,
 * or a deleted scene, which hold nowhere here.
 */
function changes(value: unknown): void {
  if (!Array.isArray(value)) fail(`${DAMAGED} A Codex entry has wrong changes.`);
  for (const change of value) {
    if (typeof change !== 'object' || change === null) fail(`${DAMAGED} A Codex entry has wrong changes.`);
    const row = change as Json;
    for (const key of ['id', 'itemId', 'text']) text(row, key, 'A Codex change');
    if (row.leaves !== undefined && row.leaves !== true)
      fail(`${DAMAGED} A Codex change has a wrong leaves.`);
  }
}

/**
 * The Phase 3 rows with new ids, for an import as a copy. `itemId` gives each item's new id. The result
 * also maps each old life stage id to its new id, for the memories that name one, each old person id
 * to its new id, for the private-name marks in the text, and each old Codex entry id to its new id.
 */
export function copyViews(
  views: ViewRows,
  projectId: string,
  itemId: (old: string) => string,
): {
  views: ViewRows;
  lifeStageId: (old: string) => string;
  personId: (old: string) => string | null;
  entryId: (old: string) => string | null;
} {
  const fresh = (rows: readonly { id: string }[]) => new Map(rows.map((row) => [row.id, newId()]));
  const cardIds = fresh(views.cards);
  const threadIds = fresh(views.threads);
  const stageIds = fresh(views.lifeStages);
  const personIds = fresh(views.people);
  const entryIds = fresh(views.codex);
  const from = (map: Map<string, string>) => (old: string) => map.get(old) ?? old;
  const cardId = from(cardIds);
  const threadId = from(threadIds);
  const lifeStageId = from(stageIds);
  return {
    lifeStageId,
    personId: (old) => personIds.get(old) ?? null,
    entryId: (old) => entryIds.get(old) ?? null,
    views: {
      cards: views.cards.map((card) => ({
        ...card,
        id: cardId(card.id),
        projectId,
        ...(card.itemId === undefined ? {} : { itemId: itemId(card.itemId) }),
      })),
      threads: views.threads.map((thread) => ({ ...thread, id: threadId(thread.id), projectId })),
      cardLinks: views.cardLinks.map((link) => ({
        ...link,
        id: newId(),
        projectId,
        fromCardId: cardId(link.fromCardId),
        toCardId: cardId(link.toCardId),
        ...(link.threadId === undefined ? {} : { threadId: threadId(link.threadId) }),
      })),
      lifeStages: views.lifeStages.map((stage) => ({ ...stage, id: lifeStageId(stage.id), projectId })),
      sequences: views.sequences.map((sequence) => ({
        ...sequence,
        id: newId(),
        projectId,
        itemIds: sequence.itemIds.map(itemId),
      })),
      people: views.people.map((person) => ({
        ...person,
        id: personIds.get(person.id) ?? newId(),
        projectId,
      })),
      submissions: views.submissions.map((submission) => ({
        ...submission,
        id: newId(),
        projectId,
        itemIds: submission.itemIds.map(itemId),
      })),
      codex: views.codex.map(({ changes, ...entry }) => {
        // A change of a scene that is not in this file, such as one in another book, holds nowhere in the
        // copy, so it stays out. `itemId` gives back the old id for such a scene.
        const kept = (changes ?? [])
          .filter((change) => itemId(change.itemId) !== change.itemId)
          .map((change) => ({ ...change, itemId: itemId(change.itemId) }));
        return {
          ...entry,
          id: entryIds.get(entry.id) ?? newId(),
          projectId,
          ...(kept.length > 0 ? { changes: kept } : {}),
        };
      }),
      // A citation names its source by key, so the keys stay as they are.
      sources: views.sources.map((source) => ({ ...source, id: newId(), projectId })),
    },
  };
}
