import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { inReadingOrder, mentionMatrix } from '@/features/codex/codex';
import { CodexMatrix } from '@/features/codex/CodexMatrix';
import { formatWords } from '@/features/library/format';
import { holdsText } from '@/features/library/templates';
import { SequenceList, type SequenceActions } from '@/features/sequences/SequenceList';
import { db, type Project, type Series, type StyleRule } from '@/lib/db';
import { sortByOrder } from '@/lib/order';
import { countUnit, type CountUnit } from '@/lib/wordcount';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/ui/alert-dialog';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { leaveSeries, MAX_SERIES_TITLE, moveBook, renameSeries, setStyleSheet, styleRule } from './series';
import { seriesTimeline } from './timeline';
import { SeriesTimeline } from './SeriesTimeline';

/*
 * The Series page (roadmap F59, plan Task K8): the books in order, their words, the shared Codex with its
 * mentions in each book, the style sheet that the style check of each book uses, and the timeline of
 * the scenes of every book (F67).
 */

interface Book {
  id: string;
  title: string;
  words: number;
  unit: CountUnit;
}

const SAVE_FAILED = 'Vlo could not save that change on this device.';
const problemText = (problem: unknown) => (problem instanceof RangeError ? problem.message : SAVE_FAILED);

/** The series with its books, its shared entries, their mentions in each book and its timeline. Null when it is gone. */
async function seriesView(seriesId: string) {
  return db.transaction('r', [db.series, db.projects, db.items, db.codex, db.itemTexts], async () => {
    const series = await db.series.get(seriesId);
    if (!series) return null;
    const projects = (await db.projects.bulkGet(series.projectIds)).filter((p): p is Project => !!p);
    const ids = projects.map((p) => p.id);
    const items = await db.items.where('projectId').anyOf(ids).toArray();
    const words = new Map<string, number>();
    for (const item of items) words.set(item.projectId, (words.get(item.projectId) ?? 0) + item.wordCount);
    const templates = new Map(projects.map((p) => [p.id, p.templates]));
    const timeline = seriesTimeline(
      // A memory has its own date on the Memory Timeline, so it takes no story date.
      inReadingOrder(projects, items).filter(
        ({ item }) => item.kind !== 'memory' && holdsText(templates.get(item.projectId) ?? [], item.kind),
      ),
    );
    const books: Book[] = projects.map((p) => ({
      id: p.id,
      title: p.title,
      words: words.get(p.id) ?? 0,
      unit: countUnit(p.settings.language),
    }));
    const entries = sortByOrder(await db.codex.where('projectId').equals(series.id).toArray());
    // The mentions table has a column for each book, so each text counts for its book.
    const texts = await db.itemTexts.where('projectId').anyOf(ids).toArray();
    const matrix = mentionMatrix(
      entries,
      texts.map((t) => ({ itemId: t.projectId, text: t.text })),
    );
    return { series, books, entries, matrix, timeline };
  });
}

function RuleForm({ series, onSaved }: { series: Series; onSaved: (text: string) => void }) {
  const id = useId();
  const [use, setUse] = useState('');
  const [avoid, setAvoid] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      aria-labelledby={`${id}-title`}
      className="grid gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        let rule: StyleRule;
        try {
          rule = styleRule(use, avoid, note);
        } catch (problem) {
          setError(problemText(problem));
          return;
        }
        const rest = series.styleSheet.filter((r) => r.use !== rule.use);
        setStyleSheet(series.id, [...rest, rule]).then(
          () => {
            setUse('');
            setAvoid('');
            setNote('');
            setError('');
            onSaved(`Added the rule for ${rule.use}.`);
          },
          (problem: unknown) => {
            setError(problemText(problem));
          },
        );
      }}
    >
      <h3 id={`${id}-title`} className="text-base font-semibold">
        Add a rule
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-use`}>Use</Label>
          <Input
            id={`${id}-use`}
            value={use}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setUse(event.target.value);
              setError('');
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-avoid`}>Avoid</Label>
          <Input
            id={`${id}-avoid`}
            value={avoid}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${id}-avoid-help`}
            onChange={(event) => {
              setAvoid(event.target.value);
              setError('');
            }}
          />
          <p id={`${id}-avoid-help`} className="text-xs text-muted">
            Put a comma between forms, such as: grey-haired, grey haired.
          </p>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-note`}>Note (optional)</Label>
        <Input
          id={`${id}-note`}
          value={note}
          autoComplete="off"
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </div>
      <Button type="submit" variant="outline" className="justify-self-start">
        Add rule
      </Button>
      {error && (
        <p role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}
    </form>
  );
}

function StyleSheet({ series, announce }: { series: Series; announce: (text: string) => void }) {
  const remove = (rule: StyleRule) => {
    setStyleSheet(
      series.id,
      series.styleSheet.filter((r) => r !== rule),
    ).then(
      () => {
        announce(`Removed the rule for ${rule.use}.`);
      },
      () => {
        announce(SAVE_FAILED);
      },
    );
  };
  return (
    <section aria-labelledby="series-sheet" className="grid gap-3">
      <h2 id="series-sheet" className="font-display text-2xl font-semibold">
        Style sheet
      </h2>
      <p className="max-w-prose text-sm text-muted">
        The forms that the books use, such as the spelling of a name. In an English book with the style check
        on, each form to avoid gets a mark that names the form to use.
      </p>
      {series.styleSheet.length === 0 ? (
        <p className="text-muted">No rules yet.</p>
      ) : (
        <ul className="grid max-w-prose gap-2">
          {series.styleSheet.map((rule) => (
            <li key={rule.use} className="flex items-start gap-2 rounded-md border border-rule px-3 py-2">
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <p>
                  Use <strong>{rule.use}</strong>, not {rule.avoid.join(', ')}.
                </p>
                {rule.note && <p className="text-sm text-muted">{rule.note}</p>}
              </div>
              <Button
                variant="ghost"
                className="px-3"
                aria-label={`Remove the rule for ${rule.use}`}
                onClick={() => {
                  remove(rule);
                }}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <RuleForm series={series} onSaved={announce} />
    </section>
  );
}

function RenameForm({ series, announce }: { series: Series; announce: (text: string) => void }) {
  const id = useId();
  const [title, setTitle] = useState(series.title);
  const [error, setError] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        renameSeries(series.id, title).then(
          () => {
            setError('');
            announce('Saved the title.');
          },
          (problem: unknown) => {
            setError(problemText(problem));
          },
        );
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-title`}>Title of the series</Label>
        <Input
          id={`${id}-title`}
          value={title}
          maxLength={MAX_SERIES_TITLE}
          autoComplete="off"
          aria-invalid={error !== '' || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            setError('');
          }}
        />
      </div>
      <Button type="submit" variant="outline">
        Rename
      </Button>
      {error && (
        <p id={`${id}-error`} role="alert" className="basis-full text-sm text-accent-text">
          {error}
        </p>
      )}
    </form>
  );
}

export function SeriesPage() {
  const { seriesId = '' } = useParams();
  const navigate = useNavigate();
  const motion = useMotionAllowed();
  const view = useLiveQuery(() => seriesView(seriesId), [seriesId]);
  const [message, setMessage] = useState('');
  const [leaving, setLeaving] = useState<Book | null>(null);
  useDocumentTitle(view ? view.series.title : 'Series');

  // The latest series for the card actions, so the actions object stays the same between renders.
  const latest = useRef(view);
  useEffect(() => {
    latest.current = view;
  });
  const actions = useMemo<SequenceActions<Book>>(
    () => ({
      move: (from, to) => {
        const now = latest.current;
        const book = now?.books[from];
        const target = now?.books[to];
        if (!now || !book || !target || from === to) return;
        const order = now.series.projectIds;
        moveBook(now.series.id, order.indexOf(book.id), order.indexOf(target.id)).then(
          () => {
            setMessage(
              `${book.title} moved. It is now book ${String(to + 1)} of ${String(now.books.length)}.`,
            );
          },
          () => {
            setMessage('Vlo could not save the order on this device.');
          },
        );
      },
      open: (book) => {
        void navigate(`/p/${book.id}`);
      },
    }),
    [navigate],
  );
  const details = useCallback(
    (book: Book) => (
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{formatWords(book.words, book.unit)}</p>
        <Button
          variant="ghost"
          className="px-2 text-xs"
          onClick={() => {
            setLeaving(book);
          }}
        >
          Leave the series
        </Button>
      </div>
    ),
    [],
  );

  if (view === undefined) return null;
  if (view === null)
    return (
      <section>
        <h1 className="font-display text-4xl font-semibold">Series not found</h1>
        <p className="mt-4 text-muted">
          This device has no series at this address. Its last book may have left it.
        </p>
        <p className="mt-6">
          <Link to="/">Go to the Library</Link>
        </p>
      </section>
    );

  const { series, books, entries, matrix, timeline } = view;
  const unit = books[0]?.unit ?? 'words';
  const sameUnit = books.every((b) => b.unit === unit);
  const total = books.reduce((sum, b) => sum + b.words, 0);
  const last = books.length === 1;

  return (
    <section className="grid gap-8">
      <header className="grid gap-1">
        <p className="text-sm text-muted">Series</p>
        <h1 className="font-display text-3xl font-semibold [overflow-wrap:anywhere] sm:text-4xl">
          {series.title}
        </h1>
        <p className="tabular-nums text-muted">
          {books.length === 1 ? '1 book' : `${String(books.length)} books`}
          {sameUnit && `, ${formatWords(total, unit)}`}
        </p>
      </header>

      <p role="status" className={message ? 'text-sm text-muted' : 'sr-only'}>
        {message}
      </p>

      <section aria-labelledby="series-books" className="grid gap-3">
        <h2 id="series-books" className="font-display text-2xl font-semibold">
          Books
        </h2>
        <SequenceList
          name={series.title}
          poems={books}
          motion={motion}
          actions={actions}
          noun="book"
          details={details}
        />
        <p className="text-sm text-muted">
          To add a book, open its menu in the Library and choose Add to a series.
        </p>
      </section>

      <section aria-labelledby="series-codex" className="grid gap-3">
        <h2 id="series-codex" className="font-display text-2xl font-semibold">
          Shared Codex
        </h2>
        <p className="max-w-prose text-sm text-muted">
          {entries.length === 0
            ? 'No shared entries yet. In the Codex of a book, open an entry and turn on Share with the series.'
            : 'Each book of the series shows these entries. Change a shared entry in the Codex of any book.'}
        </p>
        <CodexMatrix entries={entries} columns={books} noun="book" matrix={matrix} />
      </section>

      <SeriesTimeline {...timeline} />

      <StyleSheet series={series} announce={setMessage} />

      <RenameForm key={series.title} series={series} announce={setMessage} />

      <AlertDialog
        open={leaving !== null}
        onOpenChange={(open) => {
          if (!open) setLeaving(null);
        }}
      >
        {leaving && (
          <AlertDialogContent>
            <AlertDialogTitle className="[overflow-wrap:anywhere]">
              Take {leaving.title} out of {series.title}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {last
                ? 'This is the last book, so the series and its style sheet go. The book keeps a copy of each shared entry whose names its text holds, and the other shared entries go.'
                : 'The book keeps a copy of each shared entry whose names its text holds. The series keeps its entries.'}
            </AlertDialogDescription>
            <div className="flex flex-wrap justify-end gap-2">
              <AlertDialogCancel asChild>
                <Button variant="ghost">Cancel</Button>
              </AlertDialogCancel>
              <Button
                onClick={() => {
                  const book = leaving;
                  setLeaving(null);
                  leaveSeries(book.id).then(
                    () => {
                      if (last) void navigate('/');
                      else setMessage(`${book.title} left the series.`);
                    },
                    () => {
                      setMessage(SAVE_FAILED);
                    },
                  );
                }}
              >
                Leave the series
              </Button>
            </div>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </section>
  );
}
