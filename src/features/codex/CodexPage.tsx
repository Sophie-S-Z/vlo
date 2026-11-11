import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { flattenTree } from '@/features/binder/tree';
import { projectDef } from '@/features/library/templates';
import { useProject } from '@/features/project/useProject';
import { ViewTabs } from '@/features/project/ViewTabs';
import { ProjectMissing } from '@/features/project/ViewNotices';
import { shareEntry, useSeriesOf } from '@/features/series/series';
import { db, type CodexEntry, type CodexKind, type Item, type Series } from '@/lib/db';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Switch } from '@/ui/switch';
import { Textarea } from '@/ui/textarea';
import {
  addEntry,
  CODEX_KINDS,
  deleteEntry,
  MAX_CODEX_NAME,
  MAX_CODEX_NOTE,
  mentionMatrix,
  restoreEntry,
  updateEntry,
  useCodex,
  useReadingOrder,
  type ReadingItem,
} from './codex';
import { CodexChanges } from './CodexChanges';
import { CodexMatrix } from './CodexMatrix';

/*
 * The Codex screen (roadmap F42, plan Task H5): the entries by kind, the open entry, and the mentions of
 * each entry in the text. The address keeps the open entry (`entry=<id>`).
 */

const SAVE_FAILED = 'Vlo could not save that change on this device.';

function problemText(problem: unknown): string {
  return problem instanceof RangeError ? problem.message : SAVE_FAILED;
}

function KindSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: CodexKind;
  onChange: (kind: CodexKind) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => {
        onChange(event.target.value as CodexKind);
      }}
      className="min-h-11 rounded-md border border-rule bg-bg px-2 text-sm"
    >
      {CODEX_KINDS.map((kind) => (
        <option key={kind.id} value={kind.id}>
          {kind.label}
        </option>
      ))}
    </select>
  );
}

function AddEntryForm({ projectId, onAdded }: { projectId: string; onAdded: (entry: CodexEntry) => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CodexKind>('character');
  const [error, setError] = useState('');
  return (
    <form
      aria-labelledby={`${id}-title`}
      className="grid gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        addEntry(projectId, kind, name).then(
          (entry) => {
            setName('');
            setError('');
            onAdded(entry);
          },
          (problem: unknown) => {
            setError(problemText(problem));
          },
        );
      }}
    >
      <h3 id={`${id}-title`} className="text-base font-semibold">
        Add an entry
      </h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={MAX_CODEX_NAME}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error !== '' || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-kind`}>Kind</Label>
          <KindSelect id={`${id}-kind`} value={kind} onChange={setKind} />
        </div>
        <Button type="submit">
          <Plus aria-hidden="true" className="size-4" />
          Add entry
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
    </form>
  );
}

/** The open entry. Each field saves when it loses focus. */
function EntryPanel({
  entry,
  projectId,
  series,
  mentions,
  order,
  scenes,
  onDelete,
}: {
  entry: CodexEntry;
  projectId: string;
  series: Series | null;
  mentions: number;
  order: readonly ReadingItem[];
  scenes: readonly Item[];
  onDelete: (entry: CodexEntry) => void;
}) {
  const id = useId();
  const [error, setError] = useState('');
  const save = (
    patch: Parameters<typeof updateEntry>[1],
    input?: HTMLInputElement | HTMLTextAreaElement,
    old = '',
  ) => {
    updateEntry(entry.id, patch).then(
      () => {
        setError('');
      },
      (problem: unknown) => {
        setError(problemText(problem));
        if (input) input.value = old;
      },
    );
  };
  const aliases = entry.aliases.join(', ');

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="grid content-start gap-4 rounded-[var(--radius-card)] border border-rule p-4"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <h3 id={`${id}-title`} className="font-display text-2xl font-semibold [overflow-wrap:anywhere]">
            {entry.name}
          </h3>
          <p className="text-sm text-muted">
            {mentions === 0
              ? 'No mentions in the text yet'
              : `${String(mentions)} ${mentions === 1 ? 'mention' : 'mentions'} in the text`}
          </p>
        </div>
        <Button
          variant="ghost"
          aria-label={`Delete ${entry.name}`}
          onClick={() => {
            onDelete(entry);
          }}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          <span className="max-sm:sr-only">Delete</span>
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            id={`${id}-name`}
            // Each field's key is its stored value, so a change from elsewhere redraws only that field.
            key={entry.name}
            defaultValue={entry.name}
            maxLength={MAX_CODEX_NAME}
            spellCheck={false}
            onBlur={(event) => {
              if (event.target.value.trim() !== entry.name)
                save({ name: event.target.value }, event.target, entry.name);
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-kind`}>Kind</Label>
          <KindSelect
            id={`${id}-kind`}
            value={entry.kind}
            onChange={(kind) => {
              save({ kind });
            }}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-aliases`}>Other names</Label>
        <Input
          id={`${id}-aliases`}
          key={aliases}
          defaultValue={aliases}
          spellCheck={false}
          aria-describedby={`${id}-aliases-help`}
          onBlur={(event) => {
            if (event.target.value !== aliases) save({ aliases: event.target.value }, event.target, aliases);
          }}
        />
        <p id={`${id}-aliases-help`} className="text-xs text-muted">
          Put a comma between names, such as: Mi, the girl.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-note`}>Note</Label>
        <Textarea
          id={`${id}-note`}
          key={entry.note ?? ''}
          rows={6}
          defaultValue={entry.note ?? ''}
          maxLength={MAX_CODEX_NOTE}
          onBlur={(event) => {
            if (event.target.value.trim() !== (entry.note ?? '')) save({ note: event.target.value });
          }}
        />
      </div>
      <CodexChanges entry={entry} projectId={projectId} order={order} scenes={scenes} />
      {series && (
        <div className="grid gap-1.5">
          <div className="flex items-center gap-3">
            <Switch
              id={`${id}-shared`}
              checked={entry.projectId === series.id}
              aria-describedby={`${id}-shared-help`}
              onCheckedChange={(shared) => {
                shareEntry(entry.id, projectId, shared).then(
                  () => {
                    setError('');
                  },
                  (problem: unknown) => {
                    setError(problemText(problem));
                  },
                );
              }}
            />
            <Label htmlFor={`${id}-shared`}>Share with the series</Label>
          </div>
          <p id={`${id}-shared-help`} className="text-xs text-muted">
            Each book of {series.title} shows a shared entry. Turn it off to keep the entry in this book only.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
    </section>
  );
}

export function CodexPage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const state = useProject(projectId);
  const entries = useCodex(projectId);
  const series = useSeriesOf(projectId);
  const order = useReadingOrder(projectId);
  const texts = useLiveQuery(() => db.itemTexts.where('projectId').equals(projectId).toArray(), [projectId]);
  const [message, setMessage] = useState('');
  const [deleted, setDeleted] = useState<CodexEntry | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  useDocumentTitle(state.status === 'ready' ? `Codex of ${state.project.title}` : 'Codex');

  useEffect(() => {
    if (deleted) undoRef.current?.focus();
  }, [deleted]);

  if (state.status === 'loading' || entries === undefined || series === undefined || order === undefined)
    return null;
  if (state.status === 'missing') return <ProjectMissing />;

  const { project, items } = state;
  const template = projectDef(project);
  const textItems = flattenTree(items)
    .map((node) => node.item)
    .filter((item) => template.editorKind(item.kind) !== null);
  const matrix = mentionMatrix(entries, texts ?? []);
  const open = entries.find((entry) => entry.id === params.get('entry')) ?? entries[0] ?? null;
  const select = (entry: CodexEntry | null) => {
    setParams(entry ? { entry: entry.id } : {}, { replace: true });
  };
  const announce = (text: string) => {
    setDeleted(null);
    setMessage(text);
  };
  const total = (entry: CodexEntry) => [...(matrix.get(entry.id)?.values() ?? [])].reduce((a, b) => a + b, 0);

  return (
    <section className="grid gap-6">
      <header className="min-w-0">
        <p className="text-sm text-muted">{template.label}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold [overflow-wrap:anywhere] sm:text-4xl">
          {project.title}
        </h1>
        <ViewTabs project={project} />
      </header>

      <div className="grid max-w-prose gap-1">
        <h2 className="font-display text-2xl font-semibold">Codex</h2>
        <p className="text-sm text-muted">
          The characters, places, things and lore of this project. Only you see the Codex: exports and shares
          leave it out, and only the reader panel sends the notes of the names in its passage. The browser
          does not mark these names as spelling mistakes.
        </p>
      </div>

      <AddEntryForm
        projectId={project.id}
        onAdded={(entry) => {
          announce(`Added ${entry.name}.`);
          select(entry);
        }}
      />

      <div className={cn('flex min-h-11 flex-wrap items-center gap-3 text-sm', message === '' && 'sr-only')}>
        <p role="status" className="text-muted">
          {message}
        </p>
        {deleted && (
          <Button
            ref={undoRef}
            variant="outline"
            onClick={() => {
              const entry = deleted;
              restoreEntry(entry).then(
                () => {
                  announce(`Restored ${entry.name}.`);
                  select(entry);
                },
                () => {
                  announce(SAVE_FAILED);
                },
              );
            }}
          >
            Undo
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-muted">No entries yet. Add the first entry above.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(12rem,16rem)_1fr]">
          <nav aria-label="Codex entries" className="grid content-start gap-4">
            {CODEX_KINDS.map((kind) => {
              const ofKind = entries.filter((entry) => entry.kind === kind.id);
              if (ofKind.length === 0) return null;
              return (
                <div key={kind.id} className="grid gap-1">
                  <h3 className="text-sm font-medium text-muted">{kind.heading}</h3>
                  <ul className="grid gap-0.5">
                    {ofKind.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          aria-current={entry.id === open?.id ? 'true' : undefined}
                          onClick={() => {
                            select(entry);
                          }}
                          className="min-h-11 w-full rounded-md px-2 text-left text-sm [overflow-wrap:anywhere] hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent aria-[current]:bg-surface aria-[current]:font-medium"
                        >
                          {entry.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
          {open && (
            <EntryPanel
              key={open.id}
              entry={open}
              projectId={project.id}
              series={series}
              mentions={total(open)}
              order={order}
              scenes={textItems}
              onDelete={(target) => {
                deleteEntry(target.id).then(
                  (row) => {
                    if (!row) return;
                    select(null);
                    setMessage(`Deleted ${row.name}.`);
                    setDeleted(row);
                  },
                  () => {
                    announce(SAVE_FAILED);
                  },
                );
              }}
            />
          )}
        </div>
      )}

      <CodexMatrix entries={entries} columns={textItems} noun="item" matrix={matrix} />
    </section>
  );
}
