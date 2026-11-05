import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { flattenTree, openTargets } from '@/features/binder/tree';
import { TEMPLATES } from '@/features/library/templates';
import { useProject } from '@/features/project/useProject';
import { ViewTabs } from '@/features/project/ViewTabs';
import { formatDate } from '@/features/timeline/dates';
import type { Item, Submission, SubmissionStatus } from '@/lib/db';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { SubmissionForm } from './SubmissionForm';
import {
  addSubmission,
  deleteSubmission,
  followUpDaysFor,
  needsFollowUp,
  piecesText,
  restoreSubmission,
  setFollowUpDays,
  setSubmissionStatus,
  sortSubmissions,
  STATUS_LABEL,
  STATUSES,
  todayIso,
  updateSubmission,
  useSubmissions,
  type SortDirection,
  type SortKey,
  type SubmissionDraft,
} from './submissions';

/*
 * The Submissions tracker (spec 8.4, plan Task C8, F20, E4). Every template has it. A sortable table
 * logs each piece sent out. A status change animates the row color. A sent piece with no reply after the
 * venue's days turns to the accent color and says "Follow up".
 */

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'pieces', label: 'Pieces' },
  { key: 'venue', label: 'Venue' },
  { key: 'sentAt', label: 'Sent' },
  { key: 'status', label: 'Status' },
  { key: 'replyAt', label: 'Reply' },
  { key: 'notes', label: 'Notes' },
];

/** The tint of a row by its status. The status text always shows too, so color is never the only sign. */
const ROW_TONE: Record<SubmissionStatus, string> = {
  sent: '',
  accepted: 'vlo-sub-accepted',
  declined: 'vlo-sub-closed',
  withdrawn: 'vlo-sub-closed',
  'no-reply': 'vlo-sub-closed',
};

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: (typeof COLUMNS)[number];
  sort: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === column.key;
  const Icon = sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="px-2 pb-1 text-left font-medium"
    >
      <button
        type="button"
        onClick={() => {
          onSort(column.key);
        }}
        className={cn(
          'inline-flex min-h-11 items-center gap-1 rounded-md px-1 hover:text-text',
          active ? 'text-text' : 'text-muted',
        )}
      >
        {column.label}
        {active && <Icon aria-hidden="true" className="size-3.5" />}
      </button>
    </th>
  );
}

/**
 * The status box of one row. It shows the writer's choice at once, so the box never flicks back to the
 * old status while the save is on its way.
 */
function StatusSelect({
  row,
  label,
  onChosen,
}: {
  row: Submission;
  label: string;
  onChosen: (status: SubmissionStatus) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<SubmissionStatus | null>(null);
  const [stored, setStored] = useState(row.status);
  // The stored status changed: the save came back, or another tab changed it.
  if (stored !== row.status) {
    setStored(row.status);
    setChosen(null);
  }
  return (
    <select
      aria-label={label}
      value={chosen ?? row.status}
      onChange={(event) => {
        const status = event.target.value as SubmissionStatus;
        setChosen(status);
        onChosen(status).catch(() => {
          setChosen(null);
        });
      }}
      className="vlo-sub-status min-h-11 rounded-md border border-rule bg-transparent px-2 text-sm"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

export function SubmissionsPage() {
  const { projectId = '' } = useParams();
  const state = useProject(projectId);
  const submissions = useSubmissions(projectId);
  const ids = useId();
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'sentAt',
    direction: 'desc',
  });
  const [form, setForm] = useState<{ editing: Submission | null } | null>(null);
  const [message, setMessage] = useState('');
  const [deleted, setDeleted] = useState<Submission | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  // The control that takes focus after the next render, as a data-focus value. A closed form or an Undo
  // removes the focused button, so focus moves to the control that the writer will want next.
  const focusNext = useRef<string | null>(null);
  // Today, read once a render, so a page left open past midnight shows the new follow-ups.
  const today = todayIso();

  useDocumentTitle(
    state.status === 'ready'
      ? `${state.project.title}, Submissions`
      : state.status === 'missing'
        ? 'Project not found'
        : 'Submissions',
  );

  useEffect(() => {
    if (deleted) undoRef.current?.focus();
  }, [deleted]);

  useLayoutEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    const control = sectionRef.current?.querySelector<HTMLElement>(`[data-focus="${target}"]`);
    if (!control) return;
    control.focus();
    focusNext.current = null;
  });

  const items = useMemo(() => (state.status === 'ready' ? state.items : []), [state]);
  const titles = useMemo(() => new Map(items.map((i) => [i.id, i.title])), [items]);
  // Binder order: each parent, then its children.
  const pieces = useMemo(
    () =>
      flattenTree(items)
        .map((node) => node.item)
        .filter((i) => i.kind !== 'note'),
    [items],
  );
  const template = state.status === 'ready' ? TEMPLATES[state.project.template] : null;
  /** The item that a piece title opens: a part or chapter opens its first scene. */
  const targets = useMemo(
    () => (template ? openTargets(items, template.editorKind) : new Map<string, Item>()),
    [items, template],
  );
  const rows = useMemo(
    () =>
      submissions ? sortSubmissions(submissions, sort.key, sort.direction, (s) => piecesText(s, titles)) : [],
    [submissions, sort, titles],
  );
  const venues = useMemo(
    () => [...new Set((submissions ?? []).map((s) => s.venue))].sort((a, b) => a.localeCompare(b)),
    [submissions],
  );

  if (state.status === 'loading' || submissions === undefined) return null;

  if (state.status === 'missing') {
    return (
      <section>
        <h1 className="font-display text-4xl font-semibold">Project not found</h1>
        <p className="mt-4 text-muted">
          This device has no project at this address. It may have been deleted.
        </p>
        <p className="mt-6">
          <Link to="/">Go to the Library</Link>
        </p>
      </section>
    );
  }

  const { project } = state;
  const { label: templateLabel } = TEMPLATES[project.template];
  const announce = (text: string) => {
    setDeleted(null);
    setMessage(text);
  };

  const followUps = submissions.filter((s) =>
    needsFollowUp(s, followUpDaysFor(project.settings, s.venue), today),
  ).length;
  const waiting = submissions.filter((s) => s.status === 'sent').length;
  const accepted = submissions.filter((s) => s.status === 'accepted').length;

  const save = async (draft: SubmissionDraft, days: number) => {
    const editing = form?.editing ?? null;
    if (editing) await updateSubmission(editing.id, draft);
    else await addSubmission(project.id, draft);
    if (days !== followUpDaysFor(project.settings, draft.venue))
      await setFollowUpDays(project.id, draft.venue, days);
    focusNext.current = editing ? `edit-${editing.id}` : 'add';
    setForm(null);
    announce(
      editing
        ? `Saved the changes to ${draft.venue.trim()}.`
        : `Logged the submission to ${draft.venue.trim()}.`,
    );
  };

  const changeSort = (key: SortKey) => {
    setSort((now) =>
      now.key === key
        ? { key, direction: now.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'sentAt' || key === 'replyAt' ? 'desc' : 'asc' },
    );
  };

  return (
    <section ref={sectionRef} className="grid gap-6">
      <header className="min-w-0">
        <p className="text-sm text-muted">{templateLabel}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold [overflow-wrap:anywhere] sm:text-4xl">
          {project.title}
        </h1>
        <ViewTabs project={project} />
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto grid gap-1">
          <h2 className="font-display text-2xl font-semibold">Submissions</h2>
          <p className="text-sm text-muted" data-testid="submission-summary">
            {submissions.length === 0
              ? 'Log each piece you send out: where it went, when, and what came back.'
              : `${plural(submissions.length, 'submission', 'submissions')}: ${plural(waiting, 'waiting for a reply', 'waiting for a reply')}, ${plural(accepted, 'accepted', 'accepted')}${followUps > 0 ? `, ${plural(followUps, 'to follow up', 'to follow up')}` : ''}.`}
          </p>
        </div>
        {!form && (
          <Button
            data-focus="add"
            onClick={() => {
              setForm({ editing: null });
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            Log a submission
          </Button>
        )}
      </div>

      {form && (
        <SubmissionForm
          key={form.editing?.id ?? 'new'}
          project={project}
          pieces={pieces}
          venues={venues}
          editing={form.editing}
          onSave={save}
          onCancel={() => {
            focusNext.current = form.editing ? `edit-${form.editing.id}` : 'add';
            setForm(null);
          }}
        />
      )}

      {rows.length > 0 && (
        <div className="grid gap-2">
          {/* Phones show each row as a block, so the sort is a list box there. */}
          <div className="flex items-center gap-2 sm:hidden">
            <label htmlFor={`${ids}-sort`} className="text-sm text-muted">
              Sort by
            </label>
            <select
              id={`${ids}-sort`}
              value={`${sort.key}:${sort.direction}`}
              onChange={(event) => {
                const [key, direction] = event.target.value.split(':') as [SortKey, SortDirection];
                setSort({ key, direction });
              }}
              className="min-h-11 rounded-md border border-rule bg-bg px-3 text-sm"
            >
              {COLUMNS.flatMap((c) => [
                <option key={`${c.key}:asc`} value={`${c.key}:asc`}>
                  {c.label}, A to Z or oldest first
                </option>,
                <option key={`${c.key}:desc`} value={`${c.key}:desc`}>
                  {c.label}, Z to A or newest first
                </option>,
              ])}
            </select>
          </div>
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Submissions of {project.title}. The column buttons sort the table.
            </caption>
            {/* Phones sort with the list box, so the header buttons leave the tab order there too. */}
            <thead className="max-sm:hidden">
              <tr className="border-b border-rule">
                {COLUMNS.map((column) => (
                  <SortHeader key={column.key} column={column} sort={sort} onSort={changeSort} />
                ))}
                <th scope="col" className="pb-1">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const late = needsFollowUp(row, followUpDaysFor(project.settings, row.venue), today);
                const names = piecesText(row, titles);
                return (
                  <tr
                    key={row.id}
                    data-status={row.status}
                    data-follow-up={late || undefined}
                    className={cn(
                      'vlo-sub-row grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b border-rule px-3 py-3 sm:table-row sm:p-0',
                      late ? 'vlo-sub-late' : ROW_TONE[row.status],
                    )}
                  >
                    <td className="font-medium [overflow-wrap:anywhere] sm:px-2 sm:py-2">
                      {row.itemIds.map((id, i) => (
                        <span key={`${id}-${String(i)}`}>
                          {i > 0 && ', '}
                          {!titles.has(id) ? (
                            <span className="text-muted italic">Deleted piece</span>
                          ) : targets.has(id) ? (
                            <Link
                              to={`/p/${project.id}?${new URLSearchParams({ item: targets.get(id)?.id ?? id }).toString()}`}
                              className="text-text"
                            >
                              {titles.get(id)}
                            </Link>
                          ) : (
                            // A part or chapter with no scene in it opens nothing.
                            titles.get(id)
                          )}
                        </span>
                      ))}
                    </td>
                    <td className="col-start-1 [overflow-wrap:anywhere] sm:px-2 sm:py-2">
                      <span className="sm:sr-only">Venue: </span>
                      {row.venue}
                    </td>
                    <td className="col-start-1 max-sm:text-muted sm:px-2 sm:py-2 sm:whitespace-nowrap">
                      <span className="sm:sr-only">Sent </span>
                      <time dateTime={row.sentAt}>{formatDate(row.sentAt)}</time>
                    </td>
                    <td className="col-start-1 sm:px-2 sm:py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusSelect
                          row={row}
                          label={`Status of ${names} at ${row.venue}`}
                          onChosen={(status) =>
                            setSubmissionStatus(row.id, status).then(
                              () => {
                                announce(`${names} at ${row.venue}: ${STATUS_LABEL[status]}.`);
                              },
                              (problem: unknown) => {
                                announce('Vlo could not save the status on this device.');
                                throw problem;
                              },
                            )
                          }
                        />
                        {late && (
                          <span className="rounded-full border border-current px-2 py-0.5 text-xs font-semibold text-accent-text">
                            Follow up
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="col-start-1 text-muted sm:px-2 sm:py-2 sm:whitespace-nowrap">
                      {row.replyAt ? (
                        <>
                          <span className="sm:sr-only">Reply </span>
                          <time dateTime={row.replyAt}>{formatDate(row.replyAt)}</time>
                        </>
                      ) : (
                        <span className="max-sm:hidden">
                          <span className="sr-only">No reply yet</span>
                          <span aria-hidden="true">None</span>
                        </span>
                      )}
                    </td>
                    <td className="col-start-1 text-muted [overflow-wrap:anywhere] sm:max-w-64 sm:px-2 sm:py-2">
                      {row.notes}
                    </td>
                    <td className="col-start-2 row-span-6 row-start-1 self-start sm:px-1 sm:py-1">
                      <div className="flex gap-1 sm:justify-end">
                        <Button
                          variant="ghost"
                          className="min-w-11 px-0"
                          aria-label={`Change the submission of ${names} to ${row.venue}`}
                          data-focus={`edit-${row.id}`}
                          onClick={() => {
                            setForm({ editing: row });
                          }}
                        >
                          <Pencil aria-hidden="true" className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          className="min-w-11 px-0"
                          aria-label={`Delete the submission of ${names} to ${row.venue}`}
                          onClick={() => {
                            deleteSubmission(row.id).then(
                              (gone) => {
                                if (!gone) return;
                                if (form?.editing?.id === gone.id) setForm(null);
                                setMessage(`Deleted the submission to ${gone.venue}.`);
                                setDeleted(gone);
                              },
                              () => {
                                announce('Vlo could not delete the submission on this device.');
                              },
                            );
                          }}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={cn('flex min-h-11 flex-wrap items-center gap-3 text-sm', message === '' && 'sr-only')}>
        <p role="status" className="text-muted">
          {message}
        </p>
        {deleted && (
          <Button
            ref={undoRef}
            variant="outline"
            onClick={() => {
              const row = deleted;
              restoreSubmission(row).then(
                () => {
                  focusNext.current = `edit-${row.id}`;
                  announce(`Restored the submission to ${row.venue}.`);
                },
                () => {
                  announce('Vlo could not restore the submission on this device.');
                },
              );
            }}
          >
            Undo
          </Button>
        )}
      </div>
    </section>
  );
}
