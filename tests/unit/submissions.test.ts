import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { addItem, deleteItem } from '@/features/binder/items';
import { createProject } from '@/features/library/projects';
import {
  addSubmission,
  daysBetween,
  deleteSubmission,
  followUpDaysFor,
  needsFollowUp,
  piecesText,
  restoreSubmission,
  setFollowUpDays,
  setSubmissionStatus,
  sortSubmissions,
  todayIso,
  updateSubmission,
  type SubmissionDraft,
} from '@/features/submissions/submissions';
import { db, type Submission } from '@/lib/db';

/* The Submissions tracker data (spec 8.4, plan Task C8, F20, E4). */

beforeEach(async () => {
  await db.open();
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: () => Promise.resolve(true) },
  });
});
afterEach(async () => {
  Reflect.deleteProperty(navigator, 'storage');
  await db.delete();
});

const row = (over: Partial<Submission>): Submission => ({
  id: over.id ?? 's',
  projectId: 'p',
  itemIds: ['a'],
  venue: 'Ploughshares',
  sentAt: '2026-01-10',
  status: 'sent',
  ...over,
});

describe('dates and follow-up (E4)', () => {
  test('today is the local calendar date, and days count across a daylight saving change', () => {
    expect(todayIso(new Date(2026, 2, 8, 23, 30).getTime())).toBe('2026-03-08');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-01-10', '2026-01-10')).toBe(0);
  });

  test('a sent piece with no reply needs a follow-up after the venue’s days', () => {
    expect(needsFollowUp(row({}), 90, '2026-04-09')).toBe(false);
    expect(needsFollowUp(row({}), 90, '2026-04-10')).toBe(true);
    expect(needsFollowUp(row({ replyAt: '2026-02-01' }), 90, '2026-06-01')).toBe(false);
    expect(needsFollowUp(row({ status: 'declined' }), 90, '2026-06-01')).toBe(false);
  });

  test('each venue keeps its own days, and the rest use 90', () => {
    const settings = { followUpDays: { ploughshares: 30 } };
    expect(followUpDaysFor(settings, '  PLOUGHSHARES ')).toBe(30);
    expect(followUpDaysFor(settings, 'Granta')).toBe(90);
    expect(followUpDaysFor({}, 'Granta')).toBe(90);
    // A venue that shares a name with a property of every object still gets the default (code review).
    for (const name of ['constructor', 'toString', '__proto__', 'valueOf'])
      expect(followUpDaysFor(settings, name)).toBe(90);
  });
});

describe('sorting', () => {
  const rows = [
    row({ id: '1', venue: 'granta', sentAt: '2026-02-01', status: 'declined', replyAt: '2026-03-01' }),
    row({ id: '2', venue: 'Agni', sentAt: '2026-01-05', status: 'accepted', notes: 'Paid' }),
    row({ id: '3', venue: 'Zyzzyva', sentAt: '2026-03-15', status: 'sent', itemIds: ['b'] }),
  ];
  const titles = new Map([
    ['a', 'Low Tide'],
    ['b', 'Gulls'],
  ]);
  const pieces = (s: Submission) => piecesText(s, titles);
  const ids = (list: Submission[]) => list.map((s) => s.id);

  test('each column sorts both ways, without regard to case', () => {
    expect(ids(sortSubmissions(rows, 'venue', 'asc', pieces))).toEqual(['2', '1', '3']);
    expect(ids(sortSubmissions(rows, 'venue', 'desc', pieces))).toEqual(['3', '1', '2']);
    expect(ids(sortSubmissions(rows, 'sentAt', 'desc', pieces))).toEqual(['3', '1', '2']);
    expect(ids(sortSubmissions(rows, 'status', 'asc', pieces))).toEqual(['2', '1', '3']);
    expect(ids(sortSubmissions(rows, 'pieces', 'asc', pieces))).toEqual(['3', '1', '2']);
  });

  test('an empty reply date or note goes last in both directions', () => {
    expect(ids(sortSubmissions(rows, 'replyAt', 'asc', pieces))).toEqual(['1', '2', '3']);
    expect(ids(sortSubmissions(rows, 'replyAt', 'desc', pieces))).toEqual(['1', '2', '3']);
    expect(ids(sortSubmissions(rows, 'notes', 'desc', pieces))).toEqual(['2', '1', '3']);
  });

  test('a deleted piece shows as "Deleted piece"', () => {
    expect(piecesText(row({ itemIds: ['a', 'gone'] }), titles)).toBe('Low Tide, Deleted piece');
  });
});

describe('submissions in the database', () => {
  test('add, edit, status, delete with undo, and the rules for a row', async () => {
    const { project } = await createProject({ title: 'Salt Hours', template: 'poetry' });
    const poem = await addItem(project.id, null, 'poem', 'Low Tide');
    const draft: SubmissionDraft = {
      itemIds: [poem.id],
      venue: '  Agni ',
      sentAt: '2026-01-05',
      status: 'sent',
    };
    const sub = await addSubmission(project.id, draft);
    expect(sub.venue).toBe('Agni');
    await expect(addSubmission(project.id, { ...draft, itemIds: [] })).rejects.toThrow(
      'Choose at least one piece.',
    );
    await expect(addSubmission(project.id, { ...draft, venue: ' ' })).rejects.toThrow('Type the venue.');
    await expect(addSubmission(project.id, { ...draft, sentAt: '2026-13-01' })).rejects.toThrow(
      'Type the sent date as a date.',
    );
    await expect(addSubmission(project.id, { ...draft, replyAt: '2026-01-01' })).rejects.toThrow(
      'The reply date comes before the sent date.',
    );

    await updateSubmission(sub.id, { ...draft, notes: '  Paid in copies  ' });
    expect((await db.submissions.get(sub.id))?.notes).toBe('Paid in copies');
    await setSubmissionStatus(sub.id, 'accepted');
    expect((await db.submissions.get(sub.id))?.status).toBe('accepted');

    const deleted = await deleteSubmission(sub.id);
    expect(await db.submissions.get(sub.id)).toBeUndefined();
    if (!deleted) throw new Error('No deleted row.');
    await restoreSubmission(deleted);
    expect((await db.submissions.get(sub.id))?.status).toBe('accepted');

    // A deleted item keeps its id in the row, so the tracker can show "Deleted piece".
    await deleteItem(poem.id);
    expect((await db.submissions.get(sub.id))?.itemIds).toEqual([poem.id]);
  });

  test('follow-up days are kept for each venue in the project settings', async () => {
    const { project } = await createProject({ title: 'Salt Hours', template: 'poetry' });
    await setFollowUpDays(project.id, ' Agni ', 45);
    await setFollowUpDays(project.id, 'Granta', 120);
    const stored = (await db.projects.get(project.id))?.settings;
    expect(stored?.followUpDays).toEqual({ agni: 45, granta: 120 });
    await expect(setFollowUpDays(project.id, 'Agni', 0)).rejects.toThrow(
      'Type a number of days from 1 to 3650.',
    );
  });
});
