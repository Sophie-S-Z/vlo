import type { Editor } from '@tiptap/core';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { updateProjectSettings } from '@/features/library/projects';
import type { CiteStyle, Source, SourceType } from '@/lib/db';
import { CITE_STYLES, SOURCE_TYPES } from '@/lib/db';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Textarea } from '@/ui/textarea';
import {
  addSources,
  deleteSource,
  namesFromText,
  namesToText,
  readSourceFile,
  restoreSource,
  updateSource,
  type SourceDraft,
} from './sources';
import { useSourceState } from './sourceStore';
import { CITE_STYLE_LABELS } from './styles';

/*
 * "Cite a source" (roadmap 2 F64, plan Tasks M5 and M6): the sources of the project, with Cite, Edit,
 * Delete and Undo, and the project's citation style. The writer types a source in, or imports a BibTeX or
 * CSL JSON file from Zotero.
 */

const SAVE_FAILED = 'Vlo could not save on this device. Check the storage space and try again.';
const SELECT = 'min-h-11 rounded-md border border-rule bg-bg px-2 text-sm text-text pointer-fine:min-h-9';

const TYPE_LABELS: Readonly<Record<SourceType, string>> = {
  book: 'Book',
  chapter: 'Chapter in a book',
  article: 'Journal article',
  web: 'Web page',
};

type Field = 'container' | 'editors' | 'publisher' | 'year' | 'volume' | 'issue' | 'pages' | 'doi' | 'url';

/** The fields that each type of source has, after its authors and title. */
const FIELDS: Readonly<Record<SourceType, readonly Field[]>> = {
  book: ['publisher', 'year', 'doi', 'url'],
  chapter: ['container', 'editors', 'publisher', 'year', 'pages', 'doi'],
  article: ['container', 'year', 'volume', 'issue', 'pages', 'doi', 'url'],
  web: ['container', 'year', 'url'],
};

const FIELD_LABELS: Readonly<Record<Exclude<Field, 'container'>, string>> = {
  editors: 'Editors of the book',
  publisher: 'Publisher',
  year: 'Year',
  volume: 'Volume',
  issue: 'Issue',
  pages: 'Pages',
  doi: 'DOI',
  url: 'Web address',
};

const CONTAINER_LABELS: Readonly<Record<SourceType, string>> = {
  book: '',
  chapter: 'Title of the book',
  article: 'Journal',
  web: 'Website',
};

/** "Marlow and Quill" or "Marlow et al.", for the list. */
function authorsShort(source: Source): string {
  const [first, second] = source.authors;
  if (!first) return source.title;
  if (source.authors.length === 1) return first.family;
  if (source.authors.length === 2 && second) return `${first.family} and ${second.family}`;
  return `${first.family} et al.`;
}

type FormValues = Record<Exclude<Field, 'editors'> | 'title', string> & {
  type: SourceType;
  authors: string;
  editors: string;
  key: string;
};

function valuesOf(source: Source | null): FormValues {
  return {
    type: source?.type ?? 'book',
    authors: namesToText(source?.authors),
    editors: namesToText(source?.editors),
    title: source?.title ?? '',
    container: source?.container ?? '',
    publisher: source?.publisher ?? '',
    year: source?.year ?? '',
    volume: source?.volume ?? '',
    issue: source?.issue ?? '',
    pages: source?.pages ?? '',
    doi: source?.doi ?? '',
    url: source?.url ?? '',
    key: source?.key ?? '',
  };
}

/** The draft of the form. A field that the type does not have stays out. */
function draftOf(values: FormValues, withKey: boolean): SourceDraft {
  const fields = FIELDS[values.type];
  const draft: SourceDraft = {
    type: values.type,
    authors: namesFromText(values.authors),
    title: values.title,
  };
  if (withKey && values.key.trim() !== '') draft.key = values.key.trim();
  for (const field of fields) {
    if (field === 'editors') draft.editors = namesFromText(values.editors);
    else draft[field] = values[field];
  }
  return draft;
}

function SourceForm({
  source,
  onSaved,
  onCancel,
}: {
  /** The source to edit, or null for a new one. */
  source: Source | null;
  onSaved: (title: string) => void;
  onCancel: () => void;
}) {
  const projectId = useSourceState().projectId;
  const [values, setValues] = useState(() => valuesOf(source));
  const [error, setError] = useState('');
  const id = useId();
  const set = (key: keyof FormValues) => (event: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: event.target.value }));
    setError('');
  };
  const field = (key: keyof FormValues, label: string, more: { hint?: string; inputMode?: 'url' } = {}) => (
    <div className="grid gap-1.5" key={key}>
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input
        id={`${id}-${key}`}
        value={values[key]}
        onChange={set(key)}
        spellCheck={key === 'title' || key === 'container' || key === 'publisher'}
        {...(more.inputMode ? { inputMode: more.inputMode } : {})}
        {...(more.hint ? { 'aria-describedby': `${id}-${key}-hint` } : {})}
      />
      {more.hint && (
        <p id={`${id}-${key}-hint`} className="text-xs text-muted">
          {more.hint}
        </p>
      )}
    </div>
  );
  const names = (key: 'authors' | 'editors', label: string) => (
    <div className="grid gap-1.5" key={key}>
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Textarea
        id={`${id}-${key}`}
        className="min-h-16"
        value={values[key]}
        onChange={set(key)}
        spellCheck={false}
        aria-describedby={`${id}-names-hint`}
      />
      <p id={`${id}-names-hint`} className="text-xs text-muted">
        One name on each line, as “Family, Given”.
      </p>
    </div>
  );

  return (
    <form
      className="grid gap-3"
      aria-label={source ? 'Edit source' : 'Add a source'}
      onSubmit={(event) => {
        event.preventDefault();
        if (projectId === null) return;
        const draft = draftOf(values, source === null);
        const saved = source ? updateSource(source.id, draft) : addSources(projectId, [draft]);
        saved.then(
          () => {
            onSaved(draft.title.trim());
          },
          (problem: unknown) => {
            setError(problem instanceof RangeError ? problem.message : SAVE_FAILED);
          },
        );
      }}
    >
      <h3 className="text-sm font-medium">{source ? 'Edit source' : 'Add a source'}</h3>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-type`}>Type</Label>
        <select
          id={`${id}-type`}
          className={SELECT}
          value={values.type}
          onChange={(event) => {
            setValues((v) => ({ ...v, type: event.target.value as SourceType }));
          }}
        >
          {SOURCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      {names('authors', 'Authors')}
      {field('title', 'Title')}
      {FIELDS[values.type].map((key) =>
        key === 'editors'
          ? names('editors', FIELD_LABELS.editors)
          : key === 'container'
            ? field('container', CONTAINER_LABELS[values.type])
            : field(key, FIELD_LABELS[key], key === 'url' || key === 'doi' ? { inputMode: 'url' } : {}),
      )}
      {source === null &&
        field('key', 'Key', { hint: 'Optional. Vlo makes one from the first author and the year.' })}
      {error && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

export function SourcesPanel({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const { projectId, sources, style } = useSourceState();
  const [editing, setEditing] = useState<Source | 'new' | null>(null);
  const [page, setPage] = useState('');
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const [deleted, setDeleted] = useState<Source | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const undo = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (deleted) undo.current?.focus();
  }, [deleted]);

  const announce = (text: string) => {
    setDeleted(null);
    setProblem('');
    setMessage(text);
  };

  const importFile = async (file: File) => {
    if (projectId === null) return;
    try {
      const added = await addSources(projectId, readSourceFile(file.name, await file.text()));
      announce(added.length === 1 ? 'Added 1 source.' : `Added ${String(added.length)} sources.`);
    } catch (error) {
      setMessage('');
      setProblem(error instanceof RangeError ? error.message : SAVE_FAILED);
    }
  };

  if (editing !== null)
    return (
      <div className="grid max-h-[min(36rem,70dvh)] gap-3 overflow-y-auto p-0.5">
        <SourceForm
          source={editing === 'new' ? null : editing}
          onSaved={(title) => {
            setEditing(null);
            announce(editing === 'new' ? `Added ${title}.` : `Saved ${title}.`);
          }}
          onCancel={() => {
            setEditing(null);
          }}
        />
      </div>
    );

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <h2 className="text-sm font-medium">Cite a source</h2>
        <p className="text-sm text-muted">
          Choose a source to cite it at the cursor. Exports add a list of the works that you cite.
        </p>
      </div>
      {sources.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-page`}>Page</Label>
            <Input
              id={`${id}-page`}
              value={page}
              placeholder="Optional"
              onChange={(event) => {
                setPage(event.target.value);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-style`}>Style</Label>
            <select
              id={`${id}-style`}
              className={SELECT}
              value={style}
              onChange={(event) => {
                if (projectId === null) return;
                updateProjectSettings(projectId, { citeStyle: event.target.value as CiteStyle }).catch(() => {
                  setProblem(SAVE_FAILED);
                });
              }}
            >
              {CITE_STYLES.map((value) => (
                <option key={value} value={value}>
                  {CITE_STYLE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {sources.length === 0 ? (
        <p className="text-sm text-muted">
          No sources yet. Add one, or import a BibTeX or CSL JSON file from Zotero.
        </p>
      ) : (
        <ul aria-label="Sources" className="grid max-h-64 gap-1 overflow-y-auto">
          {sources.map((source) => (
            <li key={source.id} className="flex items-center gap-1">
              <Button
                variant="ghost"
                aria-label={`Cite ${source.title}`}
                className="block min-w-0 flex-1 px-2 py-1 text-left font-normal whitespace-normal [overflow-wrap:anywhere]"
                onClick={() => {
                  editor.chain().focus().insertCitation(source.key, page).run();
                  onDone();
                }}
              >
                {authorsShort(source)}
                {source.year ? ` ${source.year}` : ''}
                <span className="block text-xs text-muted">{source.title}</span>
              </Button>
              <Button
                variant="ghost"
                className="px-2"
                aria-label={`Edit ${source.title}`}
                onClick={() => {
                  setEditing(source);
                }}
              >
                <Pencil aria-hidden="true" className="size-4" />
              </Button>
              <Button
                variant="ghost"
                className="px-2"
                aria-label={`Delete ${source.title}`}
                onClick={() => {
                  deleteSource(source.id).then(
                    (gone) => {
                      setProblem('');
                      setMessage(`Deleted ${source.title}. Its citations show “[missing source]”.`);
                      setDeleted(gone ?? null);
                    },
                    () => {
                      setProblem(SAVE_FAILED);
                    },
                  );
                }}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p role="status" className={message === '' ? 'sr-only' : 'text-muted'}>
          {message}
        </p>
        {deleted && (
          <Button
            ref={undo}
            variant="outline"
            onClick={() => {
              const source = deleted;
              restoreSource(source).then(
                () => {
                  announce(`Restored ${source.title}.`);
                },
                () => {
                  setProblem(SAVE_FAILED);
                },
              );
            }}
          >
            Undo
          </Button>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-sm text-accent-text">
          {problem}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept=".bib,.bibtex,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="sources-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void importFile(file);
        }}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => input.current?.click()}>
          Import a file
        </Button>
        <Button
          onClick={() => {
            setEditing('new');
          }}
        >
          Add a source
        </Button>
      </div>
    </div>
  );
}
