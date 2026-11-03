import type { Editor } from '@tiptap/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import type { Item, Snapshot } from '@/lib/db';
import { countWords } from '@/lib/wordcount';
import { Button } from '@/ui/button';
import { restoreSnapshot, snapshotsOf, takeSnapshot } from './snapshots';
import { useWordDiff } from './useWordDiff';
import type { DiffPart } from './wordDiff';

const CURRENT = 'current';
const MANUAL = 'Saved by you';

// Seconds are shown, so two snapshots in the same minute get different names.
const formatTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

/** "Saved by you, 2 Nov 2026, 21:40:12" or "2 Nov 2026, 21:40:12" for an automatic snapshot. */
export function snapshotName(snapshot: Snapshot): string {
  const time = formatTime.format(snapshot.createdAt);
  return snapshot.label ? `${snapshot.label}, ${time}` : time;
}

interface HistoryPanelProps {
  item: Item;
  kind: 'prose' | 'poem';
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

function changeSummary(parts: DiffPart[]): string {
  const words = (kind: DiffPart['kind']) =>
    countWords(
      parts
        .filter((p) => p.kind === kind)
        .map((p) => p.text)
        .join(' '),
    );
  const added = words('added');
  const removed = words('removed');
  if (parts.every((p) => p.kind === 'same')) return 'No changes.';
  if (added === 0 && removed === 0) return 'Only spaces or line breaks changed.';
  return `${String(added)} ${added === 1 ? 'word' : 'words'} added, ${String(removed)} removed.`;
}

/** The item's snapshots. Pick one to see what changed, then restore it. Loaded only when History opens. */
export function HistoryPanel({ item, kind, editor, doc, currentText, onRestored }: HistoryPanelProps) {
  const snapshots = useLiveQuery(() => snapshotsOf(item.id), [item.id]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState(CURRENT);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const compareLabelId = useId();
  // The text when the panel opened. The dialog is modal, so only another tab can change it meanwhile.
  const [nowText, setNowText] = useState(currentText);
  const wordCounts = useMemo(
    () => new Map((snapshots ?? []).map((s) => [s.id, countWords(s.text)])),
    [snapshots],
  );

  const picked = snapshots?.find((s) => s.id === pickedId) ?? null;
  const other = snapshots?.find((s) => s.id === compareId) ?? null;
  const otherText = compareId === CURRENT ? null : (other?.text ?? null);
  const diff = useWordDiff(picked ? picked.text : null, otherText ?? nowText);
  const diffLabelId = useId();

  async function saveNow() {
    setBusy(true);
    try {
      const text = currentText();
      setNowText(text);
      await takeSnapshot(item, doc, text, MANUAL);
      setMessage('Snapshot saved.');
    } catch {
      setMessage('Vlo could not save the snapshot. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!picked) return;
    setBusy(true);
    try {
      await restoreSnapshot(item, editor, doc, picked.id, kind);
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
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={busy} onClick={() => void saveNow()}>
          Save a snapshot now
        </Button>
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      </div>

      {snapshots === undefined ? (
        <p className="text-muted">Loading snapshots.</p>
      ) : snapshots.length === 0 ? (
        <p className="text-muted">No snapshots yet. Save one now, or keep writing.</p>
      ) : (
        <fieldset className="grid gap-1">
          <legend className="mb-2 text-sm font-medium">Snapshots, newest first</legend>
          {snapshots.map((snapshot) => (
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
                  setMessage('');
                }}
                className="size-4 accent-[var(--color-accent)]"
              />
              <span className="grid">
                {snapshotName(snapshot)}
                <span className="text-xs text-muted">
                  {(wordCounts.get(snapshot.id) ?? 0).toLocaleString()} words
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

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
              ? changeSummary(diff.parts)
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
          <div>
            <Button disabled={busy} onClick={() => void restore()}>
              Restore this snapshot
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
