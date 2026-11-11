import { projectTotals } from '@/features/focus/sessions';
import { clock } from '@/lib/clock';
import { db, type AuthorshipEntry } from '@/lib/db';
import { newId } from '@/lib/ids';
import { signingKey } from './keys';
import { sha256, stamp } from './ots';
import { entryText, recordFile, sha256Hex, toHex, withTimestamp } from './verify';

/*
 * The authorship record of each project (roadmap F54, plan Task K5). The editor counts the characters of
 * each change by its source. An entry keeps the counts when the writer has written for 10 minutes, when
 * a writing session ends, and when the page hides. Entries hold counts only, never text or titles.
 */

export type Source = 'typed' | 'pasted' | 'dictated' | 'ai';

interface Pending {
  typed: number;
  pasted: number;
  dictated: number;
  ai: number;
  deleted: number;
  /** The minutes (since 1970) with a change. */
  minutes: Set<number>;
  since: number;
}

/** A new entry after this much writing time, so a long session does not hold its counts in memory. */
export const ENTRY_EVERY = 10 * 60_000;

const pending = new Map<string, Pending>();
let queue: Promise<unknown> = Promise.resolve();

/** Adds the characters of one change of the writer. */
export function noteChange(projectId: string, source: Source, added: number, deleted: number): void {
  if (added === 0 && deleted === 0) return;
  const now = clock.now();
  let open = pending.get(projectId);
  if (!open) {
    open = { typed: 0, pasted: 0, dictated: 0, ai: 0, deleted: 0, minutes: new Set(), since: now };
    pending.set(projectId, open);
  }
  open[source] += added;
  open.deleted += deleted;
  open.minutes.add(Math.floor(now / 60_000));
  if (now - open.since >= ENTRY_EVERY) void flushEntry(projectId).catch(() => undefined);
}

/** Runs `task` after each earlier write of this tab, and alone among this browser's tabs. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const locked = () =>
    typeof navigator !== 'undefined' && 'locks' in navigator
      ? navigator.locks.request('vlo-authorship', task)
      : task();
  const run = queue.then(locked, locked);
  queue = run.catch(() => undefined);
  return run;
}

/** Adds an entry with the counts since the entry before, if the writer changed anything. */
export function flushEntry(projectId: string): Promise<void> {
  const open = pending.get(projectId);
  if (!open) return Promise.resolve();
  pending.delete(projectId);
  return serial(async () => {
    const key = await signingKey();
    const mine = await db.authorship
      .where('projectId')
      .equals(projectId)
      .filter((e) => e.device === key.device)
      .toArray();
    const before = mine.reduce<AuthorshipEntry | undefined>(
      (a, e) => (a && a.seq > e.seq ? a : e),
      undefined,
    );
    const body = {
      device: key.device,
      seq: before ? before.seq + 1 : 0,
      at: clock.now(),
      minutes: open.minutes.size,
      typed: open.typed,
      pasted: open.pasted,
      dictated: open.dictated,
      ai: open.ai,
      deleted: open.deleted,
      words: (await projectTotals(projectId)).words,
      prev: before?.hash ?? '',
    };
    const text = entryText(body);
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key.privateKey,
      new TextEncoder().encode(text),
    );
    await db.authorship.add({
      id: newId(),
      projectId,
      ...body,
      hash: await sha256Hex(text),
      sig: toHex(sig),
      ...(before ? {} : { key: key.publicKey }),
    });
  });
}

/** Adds an entry for each project with counts, as when the page hides. */
export function flushAll(): Promise<void> {
  return Promise.all([...pending.keys()].map((id) => flushEntry(id))).then(() => undefined);
}

/** The record file of a project: each device's chain, first entry first. Null when it has no entry. */
export async function exportRecord(projectId: string): Promise<string | null> {
  await flushEntry(projectId);
  const entries = await db.authorship.where('projectId').equals(projectId).toArray();
  if (entries.length === 0) return null;
  entries.sort((a, b) => a.device.localeCompare(b.device) || a.seq - b.seq);
  return recordFile(entries);
}

/**
 * The record file with a public timestamp (F68): the calendar servers get one hash of the file, and the
 * file gets their proof. It throws when no server answers.
 */
export async function stampRecord(file: string): Promise<string> {
  return withTimestamp(file, await stamp(await sha256(new TextEncoder().encode(file))));
}

/** Forgets the counts that no entry holds yet, for tests. */
export function resetPending(): void {
  pending.clear();
}
