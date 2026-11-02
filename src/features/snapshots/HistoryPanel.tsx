import type { Editor } from '@tiptap/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import type * as Y from 'yjs';
import type { Item, Snapshot } from '@/lib/db';
import { countWords } from '@/lib/wordcount';
import { Button } from '@/ui/button';
import { DialogDescription, DialogTitle } from '@/ui/dialog';
import { restoreSnapshot, snapshotsOf, takeSnapshot } from './snapshots';
import { wordDiff, type DiffPart } from './wordDiff';

const CURRENT = 'current';
const MANUAL = 'Saved by you';

const formatTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** "Saved by you, 2 Nov 2026, 21:40" or "2 Nov 2026, 21:40" for an automatic snapshot. */
export function snapshotName(snapshot: Snapshot): string {
  const time = formatTime.format(snapshot.createdAt);
  return snapshot.label ? `${snapshot.label}, ${time}` : time;
}

interface HistoryPanelProps {
  item: Item;
  kind: 'prose' | 'poem';
  editor: Editor;
  doc: Y.Doc;
  /** The item's text now. */
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
  // The dialog is modal, so the item's text cannot change while it is open.
  const [nowText] = useState(currentText);

  const picked = snapshots?.find((s) => s.id === pickedId) ?? null;
  const other = snapshots?.find((s) => s.id === compareId) ?? null;
  const otherText = compareId === CURRENT ? null : (other?.text ?? null);
  const parts = picked ? wordDiff(picked.text, otherText ?? nowText) : null;

  async function saveNow() {
    setBusy(true);
    try {
      await takeSnapshot(item, doc, nowText, MANUAL);
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
      <div className="grid gap-1 pr-10">
        <DialogTitle>History</DialogTitle>
        <DialogDescription>
          Vlo saves a snapshot of {item.title} after every 10 minutes of writing. Restoring one saves the
          current text first.
        </DialogDescription>
      </div>

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
                <span className="text-xs text-muted">{countWords(snapshot.text).toLocaleString()} words</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {picked && parts && (
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
          <p className="text-sm text-muted">
            From {snapshotName(picked)} to {other ? snapshotName(other) : 'the current text'}:{' '}
            {changeSummary(parts)}
          </p>
          <div className="max-h-80 overflow-y-auto rounded-md border border-rule bg-bg p-4">
            <DiffView parts={parts} />
          </div>
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
