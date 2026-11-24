import { MAX_NOTE, MAX_VERSION_NAME } from '@/lib/db';

/*
 * The fields that a writer edits on an entry of History, a snapshot or a version: its name, its note and
 * its date (ADR 0017). The text of an entry never changes. `createdAt` stays the true save time.
 */

/** A problem with an edit in History, in words for the writer. */
export class HistoryError extends Error {}

/** The name with single spaces. It can be empty. */
export function cleanName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length > MAX_VERSION_NAME)
    throw new HistoryError(`Use ${String(MAX_VERSION_NAME)} characters or fewer.`);
  return clean;
}

/** The note with no spaces at its ends. It can be empty. */
export function cleanNote(note: string): string {
  const clean = note.trim();
  if (clean.length > MAX_NOTE)
    throw new HistoryError(`Write a note of ${String(MAX_NOTE)} characters or fewer.`);
  return clean;
}

/** The date that the writer gave, if it is a date and not in the future. */
export function cleanTime(at: number, now: number): number {
  if (!Number.isFinite(at) || at < 0) throw new HistoryError('Give a date and a time.');
  if (at > now) throw new HistoryError('Give a date and a time that are not in the future.');
  return at;
}

interface Entry {
  createdAt: number;
  note?: string;
  shownAt?: number;
}

/** The time that History shows and sorts by: the writer's date, or the true save time. */
export const entryTime = (entry: Entry): number => entry.shownAt ?? entry.createdAt;

/** Sets the note and the date of a row. An empty note and the true save time leave no field. */
export function applyEntry(row: Entry, note: string, at: number): void {
  if (note === '') delete row.note;
  else row.note = note;
  if (at === row.createdAt) delete row.shownAt;
  else row.shownAt = at;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The time as the value of a date and time field: the device's time zone, to the second. */
export function toLocalInput(time: number): string {
  const d = new Date(time);
  const day = `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * The time in a date and time field, which has no milliseconds. A value in the same second as the date of
 * the entry, or as its true save time, gives that time. So an unchanged field changes nothing.
 */
export function fromLocalInput(value: string, entry: Entry): number {
  const typed = value === '' ? Number.NaN : new Date(value).getTime();
  const same = [entryTime(entry), entry.createdAt].find((t) => Math.floor(t / 1000) * 1000 === typed);
  return same ?? typed;
}
