import { useId, useState } from 'react';
import { clock } from '@/lib/clock';
import { MAX_NOTE, MAX_VERSION_NAME } from '@/lib/db';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Textarea } from '@/ui/textarea';
import { fromLocalInput, toLocalInput } from './entries';

/* The forms of History: a name for a version, and the details of a snapshot or a version (ADR 0017). */

// Seconds are shown, so two entries in the same minute get different names.
export const formatTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

/** One name field with Save and Cancel, for a new version or a rename. */
export function NameForm({
  label,
  initial,
  submit,
  onCancel,
}: {
  label: string;
  initial: string;
  submit: (name: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void submit(name).finally(() => {
          setBusy(false);
        });
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <label htmlFor={id} className="grid gap-1 text-sm">
        {label}
        <Input
          id={id}
          value={name}
          maxLength={MAX_VERSION_NAME}
          onChange={(event) => {
            setName(event.target.value);
          }}
          className="w-64 max-w-full"
        />
      </label>
      <Button type="submit" variant="outline" disabled={busy}>
        Save
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </form>
  );
}

export interface EntryEdit {
  name: string;
  note: string;
  at: number;
  pinned: boolean;
}

interface EntryFormProps {
  entry: { createdAt: number; shownAt?: number; note?: string };
  name: string;
  /** Only a snapshot has a pin. */
  pinned?: boolean;
  submit: (edit: EntryEdit) => Promise<void>;
  onCancel?: () => void;
}

/** The name, the note, the date and the pin of an entry. The text of the entry never changes. */
export function EntryForm({
  entry,
  name: initialName,
  pinned: initialPin,
  submit,
  onCancel,
}: EntryFormProps) {
  const id = useId();
  const [name, setName] = useState(initialName);
  const [note, setNote] = useState(entry.note ?? '');
  const [date, setDate] = useState(() => toLocalInput(entry.shownAt ?? entry.createdAt));
  const [pinned, setPinned] = useState(initialPin ?? false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void submit({ name, note, at: fromLocalInput(date, entry), pinned }).finally(() => {
          setBusy(false);
        });
      }}
      className="grid gap-3"
    >
      <label htmlFor={`${id}-name`} className="grid gap-1 text-sm">
        Name
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={MAX_VERSION_NAME}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>
      <label htmlFor={`${id}-note`} className="grid gap-1 text-sm">
        Note
        <Textarea
          id={`${id}-note`}
          value={note}
          maxLength={MAX_NOTE}
          rows={3}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </label>
      <label htmlFor={`${id}-date`} className="grid gap-1 text-sm">
        Date and time
        <Input
          id={`${id}-date`}
          type="datetime-local"
          step={1}
          max={toLocalInput(clock.now())}
          value={date}
          aria-describedby={`${id}-saved`}
          onChange={(event) => {
            setDate(event.target.value);
          }}
          className="w-auto"
        />
        <span id={`${id}-saved`} className="text-xs text-muted">
          Vlo saved it at {formatTime.format(entry.createdAt)}.
          {initialPin !== undefined && ' Vlo uses that time when it deletes old automatic snapshots.'}
        </span>
      </label>
      {initialPin !== undefined && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => {
              setPinned(event.target.checked);
            }}
            className="size-4 accent-[var(--color-accent)]"
          />
          Pin it, so that Vlo always keeps it
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={busy}>
          Save details
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
