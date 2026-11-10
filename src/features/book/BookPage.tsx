import { Printer } from 'lucide-react';
import { lazy, Suspense, useId, useState } from 'react';
import { useParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { updateProjectSettings } from '@/features/library/projects';
import { projectDef } from '@/features/library/templates';
import { usePeople } from '@/features/people/people';
import { useProject } from '@/features/project/useProject';
import { ProjectMissing } from '@/features/project/ViewNotices';
import { ViewTabs } from '@/features/project/ViewTabs';
import { clock } from '@/lib/clock';
import { MAX_BOOK_TEXT, TRIMS, type BookSettings, type Item, type Project, type Trim } from '@/lib/db';
import { Button } from '@/ui/button';
import { Label } from '@/ui/label';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';
import { Switch } from '@/ui/switch';
import { Textarea } from '@/ui/textarea';
import { DEFAULT_BOOK, startingCopyright } from './book';
import { BookPreview } from './BookPreview';

/*
 * The Book screen (roadmap F51, plan Task J5): the trim size, the chapter style and the front and back
 * matter on the left, and the print preview on the right. "Export the book" opens the Export dialog with
 * a PDF in book layout.
 */

const ExportDialog = lazy(async () => ({
  default: (await import('@/features/export/ExportDialog')).ExportDialog,
}));

const TRIM_LABELS: Record<Trim, string> = {
  '5x8': '5 × 8 in',
  '5.25x8': '5.25 × 8 in',
  '5.5x8.5': '5.5 × 8.5 in',
  '6x9': '6 × 9 in',
  a5: 'A5',
};

const CHAPTERS: { id: BookSettings['chapter']; label: string; detail: string }[] = [
  { id: 'classic', label: 'Classic', detail: 'A centered number and title.' },
  { id: 'modern', label: 'Modern', detail: 'A large number at the left.' },
  { id: 'plain', label: 'Plain', detail: 'The title only.' },
];

const BREAKS: { id: BookSettings['sceneBreak']; label: string }[] = [
  { id: 'stars', label: 'Three stars' },
  { id: 'fleuron', label: 'A fleuron (❦)' },
  { id: 'space', label: 'A blank line' },
];

const TEXTS: { key: 'copyright' | 'dedication' | 'epigraph' | 'acknowledgments' | 'about'; label: string }[] =
  [
    { key: 'copyright', label: 'Copyright page' },
    { key: 'dedication', label: 'Dedication' },
    { key: 'epigraph', label: 'Epigraph' },
    { key: 'acknowledgments', label: 'Acknowledgments' },
    { key: 'about', label: 'About the author' },
  ];

export function BookPage() {
  const { projectId = '' } = useParams();
  const state = useProject(projectId);
  useDocumentTitle(state.status === 'ready' ? `Book of ${state.project.title}` : 'Book');
  if (state.status === 'loading') return null;
  if (state.status === 'missing') return <ProjectMissing />;
  return <BookScreen key={state.project.id} project={state.project} items={state.items} />;
}

function BookScreen({ project, items }: { project: Project; items: Item[] }) {
  const id = useId();
  const people = usePeople(project.id);
  const [book, setBook] = useState<BookSettings>(
    () =>
      project.settings.book ?? {
        ...DEFAULT_BOOK,
        copyright: startingCopyright(project, new Date(clock.now()).getFullYear()),
      },
  );
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const save = (next: BookSettings) => {
    updateProjectSettings(project.id, { book: next }).then(
      () => {
        setError('');
      },
      () => {
        setError('Vlo could not save that change on this device.');
      },
    );
  };
  /** A choice saves at once. A text saves when the writer leaves its field, and the preview follows each key. */
  const choose = (change: Partial<BookSettings>) => {
    const next = { ...book, ...change };
    setBook(next);
    save(next);
  };

  return (
    <section className="grid gap-6">
      <header className="min-w-0">
        <p className="text-sm text-muted">{projectDef(project).label}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold [overflow-wrap:anywhere] sm:text-4xl">
          {project.title}
        </h1>
        <ViewTabs project={project} />
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid max-w-prose gap-1">
          <h2 className="font-display text-2xl font-semibold">Book</h2>
          <p className="text-sm text-muted">
            Lay out the whole project as a printed book. The preview shows each page of the PDF.
          </p>
        </div>
        <Button
          onClick={() => {
            setExporting(true);
          }}
        >
          <Printer aria-hidden="true" className="size-4" />
          Export the book
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(18rem,22rem)_1fr]">
        {/* The preview comes first, so a phone shows it above the settings. */}
        <div className="min-w-0 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:self-start">
          <BookPreview project={project} items={items} book={book} />
        </div>
        <form
          aria-label="Book settings"
          className="grid content-start gap-6 lg:col-start-1 lg:row-start-1"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-trim`}>Trim size</Label>
            <select
              id={`${id}-trim`}
              value={book.trim}
              aria-describedby={`${id}-trim-hint`}
              onChange={(event) => {
                choose({ trim: event.target.value as Trim });
              }}
              className="min-h-11 rounded-md border border-rule bg-bg px-2 text-sm"
            >
              {TRIMS.map((trim) => (
                <option key={trim} value={trim}>
                  {TRIM_LABELS[trim]}
                </option>
              ))}
            </select>
            <p id={`${id}-trim-hint`} className="text-sm text-muted">
              The inside margin grows with the page count, as KDP and IngramSpark ask.
            </p>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Chapter style</legend>
            <RadioGroup
              aria-label="Chapter style"
              value={book.chapter}
              onValueChange={(next) => {
                choose({ chapter: next as BookSettings['chapter'] });
              }}
            >
              {CHAPTERS.map((style) => (
                <div key={style.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <RadioGroupItem id={`${id}-chapter-${style.id}`} value={style.id} />
                  <label htmlFor={`${id}-chapter-${style.id}`}>
                    <span className="font-medium">{style.label}</span>{' '}
                    <span className="text-muted">{style.detail}</span>
                  </label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Scene break</legend>
            <RadioGroup
              aria-label="Scene break"
              value={book.sceneBreak}
              onValueChange={(next) => {
                choose({ sceneBreak: next as BookSettings['sceneBreak'] });
              }}
            >
              {BREAKS.map((mark) => (
                <div key={mark.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <RadioGroupItem id={`${id}-break-${mark.id}`} value={mark.id} />
                  <label htmlFor={`${id}-break-${mark.id}`}>{mark.label}</label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <Switch
                id={`${id}-caps`}
                checked={book.dropCaps}
                onCheckedChange={(dropCaps) => {
                  choose({ dropCaps });
                }}
              />
              <label htmlFor={`${id}-caps`} className="text-sm font-medium">
                A drop cap in each chapter
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id={`${id}-contents`}
                checked={book.contents}
                onCheckedChange={(contents) => {
                  choose({ contents });
                }}
              />
              <label htmlFor={`${id}-contents`} className="text-sm font-medium">
                A contents page
              </label>
            </div>
          </div>

          {TEXTS.map(({ key, label }) => (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={`${id}-${key}`}>{label}</Label>
              <Textarea
                id={`${id}-${key}`}
                value={book[key]}
                rows={key === 'copyright' ? 3 : 2}
                maxLength={MAX_BOOK_TEXT}
                onChange={(event) => {
                  setBook((now) => ({ ...now, [key]: event.target.value }));
                }}
                onBlur={() => {
                  save(book);
                }}
              />
            </div>
          ))}
          <p className="text-sm text-muted">An empty page stays out of the book.</p>

          {error && (
            <p role="alert" className="text-sm text-accent-text">
              {error}
            </p>
          )}
        </form>
      </div>

      {exporting && (
        <Suspense fallback={null}>
          <ExportDialog
            open
            onOpenChange={setExporting}
            project={project}
            items={items}
            currentItemId={null}
            people={people ?? []}
            book={book}
          />
        </Suspense>
      )}
    </section>
  );
}
