import { useLiveQuery } from 'dexie-react-hooks';
import { clock } from '@/lib/clock';
import { db, type Series, type StyleRule } from '@/lib/db';
import { newId } from '@/lib/ids';

/*
 * A series of books (roadmap F59, plan Task K8, decision K6). The books share Codex entries and one style
 * sheet. A shared entry belongs to the series: its `projectId` is the series id, so it syncs and backs up
 * with the series row. A project is in at most one series.
 */

export const MAX_SERIES_TITLE = 120;
export const MAX_RULES = 200;

/** The series of a project, or undefined. */
export const seriesOf = (projectId: string): Promise<Series | undefined> =>
  db.series.where('projectIds').equals(projectId).first();

/** The series of a project, live. Null when it has none, and undefined while it loads. */
export function useSeriesOf(projectId: string): Series | null | undefined {
  return useLiveQuery(async () => (await seriesOf(projectId)) ?? null, [projectId]);
}

function cleanTitle(title: string): string {
  const clean = title.trim();
  if (clean === '') throw new RangeError('Type a title for the series.');
  if (clean.length > MAX_SERIES_TITLE)
    throw new RangeError(`A title can have up to ${String(MAX_SERIES_TITLE)} characters.`);
  return clean;
}

/** Makes a series of one or more books, in the order given. A book in another series stays there. */
export async function makeSeries(title: string, projectIds: readonly string[]): Promise<Series> {
  const clean = cleanTitle(title);
  return db.transaction('rw', db.series, async () => {
    const free: string[] = [];
    for (const id of new Set(projectIds)) if (!(await seriesOf(id))) free.push(id);
    if (free.length === 0) throw new RangeError('Each of these books is in a series now.');
    const series: Series = {
      id: newId(),
      title: clean,
      projectIds: free,
      styleSheet: [],
      updatedAt: clock.now(),
    };
    await db.series.add(series);
    return series;
  });
}

async function change(seriesId: string, patch: (series: Series) => void): Promise<void> {
  await db.series
    .where('id')
    .equals(seriesId)
    .modify((series) => {
      patch(series);
      series.updatedAt = clock.now();
    });
}

/** Adds a book at the end of the series. A book in a series must leave it first. */
export async function addToSeries(seriesId: string, projectId: string): Promise<void> {
  await db.transaction('rw', db.series, async () => {
    if (await seriesOf(projectId)) throw new RangeError('This book is in a series now. Leave it first.');
    await change(seriesId, (series) => {
      series.projectIds.push(projectId);
    });
  });
}

/** Moves the book at `from` to `to` in the order of the series. */
export async function moveBook(seriesId: string, from: number, to: number): Promise<void> {
  await change(seriesId, (series) => {
    const [book] = series.projectIds.splice(from, 1);
    if (book !== undefined) series.projectIds.splice(to, 0, book);
  });
}

/**
 * Takes a book out of its series. The book keeps a copy of each shared entry whose names its text holds,
 * so no name loses its entry. When the last book leaves, the series and its shared entries go.
 */
export async function leaveSeries(projectId: string): Promise<void> {
  // The Codex matcher loads here, out of the Library's first load. It must load before the transaction.
  const { codexMatcher } = await import('@/features/codex/codex');
  await db.transaction('rw', db.series, db.codex, db.itemTexts, async () => {
    const series = await seriesOf(projectId);
    if (!series) return;
    const shared = await db.codex.where('projectId').equals(series.id).toArray();
    const texts = await db.itemTexts.where('projectId').equals(projectId).toArray();
    const used = new Set<string>();
    const match = codexMatcher(shared);
    for (const { text } of texts) for (const m of match(text)) used.add(m.entryId);
    await db.codex.bulkAdd(
      shared.filter((e) => used.has(e.id)).map((e) => ({ ...e, id: newId(), projectId })),
    );
    await dropBook(series, projectId);
  });
}

/**
 * Removes a book from its series with no copies, as when the book is deleted. Call it in a transaction
 * that holds `db.series` and `db.codex`.
 */
export async function dropBook(series: Series, projectId: string): Promise<void> {
  if (series.projectIds.length <= 1) {
    await db.codex.where('projectId').equals(series.id).delete();
    await db.series.delete(series.id);
    return;
  }
  await change(series.id, (s) => {
    s.projectIds = s.projectIds.filter((id) => id !== projectId);
  });
}

/** Shares an entry with the book's series, or gives it back to the book alone. */
export async function shareEntry(entryId: string, projectId: string, shared: boolean): Promise<void> {
  await db.transaction('rw', db.series, db.codex, async () => {
    const series = await seriesOf(projectId);
    if (!series) throw new RangeError('This book is in no series.');
    await db.codex.update(entryId, { projectId: shared ? series.id : projectId });
  });
}

/** The rule of a style sheet from the typed fields: the form to use and the forms to avoid, with commas. */
export function styleRule(use: string, avoid: string, note = ''): StyleRule {
  const form = use.trim();
  if (form === '') throw new RangeError('Type the form to use.');
  // The check finds a form in any case, so a form to avoid never differs from `use` by case alone.
  const forms = [...new Set(avoid.split(',').map((a) => a.trim()))].filter(
    (a) => a !== '' && a.toLowerCase() !== form.toLowerCase(),
  );
  if (forms.length === 0) throw new RangeError('Type at least one form to avoid.');
  const clean = note.trim();
  return { use: form, avoid: forms, ...(clean ? { note: clean } : {}) };
}

export async function setStyleSheet(seriesId: string, rules: readonly StyleRule[]): Promise<void> {
  if (rules.length > MAX_RULES)
    throw new RangeError(`A style sheet can have up to ${String(MAX_RULES)} rules.`);
  await change(seriesId, (series) => {
    series.styleSheet = [...rules];
  });
}

export async function renameSeries(seriesId: string, title: string): Promise<void> {
  const clean = cleanTitle(title);
  await change(seriesId, (series) => {
    series.title = clean;
  });
}
