import { useLiveQuery } from 'dexie-react-hooks';
import { clock } from '@/lib/clock';
import { db, type Project, type Submission, type SubmissionStatus } from '@/lib/db';
import { newId } from '@/lib/ids';

/*
 * The Submissions tracker data (spec 8.4, plan Task C8, F20, E4). Each row logs the pieces sent to one
 * venue, the dates and the status. A deleted piece keeps its id in the row, so the table shows "Deleted
 * piece". Each venue can keep its own follow-up days, 90 by default.
 */

export const STATUS_LABEL: Readonly<Record<SubmissionStatus, string>> = {
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
  'no-reply': 'No reply',
};

export const STATUSES: readonly SubmissionStatus[] = [
  'sent',
  'accepted',
  'declined',
  'withdrawn',
  'no-reply',
];

export const DEFAULT_FOLLOW_UP = 90;
export const MAX_FOLLOW_UP = 3650;
export const MAX_VENUE = 120;
export const MAX_NOTES = 2000;
export const DELETED_PIECE = 'Deleted piece';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The local calendar date as YYYY-MM-DD. */
export function todayIso(now: number = clock.now()): string {
  const date = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The day number of a YYYY-MM-DD date, or null for a value that is not a real date. */
function dayNumber(value: string): number | null {
  const match = ISO.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const back = new Date(time);
  // Date.UTC moves "2026-02-30" into March, so a round trip finds a date that does not exist.
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day)
    return null;
  return time / 86_400_000;
}

export function isIsoDate(value: string): boolean {
  return dayNumber(value) !== null;
}

/** Whole days from `from` to `to`. Calendar days, so a daylight saving change never counts. */
export function daysBetween(from: string, to: string): number {
  const a = dayNumber(from);
  const b = dayNumber(to);
  return a === null || b === null ? 0 : b - a;
}

/** The key of a venue for its follow-up days: "Agni" and " agni " are the same venue. */
export function venueKey(venue: string): string {
  return venue.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function followUpDaysFor(settings: Pick<Project['settings'], 'followUpDays'>, venue: string): number {
  return settings.followUpDays?.[venueKey(venue)] ?? DEFAULT_FOLLOW_UP;
}

/** True when a sent piece has had no reply for the venue's follow-up days (E4). */
export function needsFollowUp(submission: Submission, days: number, today: string): boolean {
  return (
    submission.status === 'sent' &&
    submission.replyAt === undefined &&
    daysBetween(submission.sentAt, today) >= days
  );
}

/** The titles of a row's pieces, with "Deleted piece" for an item that is gone. */
export function piecesText(submission: Submission, titles: ReadonlyMap<string, string>): string {
  return submission.itemIds.map((id) => titles.get(id) ?? DELETED_PIECE).join(', ');
}

export type SortKey = 'pieces' | 'venue' | 'sentAt' | 'status' | 'replyAt' | 'notes';
export type SortDirection = 'asc' | 'desc';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * The rows in the order of one column. Text sorts without regard to case. An empty reply date or note
 * goes last in both directions, so the rows with a value stay together.
 */
export function sortSubmissions(
  rows: readonly Submission[],
  key: SortKey,
  direction: SortDirection,
  pieces: (submission: Submission) => string,
): Submission[] {
  const valueOf = (s: Submission): string => {
    switch (key) {
      case 'pieces':
        return pieces(s);
      case 'status':
        return STATUS_LABEL[s.status];
      case 'replyAt':
        return s.replyAt ?? '';
      case 'notes':
        return s.notes ?? '';
      default:
        return s[key];
    }
  };
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: valueOf(row) }))
    .sort((a, b) => {
      if (a.value === '' || b.value === '') {
        if (a.value === b.value) return a.index - b.index;
        return a.value === '' ? 1 : -1;
      }
      return sign * collator.compare(a.value, b.value) || a.index - b.index;
    })
    .map((entry) => entry.row);
}

export interface SubmissionDraft {
  itemIds: readonly string[];
  venue: string;
  sentAt: string;
  status: SubmissionStatus;
  replyAt?: string | undefined;
  notes?: string | undefined;
}

/** Checks and trims a draft. Each refusal is a RangeError with a message for the writer. */
export function cleanDraft(draft: SubmissionDraft): Omit<Submission, 'id' | 'projectId'> {
  const itemIds = [...new Set(draft.itemIds)];
  if (itemIds.length === 0) throw new RangeError('Choose at least one piece.');
  const venue = draft.venue.trim().replace(/\s+/g, ' ');
  if (venue === '') throw new RangeError('Type the venue.');
  if (venue.length > MAX_VENUE) throw new RangeError(`Keep the venue to ${String(MAX_VENUE)} characters.`);
  if (!isIsoDate(draft.sentAt)) throw new RangeError('Type the sent date as a date.');
  if (!STATUSES.includes(draft.status)) throw new RangeError('Choose a status.');
  const replyAt = draft.replyAt?.trim() ?? '';
  if (replyAt !== '' && !isIsoDate(replyAt)) throw new RangeError('Type the reply date as a date.');
  if (replyAt !== '' && daysBetween(draft.sentAt, replyAt) < 0)
    throw new RangeError('The reply date comes before the sent date.');
  const notes = draft.notes?.trim() ?? '';
  if (notes.length > MAX_NOTES) throw new RangeError(`Keep the notes to ${String(MAX_NOTES)} characters.`);
  return {
    itemIds,
    venue,
    sentAt: draft.sentAt,
    status: draft.status,
    ...(replyAt === '' ? {} : { replyAt }),
    ...(notes === '' ? {} : { notes }),
  };
}

/** The project's submissions, oldest first. Undefined while loading. */
export function useSubmissions(projectId: string): Submission[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.submissions.where('projectId').equals(projectId).toArray()).sort(
        (a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
      ),
    [projectId],
  );
}

async function touch(projectId: string): Promise<void> {
  await db.projects.update(projectId, { updatedAt: clock.now() });
}

export async function addSubmission(projectId: string, draft: SubmissionDraft): Promise<Submission> {
  const row: Submission = { id: newId(), projectId, ...cleanDraft(draft) };
  await db.transaction('rw', db.submissions, db.projects, async () => {
    await db.submissions.add(row);
    await touch(projectId);
  });
  return row;
}

export async function updateSubmission(id: string, draft: SubmissionDraft): Promise<void> {
  const clean = cleanDraft(draft);
  await db.transaction('rw', db.submissions, db.projects, async () => {
    const row = await db.submissions.get(id);
    if (!row) return;
    // A put, so a reply date or note that the writer cleared goes away.
    await db.submissions.put({ id, projectId: row.projectId, ...clean });
    await touch(row.projectId);
  });
}

export async function setSubmissionStatus(id: string, status: SubmissionStatus): Promise<void> {
  await db.transaction('rw', db.submissions, db.projects, async () => {
    const row = await db.submissions.get(id);
    if (!row) return;
    await db.submissions.update(id, { status });
    await touch(row.projectId);
  });
}

/** Deletes a row and returns it, for Undo. */
export async function deleteSubmission(id: string): Promise<Submission | undefined> {
  return db.transaction('rw', db.submissions, db.projects, async () => {
    const row = await db.submissions.get(id);
    if (!row) return undefined;
    await db.submissions.delete(id);
    await touch(row.projectId);
    return row;
  });
}

export async function restoreSubmission(row: Submission): Promise<void> {
  await db.transaction('rw', db.submissions, db.projects, async () => {
    await db.submissions.put(row);
    await touch(row.projectId);
  });
}

/** Keeps the follow-up days of one venue (E4). */
export async function setFollowUpDays(projectId: string, venue: string, days: number): Promise<void> {
  if (!Number.isInteger(days) || days < 1 || days > MAX_FOLLOW_UP)
    throw new RangeError(`Type a number of days from 1 to ${String(MAX_FOLLOW_UP)}.`);
  const key = venueKey(venue);
  if (key === '') throw new RangeError('Type the venue.');
  await db.projects
    .where('id')
    .equals(projectId)
    .modify((project) => {
      project.settings = {
        ...project.settings,
        followUpDays: { ...project.settings.followUpDays, [key]: days },
      };
      project.updatedAt = clock.now();
    });
}
