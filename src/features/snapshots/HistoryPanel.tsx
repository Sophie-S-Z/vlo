import type { Editor } from '@tiptap/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pin } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import type { Item, Snapshot } from '@/lib/db';
import { withoutNotes } from '@/features/editor/format/notes';
import { countUnit, countWords } from '@/lib/wordcount';
import { useManuscript } from '@/features/editor/manuscript';
import { formatWords } from '@/features/library/format';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { keepSnapshotAsVersion } from '@/features/versions/versions';
import { clock } from '@/lib/clock';
import { entryTime, HistoryError } from './entries';
import { EntryForm, formatTime, NameForm } from './EntryForms';
import {
  deleteSnapshot,
  editSnapshot,
  restoreSnapshot,
  snapshotsOf,
  takeSnapshot,
  undoDeleteSnapshot,
} from './snapshots';
import { useWordDiff } from './useWordDiff';
import type { DiffPart } from './wordDiff';
import { recordFeature } from '@/features/usage/usage';
import type { EditorForm } from '@/features/library/templates';

const CURRENT = 'current';
const MANUAL = 'Saved by you';

const formatDay = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });

/** "Saved by you, 2 Nov 2026, 21:40:12" or "2 Nov 2026, 21:40:12" for an automatic snapshot. */
export function snapshotName(snapshot: Snapshot): string {
  const time = formatTime.format(entryTime(snapshot));
  return snapshot.label ? `${snapshot.label}, ${time}` : time;
}

/** "Today", "Yesterday" or the full date of a time, on the device's calendar. */
function dayName(time: number, now: number): string {
  const day = new Date(time).toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === new Date(now).toDateString()) return 'Today';
  if (day === yesterday.toDateString()) return 'Yesterday';
  return formatDay.format(time);
}

/** The snapshots in groups of one day each, newest first, by the date that History shows. */
function byDay(snapshots: readonly Snapshot[], now: number): { day: string; rows: Snapshot[] }[] {
  const groups: { day: string; rows: Snapshot[] }[] = [];
  for (const snapshot of snapshots) {
    const day = dayName(entryTime(snapshot), now);
    const last = groups.at(-1);
    if (last?.day === day) last.rows.push(snapshot);
    else groups.push({ day, rows: [snapshot] });
  }
  return groups;
}

const errorText = (error: unknown, fallback: string) =>
  error instanceof HistoryError ? error.message : fallback;

interface HistoryPanelProps {
  item: Item;
  kind: EditorForm;
  editor: Editor;
  doc: Y.Doc;
  /** The item's text now. Read in the same step as the document state, so the two always match. */
  currentText: () => string;
  /** Called after a restore, with a sentence for the writer. */
  onRestored: (message: string) => void;
}

function DiffView({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="font-manuscript text-base leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
      {parts.map((part, index) => {
        if (part.kind === 'added')
          return (
            <ins key={index} className="rounded-sm bg-accent/15 text-text decoration-accent decoration-2">
              <span className="sr-only">Added: </span>
              {part.text}
            </ins>
          );
        if (part.kind === 'removed')
          return (
            <del key={index} className="mr-0.5 text-muted decoration-2">
              <span className="sr-only">Removed: </span>
              {part.text}
            </del>
          );
        return <span key={index}>{part.text}</span>;
      })}
    </p>
  );
}

function changeSummary(parts: DiffPart[], language: string | undefined): string {
  const words = (kind: DiffPart['kind']) =>
    countWords(
      parts
        .filter((p) => p.kind === kind)
        .map((p) => p.text)
        .join(' '),
      language,
    );
  const added = words('added');
  const removed = words('removed');
  if (parts.every((p) => p.kind === 'same')) return 'No changes.';
  if (added === 0 && removed === 0) return 'Only spaces or line breaks changed.';
  return `${formatWords(added, countUnit(language))} added, ${String(removed)} removed.`;
}

/** The item's snapshots. Pick one to see what changed, then restore it. Loaded only when History opens. */
export function HistoryPanel({ item, kind, editor, doc, currentText, onRestored }: HistoryPanelProps) {
  const snapshots = useLiveQuery(() => snapshotsOf(item.id), [item.id]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState(CURRENT);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [deleted, setDeleted] = useState<Snapshot | null>(null);
  const compareLabelId = useId();
  const detailsId = useId();
  // The text when the panel opened. The dialog is modal, so only another tab can change it meanwhile.
  const [nowText, setNowText] = useState(currentText);
  // The counts use the unit of the project's language (F38).
  const language = useManuscript()?.language;
  const wordCounts = useMemo(
    () => new Map((snapshots ?? []).map((s) => [s.id, countWords(withoutNotes(s.text), language)])),
    [snapshots, language],
  );

  const picked = snapshots?.find((s) => s.id === pickedId) ?? null;
  const other = snapshots?.find((s) => s.id === compareId) ?? null;
  const otherText = compareId === CURRENT ? null : (other?.text ?? null);
  const diff = useWordDiff(picked ? picked.text : null, otherText ?? nowText);
  const diffLabelId = useId();

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setDeleted(null);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(errorText(error, fallback));
    } finally {
      setBusy(false);
    }
  };

  const saveNow = () =>
    run(async () => {
      const text = currentText();
      setNowText(text);
      await takeSnapshot(item, doc, text, MANUAL);
      setMessage('Snapshot saved.');
    }, 'Vlo could not save the snapshot. Try again.');

  const remove = (snapshot: Snapshot) =>
    run(async () => {
      const row = await deleteSnapshot(snapshot.id);
      setPickedId(null);
      setMessage(`Deleted the snapshot from ${snapshotName(snapshot)}.`);
      setDeleted(row ?? null);
    }, 'Vlo could not delete the snapshot. Try again.');

  async function restore() {
    if (!picked) return;
    setBusy(true);
    try {
      await restoreSnapshot(item, editor, doc, picked.id, kind);
      recordFeature('snapshot-restore');
      onRestored(
        `Restored the snapshot from ${snapshotName(picked)}. The text before it is saved as a snapshot.`,
      );
    } catch {
      setMessage('Vlo could not restore this snapshot. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <Button variant="outline" disabled={busy} onClick={() => void saveNow()}>
          Save a snapshot now
        </Button>
      </div>

      {snapshots === undefined ? (
        <p className="text-muted">Loading snapshots.</p>
      ) : snapshots.length === 0 ? (
        <p className="text-muted">No snapshots yet. Save one now, or keep writing.</p>
      ) : (
        <fieldset className="grid gap-1">
          <legend className="mb-2 text-sm font-medium">Snapshots, newest first</legend>
          {byDay(snapshots, clock.now()).map(({ day, rows }) => (
            <div key={day} className="grid gap-1">
              <p className="mt-2 text-xs font-medium text-muted">{day}</p>
              {rows.map((snapshot) => (
                <label
                  key={snapshot.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 hover:border-rule has-[:checked]:border-accent has-[:checked]:bg-bg"
                >
                  <input
                    type="radio"
                    name={`snapshot-${item.id}`}
                    value={snapshot.id}
                    checked={snapshot.id === pickedId}
                    onChange={() => {
                      setPickedId(snapshot.id);
                      // A snapshot never compares with itself, so the compare goes back to the current text.
                      if (snapshot.id === compareId) setCompareId(CURRENT);
                      setMessage('');
                      setDeleted(null);
                    }}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  <span className="grid min-w-0">
                    <span className="flex items-center gap-1">
                      {snapshotName(snapshot)}
                      {snapshot.pinned && (
                        <>
                          <Pin aria-hidden className="size-3.5 text-accent" />
                          <span className="sr-only">, pinned</span>
                        </>
                      )}
                    </span>
                    <span className="text-xs text-muted">
                      {formatWords(wordCounts.get(snapshot.id) ?? 0, countUnit(language))}
                      {snapshot.shownAt !== undefined && `. Saved ${formatTime.format(snapshot.createdAt)}`}
                    </span>
                    {snapshot.note && <span className="truncate text-sm text-muted">{snapshot.note}</span>}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      )}
      <p className="text-sm text-muted">
        Vlo keeps all automatic snapshots of the last day. After that, it keeps the newest one of each day for
        30 days, then the newest one of each week. The snapshots that you save, name or pin, and those from
        before a restore, always stay.
      </p>

      {picked && (
        <section aria-labelledby={compareLabelId} className="grid gap-3 border-t border-rule pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id={compareLabelId} className="font-display text-lg font-semibold">
              Changes
            </h3>
            <label className="flex items-center gap-2 text-sm">
              Compare with
              <select
                value={compareId}
                onChange={(event) => {
                  setCompareId(event.target.value);
                }}
                className="min-h-11 rounded-md border border-rule bg-surface px-2 text-text"
              >
                <option value={CURRENT}>The current text</option>
                {(snapshots ?? [])
                  .filter((s) => s.id !== picked.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {snapshotName(s)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <p id={diffLabelId} className="text-sm text-muted">
            From {snapshotName(picked)} to {other ? snapshotName(other) : 'the current text'}:{' '}
            {diff.status === 'done'
              ? changeSummary(diff.parts, language)
              : diff.status === 'working'
                ? 'Finding the changes.'
                : diff.status === 'too-many'
                  ? 'Too many changes to mark. Restore still works.'
                  : 'Vlo could not mark the changes. Restore still works.'}
          </p>
          {diff.status === 'done' && (
            // A scrolling region must take focus, so keyboard users can scroll a long diff (WCAG 2.1.1).
            <div
              role="region"
              aria-labelledby={diffLabelId}
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              tabIndex={0}
              className="max-h-80 overflow-y-auto rounded-md border border-rule bg-bg p-4"
            >
              <DiffView parts={diff.parts} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void restore()}>
              Restore this snapshot
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void remove(picked)}>
              Delete this snapshot
            </Button>
          </div>
        </section>
      )}

      {picked && (
        <section aria-labelledby={detailsId} className="grid gap-4 border-t border-rule pt-4">
          <h3 id={detailsId} className="font-display text-lg font-semibold">
            Details
          </h3>
          <EntryForm
            key={picked.id}
            entry={picked}
            name={picked.label ?? ''}
            pinned={picked.pinned ?? false}
            submit={(edit) =>
              run(async () => {
                await editSnapshot(picked.id, edit);
                setMessage('Details saved.');
              }, 'Vlo could not save the details. Try again.')
            }
          />
          <NameForm
            key={`keep-${picked.id}`}
            label="Keep this snapshot as a version named"
            initial=""
            submit={(name) =>
              run(async () => {
                const kept = await keepSnapshotAsVersion(item, picked.id, name);
                setMessage(`Kept the snapshot as the version “${kept}”. Versions shows it.`);
              }, 'Vlo could not keep the snapshot as a version. Try again.')
            }
          />
        </section>
      )}
      {/* At the foot of the panel, so a message shows near a form far down a long list. */}
      <div
        role="status"
        className={cn(
          'sticky -bottom-6 flex flex-wrap items-center gap-2 bg-surface text-sm text-muted',
          (message || deleted) && 'border-t border-rule pt-3 pb-6',
        )}
      >
        {message}
        {deleted && (
          <Button
            variant="ghost"
            onClick={() => {
              void run(async () => {
                await undoDeleteSnapshot(deleted);
                setMessage('The snapshot is back.');
              }, 'Vlo could not bring the snapshot back. Try again.');
            }}
          >
            Undo
          </Button>
        )}
      </div>
    </div>
  );
}
