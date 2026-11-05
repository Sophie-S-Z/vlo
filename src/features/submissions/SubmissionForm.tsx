import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Item, Project, Submission, SubmissionStatus } from '@/lib/db';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Textarea } from '@/ui/textarea';
import {
  DEFAULT_FOLLOW_UP,
  followUpDaysFor,
  MAX_FOLLOW_UP,
  MAX_NOTES,
  MAX_VENUE,
  STATUS_LABEL,
  STATUSES,
  todayIso,
  type SubmissionDraft,
} from './submissions';

/*
 * The form that logs or changes a submission (spec 8.4, plan Task C8). It sits on the page above the
 * table, so the poet can see the earlier rows while typing. The follow-up days belong to the venue (E4).
 */

export interface SubmissionFormProps {
  project: Project;
  /** The pieces the writer can choose: every item but notes, in binder order. */
  pieces: readonly Item[];
  /** Earlier venues, for the venue suggestions. */
  venues: readonly string[];
  /** The row to change, or null for a new row. */
  editing: Submission | null;
  onSave: (draft: SubmissionDraft, followUpDays: number) => Promise<void>;
  onCancel: () => void;
}

function problemText(problem: unknown): string {
  return problem instanceof RangeError
    ? problem.message
    : 'Vlo could not save the submission on this device.';
}

export function SubmissionForm({ project, pieces, venues, editing, onSave, onCancel }: SubmissionFormProps) {
  const id = useId();
  const [chosen, setChosen] = useState<string[]>(() => editing?.itemIds ?? []);
  const [find, setFind] = useState('');
  const [venue, setVenue] = useState(editing?.venue ?? '');
  const [sentAt, setSentAt] = useState(editing?.sentAt ?? todayIso());
  const [status, setStatus] = useState<SubmissionStatus>(editing?.status ?? 'sent');
  const [replyAt, setReplyAt] = useState(editing?.replyAt ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [days, setDays] = useState(() =>
    String(editing ? followUpDaysFor(project.settings, editing.venue) : DEFAULT_FOLLOW_UP),
  );
  const [daysTouched, setDaysTouched] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The button that opened the form is gone now, so focus starts at the form's own heading.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q === '' ? pieces : pieces.filter((p) => p.title.toLowerCase().includes(q));
  }, [find, pieces]);
  const titleOf = new Map(pieces.map((p) => [p.id, p.title]));
  const lost = chosen.filter((c) => !titleOf.has(c));

  const changeVenue = (next: string) => {
    setVenue(next);
    // A venue with its own days fills them in, until the writer types other days.
    if (!daysTouched) setDays(String(followUpDaysFor(project.settings, next)));
  };

  return (
    <form
      aria-labelledby={`${id}-title`}
      // Vlo checks the fields itself, so each refusal shows as words in the form and not as a browser bubble.
      noValidate
      className="grid gap-5 rounded-[var(--radius-card)] border border-rule bg-surface p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const n = Number(days);
        if (!Number.isInteger(n) || n < 1 || n > MAX_FOLLOW_UP) {
          setError(`Type a number of days from 1 to ${String(MAX_FOLLOW_UP)} for the follow-up.`);
          errorRef.current?.focus();
          return;
        }
        setSaving(true);
        onSave({ itemIds: chosen, venue, sentAt, status, replyAt, notes }, n).then(
          () => {
            setSaving(false);
          },
          (problem: unknown) => {
            setSaving(false);
            setError(problemText(problem));
            errorRef.current?.focus();
          },
        );
      }}
    >
      <h2
        id={`${id}-title`}
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-xl font-semibold focus:outline-none"
      >
        {editing ? 'Change the submission' : 'Log a submission'}
      </h2>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Pieces</legend>
        {pieces.length > 8 && (
          <div className="grid max-w-sm gap-1.5">
            <Label htmlFor={`${id}-find`} className="text-muted">
              Find a piece
            </Label>
            <Input
              id={`${id}-find`}
              type="search"
              value={find}
              onChange={(event) => {
                setFind(event.target.value);
              }}
            />
          </div>
        )}
        <ul className="grid max-h-64 gap-0.5 overflow-y-auto rounded-md border border-rule bg-bg p-1 sm:grid-cols-2">
          {shown.map((piece) => {
            const on = chosen.includes(piece.id);
            return (
              <li key={piece.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-surface">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      setChosen((now) => (on ? now.filter((c) => c !== piece.id) : [...now, piece.id]));
                      setError('');
                    }}
                    className="size-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{piece.title}</span>
                </label>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-2 py-3 text-sm text-muted">No piece has that title.</li>}
        </ul>
        {lost.length > 0 && (
          <p className="text-sm text-muted">
            {lost.length === 1 ? 'One piece of this row' : `${String(lost.length)} pieces of this row`} left
            the binder. The row keeps {lost.length === 1 ? 'it' : 'them'} as &ldquo;Deleted piece&rdquo;.
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${id}-venue`}>Venue</Label>
          <Input
            id={`${id}-venue`}
            value={venue}
            maxLength={MAX_VENUE}
            list={`${id}-venues`}
            autoComplete="off"
            onChange={(event) => {
              changeVenue(event.target.value);
              setError('');
            }}
          />
          <datalist id={`${id}-venues`}>
            {venues.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${id}-status`}>Status</Label>
          <select
            id={`${id}-status`}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as SubmissionStatus);
            }}
            className="min-h-11 rounded-md border border-rule bg-bg px-3 text-base"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${id}-sent`}>Sent on</Label>
          <Input
            id={`${id}-sent`}
            type="date"
            value={sentAt}
            required
            onChange={(event) => {
              setSentAt(event.target.value);
              setError('');
            }}
          />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${id}-reply`}>Reply on</Label>
          <Input
            id={`${id}-reply`}
            type="date"
            value={replyAt}
            aria-describedby={`${id}-reply-hint`}
            onChange={(event) => {
              setReplyAt(event.target.value);
              setError('');
            }}
          />
          <p id={`${id}-reply-hint`} className="text-xs text-muted">
            Leave it empty until the venue answers.
          </p>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${id}-days`}>Follow up after (days)</Label>
          <Input
            id={`${id}-days`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_FOLLOW_UP}
            value={days}
            aria-describedby={`${id}-days-hint`}
            onChange={(event) => {
              setDays(event.target.value);
              setDaysTouched(true);
              setError('');
            }}
          />
          <p id={`${id}-days-hint`} className="text-xs text-muted">
            For every piece sent to this venue. A sent piece with no reply after these days gets a follow-up
            flag.
          </p>
        </div>
        <div className="grid content-start gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-notes`}>Notes</Label>
          <Textarea
            id={`${id}-notes`}
            value={notes}
            maxLength={MAX_NOTES}
            rows={3}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving}>
          {editing ? 'Save changes' : 'Log submission'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="basis-full text-sm text-accent-text empty:hidden focus:outline-none"
        >
          {error}
        </p>
      </div>
    </form>
  );
}
