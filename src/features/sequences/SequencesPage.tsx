import { Copy, Download, ListOrdered, Pencil, Plus, Trash2 } from 'lucide-react';
import { countUnit } from '@/lib/wordcount';
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { hasTemplate, projectDef } from '@/features/library/templates';
import { usePeople } from '@/features/people/people';
import { useProject } from '@/features/project/useProject';
import { ViewTabs } from '@/features/project/ViewTabs';
import type { Sequence } from '@/lib/db';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Ring } from './Ring';
import { SequenceList, type SequenceActions } from './SequenceList';
import {
  addSequence,
  copySequence,
  deleteSequence,
  MAX_SEQUENCE_NAME,
  moved,
  orderedPoems,
  poemsOf,
  renameSequence,
  restoreSequence,
  setSequenceOrder,
  useSequences,
} from './sequences';
import { ProjectMissing, WrongTemplate } from '@/features/project/ViewNotices';

// The export dialog and its worker load only when the poet exports an order (E2).
const ExportDialog = lazy(async () => ({
  default: (await import('@/features/export/ExportDialog')).ExportDialog,
}));

/*
 * The Collection Sequencer (spec 8.3, plan Task C6, F18). A poetry collection keeps many named orders of
 * the same poems, for a chapbook, a contest or a reading. Each order is independent (US08).
 */

const ORDER = 'order';

function problemText(problem: unknown, fallback: string): string {
  return problem instanceof RangeError ? problem.message : fallback;
}

/** A one-field form for an order's name. */
function NameForm({
  label,
  submit,
  initial = '',
  onSave,
  onCancel,
}: {
  label: string;
  submit: string;
  initial?: string;
  onSave: (name: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial);
  const [error, setError] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name).then(
          () => {
            setName('');
            setError('');
          },
          (problem: unknown) => {
            setError(problemText(problem, 'Vlo could not save the order on this device.'));
          },
        );
      }}
    >
      <div className="grid min-w-48 flex-1 gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          value={name}
          maxLength={MAX_SEQUENCE_NAME}
          autoComplete="off"
          aria-invalid={error !== '' || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && onCancel) {
              event.preventDefault();
              onCancel();
            }
          }}
        />
      </div>
      <Button type="submit">{submit}</Button>
      {onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="basis-full text-sm text-accent-text">
          {error}
        </p>
      )}
    </form>
  );
}

export function SequencesPage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const state = useProject(projectId);
  const sequences = useSequences(projectId);
  const people = usePeople(projectId);
  const motion = useMotionAllowed();
  const [message, setMessage] = useState('');
  const [deleted, setDeleted] = useState<Sequence | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const undoRef = useRef<HTMLButtonElement>(null);

  useDocumentTitle(
    state.status === 'ready'
      ? `${state.project.title}, Sequences`
      : state.status === 'missing'
        ? 'Project not found'
        : 'Sequences',
  );

  useEffect(() => {
    if (deleted) undoRef.current?.focus();
  }, [deleted]);

  const items = useMemo(() => (state.status === 'ready' ? state.items : []), [state]);
  const poems = useMemo(() => poemsOf(items), [items]);
  const current = sequences?.find((s) => s.id === params.get(ORDER)) ?? sequences?.[0] ?? null;
  const ordered = useMemo(() => (current ? orderedPoems(current, poems) : []), [current, poems]);

  // The latest order for the card actions, so the actions object stays the same between renders.
  const latest = useRef({ current, ordered });
  useEffect(() => {
    latest.current = { current, ordered };
  });

  const actions = useMemo<SequenceActions>(
    () => ({
      move: (from, to) => {
        const { current: sequence, ordered: list } = latest.current;
        const poem = list[from];
        if (!sequence || !poem || from === to) return;
        const next = moved(
          list.map((p) => p.id),
          from,
          to,
        );
        setSequenceOrder(sequence.id, next).then(
          () => {
            setDeleted(null);
            setMessage(
              `${poem.title} moved. It is now ${String(next.indexOf(poem.id) + 1)} of ${String(next.length)} in ${sequence.name}.`,
            );
          },
          () => {
            setMessage('Vlo could not save the order on this device.');
          },
        );
      },
      open: (poem) => {
        void navigate(`/p/${projectId}?${new URLSearchParams({ item: poem.id }).toString()}`);
      },
    }),
    [navigate, projectId],
  );

  if (state.status === 'loading' || sequences === undefined) return null;

  if (state.status === 'missing') {
    return <ProjectMissing />;
  }

  const { project } = state;
  const template = projectDef(project);

  if (!hasTemplate(project, 'poetry')) {
    return <WrongTemplate project={project} forWhom="The Collection Sequencer is for poetry collections." />;
  }

  const announce = (text: string) => {
    setDeleted(null);
    setMessage(text);
  };

  const pick = (sequence: Sequence) => {
    setRenaming(false);
    setParams({ [ORDER]: sequence.id }, { replace: true });
  };

  const add = async (name: string) => {
    const sequence = await addSequence(project.id, name);
    setAdding(false);
    pick(sequence);
    announce(
      `Made the order ${sequence.name} with ${String(poems.length)} ${poems.length === 1 ? 'poem' : 'poems'}.`,
    );
  };

  return (
    <section className="grid gap-6">
      <header className="min-w-0">
        <p className="text-sm text-muted">{template.label}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold [overflow-wrap:anywhere] sm:text-4xl">
          {project.title}
        </h1>
        <ViewTabs project={project} />
      </header>

      {sequences.length === 0 ? (
        <div className="grid max-w-prose gap-4">
          <div className="grid gap-2">
            <h2 className="font-display text-2xl font-semibold">Orders of your poems</h2>
            <p className="text-muted">
              An order is a list of your poems for a chapbook, a contest or a reading. Each order keeps its
              own sequence, and the binder stays as it is.
            </p>
          </div>
          <NameForm label="Name of the first order" submit="Make order" onSave={add} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Orders" className="flex flex-wrap gap-1">
              {sequences.map((sequence) => (
                <button
                  key={sequence.id}
                  type="button"
                  aria-pressed={sequence.id === current?.id}
                  onClick={() => {
                    pick(sequence);
                  }}
                  className={cn(
                    'flex min-h-11 items-center rounded-md border px-3 text-sm font-medium [overflow-wrap:anywhere]',
                    sequence.id === current?.id
                      ? 'border-text bg-text text-bg'
                      : 'border-rule text-muted hover:text-text',
                  )}
                >
                  {sequence.name}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setAdding(true);
                setRenaming(false);
              }}
            >
              <Plus aria-hidden="true" className="size-4" />
              New order
            </Button>
          </div>

          {adding && (
            <NameForm
              label="Name of the new order"
              submit="Make order"
              onSave={add}
              onCancel={() => {
                setAdding(false);
              }}
            />
          )}

          {current && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
              <div className="grid min-w-0 gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="mr-auto flex items-center gap-2 font-display text-2xl font-semibold [overflow-wrap:anywhere]">
                    <ListOrdered aria-hidden="true" className="size-5 shrink-0 text-accent-text" />
                    {current.name}
                  </h2>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRenaming(true);
                      setAdding(false);
                    }}
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      copySequence(current.id, `${current.name} copy`).then(
                        (copy) => {
                          if (!copy) return;
                          pick(copy);
                          announce(`Made ${copy.name}, with the same order as ${current.name}.`);
                        },
                        (problem: unknown) => {
                          announce(problemText(problem, 'Vlo could not copy the order on this device.'));
                        },
                      );
                    }}
                  >
                    <Copy aria-hidden="true" className="size-4" />
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setExporting(true);
                    }}
                  >
                    <Download aria-hidden="true" className="size-4" />
                    Export
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      deleteSequence(current.id).then(
                        (row) => {
                          if (!row) return;
                          setRenaming(false);
                          setParams({}, { replace: true });
                          setMessage(`Deleted the order ${row.name}. The poems stay in the binder.`);
                          setDeleted(row);
                        },
                        () => {
                          announce('Vlo could not delete the order on this device.');
                        },
                      );
                    }}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Delete
                  </Button>
                </div>

                {renaming && (
                  <NameForm
                    key={current.id}
                    label={`New name for ${current.name}`}
                    submit="Save name"
                    initial={current.name}
                    onSave={async (name) => {
                      await renameSequence(current.id, name);
                      setRenaming(false);
                      announce(`Renamed the order to ${name.trim()}.`);
                    }}
                    onCancel={() => {
                      setRenaming(false);
                    }}
                  />
                )}

                {ordered.length === 0 ? (
                  <p className="text-muted">This collection has no poems yet. Add a poem in the binder.</p>
                ) : (
                  <SequenceList
                    name={current.name}
                    poems={ordered}
                    motion={motion}
                    actions={actions}
                    unit={countUnit(project.settings.language)}
                  />
                )}
              </div>
              <Ring name={current.name} titles={ordered.map((p) => p.title)} motion={motion} />
            </div>
          )}
        </>
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
              restoreSequence(row).then(
                () => {
                  pick(row);
                  announce(`Restored the order ${row.name}.`);
                },
                () => {
                  announce('Vlo could not restore the order on this device.');
                },
              );
            }}
          >
            Undo
          </Button>
        )}
      </div>

      {exporting && current && (
        <Suspense fallback={null}>
          <ExportDialog
            open
            onOpenChange={setExporting}
            project={project}
            items={items}
            currentItemId={null}
            people={people ?? []}
            sequence={{ name: current.name, itemIds: ordered.map((p) => p.id) }}
          />
        </Suspense>
      )}
    </section>
  );
}
