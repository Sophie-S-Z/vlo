import { BookOpen, FileText, FileType, Globe, Printer } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { bookOf } from '@/features/book/book';
import { hasTemplate, projectDef } from '@/features/library/templates';
import { updateProjectSettings } from '@/features/library/projects';
import { markAllInProject } from '@/features/people/markAll';
import { type BookSettings, type Item, type ManuscriptSettings, type Person, type Project } from '@/lib/db';
import { clock } from '@/lib/clock';
import type { NameCheck } from '@/lib/privacy';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';
import { CopyButton } from '@/ui/copy-button';
import { Switch } from '@/ui/switch';
import { FAILED, NameCheckLists } from '@/features/people/NameCheckLists';
import { privatePeople } from '@/features/people/people';
import { Textarea } from '@/ui/textarea';
import { folderOf, type ExportScope } from './build';
import type { FontSwap } from './fontCheck';
import type { ExportFormat } from './notices';
import type { ExportFile, ExportRequest } from './run';
import { RecordDownload } from '@/features/authorship/RecordDownload';
import { ExportJob, readOwnFonts, saveFile } from './startExport';
import { recordError, recordFeature } from '@/features/usage/usage';

/*
 * The export dialog (plan Task B2): the format, what the file holds, standard manuscript format for a
 * novel, and the share-safe switch. Before a PDF or EPUB that must swap one of the writer's own fonts,
 * the dialog names each swap and asks to continue (plan decision 7). After the file is saved, the dialog
 * lists what the format changes and, for Word, the two steps to Google Docs. A web copy goes to the
 * clipboard from a Copy button, because a browser copies only on the writer's own press.
 */

const FORMATS: { id: ExportFormat; label: string; detail: string; icon: typeof FileText }[] = [
  {
    id: 'docx',
    label: 'Word',
    detail: 'A .docx file to keep editing. It opens in Word, Google Docs, Pages and LibreOffice.',
    icon: FileType,
  },
  {
    id: 'pdf',
    label: 'PDF',
    detail: 'Fixed pages with your fonts, ready to print or send.',
    icon: Printer,
  },
  {
    id: 'epub',
    label: 'EPUB',
    detail: 'An e-book for Apple Books, Kobo and other e-readers.',
    icon: BookOpen,
  },
  {
    id: 'markdown',
    label: 'Markdown',
    detail: 'A .md text file with its marks. It opens in any notes app.',
    icon: FileText,
  },
  {
    id: 'web',
    label: 'Web copy',
    detail: 'Copy it for Substack, Medium, a blog or AO3. Each line break and indent stays.',
    icon: Globe,
  },
];

/** Where a web copy goes (F52). A blog editor takes rich text, and AO3's HTML field takes the HTML. */
type WebTarget = 'blog' | 'ao3';

const WEB_TARGETS: { id: WebTarget; label: string }[] = [
  { id: 'blog', label: 'Substack, Medium or a blog' },
  { id: 'ao3', label: "AO3, in the work's HTML field" },
];

type ScopeChoice = 'item' | 'folder' | 'project' | 'sequence';

type Status =
  | { step: 'choose' }
  | { step: 'working' }
  /** The check before a share-safe export found unmarked or changed names (E5). */
  | { step: 'names'; names: NameCheck; job: ExportJob; ownFonts: string[]; marked: number | null }
  | { step: 'swaps'; swaps: FontSwap[]; job: ExportJob }
  | { step: 'done'; file: ExportFile; format: ExportFormat }
  | { step: 'failed' };

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  items: readonly Item[];
  /** The item open in the editor, for the "this item" and "this chapter" choices. */
  currentItemId: string | null;
  /** The project's people, with the real names and their aliases. */
  people: readonly Person[];
  /** A named order of poems to offer, and to choose first (E2). */
  sequence?: { name: string; itemIds: readonly string[] } | undefined;
  /** The book settings to start with: a PDF of the whole project in book layout, from the Book screen (F51). */
  book?: BookSettings | undefined;
}

function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function OptionCard({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadioGroupPrimitive.Item
      value={value}
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-card)] border border-rule bg-bg p-3 text-left outline-none',
        'focus-visible:ring-2 focus-visible:ring-accent data-[state=checked]:border-accent data-[state=checked]:shadow-[inset_0_0_0_1px_var(--accent)]',
      )}
    >
      {children}
    </RadioGroupPrimitive.Item>
  );
}

const MAX_NAME = 120;
const MAX_CONTACT = 600;

function startingManuscript(project: Project): ManuscriptSettings {
  return (
    project.settings.manuscript ?? {
      on: false,
      name: project.authorName ?? '',
      contact: '',
      typewriter: false,
    }
  );
}

export function ExportDialog({
  open,
  onOpenChange,
  project,
  items,
  currentItemId,
  people,
  sequence,
  book,
}: ExportDialogProps) {
  const ids = useId();
  const template = projectDef(project);
  const current = items.find((i) => i.id === currentItemId && template.editorKind(i.kind) !== null) ?? null;
  const folder = current ? folderOf(items, current.id) : null;
  const [format, setFormat] = useState<ExportFormat>(book ? 'pdf' : 'docx');
  const [webTarget, setWebTarget] = useState<WebTarget>('blog');
  const [scope, setScope] = useState<ScopeChoice>(
    book ? 'project' : sequence ? 'sequence' : current ? 'item' : 'project',
  );
  const [bookLayout, setBookLayout] = useState(book !== undefined);
  const [safe, setSafe] = useState(hasTemplate(project, 'memoir'));
  // A project with AI text, or in Co-writer mode, can add the AI provenance page (F26).
  const offersProvenance = project.aiMode === 'cowriter' || project.settings.aiInsertedAt !== undefined;
  const [provenance, setProvenance] = useState(project.settings.aiInsertedAt !== undefined);
  const [manuscript, setManuscript] = useState<ManuscriptSettings>(() => startingManuscript(project));
  // A Word file can keep tracked changes and comments for an editor (F45). Both start off.
  const [keepChanges, setKeepChanges] = useState(false);
  const [keepComments, setKeepComments] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [status, setStatus] = useState<Status>({ step: 'choose' });
  const [marking, setMarking] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const jobRef = useRef<ExportJob | null>(null);

  // A job left open when the dialog closes stops its worker.
  useEffect(
    () => () => {
      jobRef.current?.close();
    },
    [],
  );

  // Book layout (F51) is for a PDF or an EPUB of the whole project, in place of manuscript format.
  const offersBook = (format === 'pdf' || format === 'epub') && scope === 'project';
  const usesBook = offersBook && bookLayout;
  const offersManuscript =
    hasTemplate(project, 'novel') && (format === 'docx' || format === 'pdf') && !usesBook;
  const usesManuscript = offersManuscript && manuscript.on;

  const closeJob = () => {
    jobRef.current?.close();
    jobRef.current = null;
  };

  const changeOpen = (next: boolean) => {
    if (!next && status.step === 'working') return;
    onOpenChange(next);
    if (!next) {
      closeJob();
      setStatus({ step: 'choose' });
    }
  };

  const scopeOf = (choice: ScopeChoice): ExportScope =>
    choice === 'sequence' && sequence
      ? { kind: 'sequence', name: sequence.name, itemIds: sequence.itemIds }
      : choice === 'item' && current
        ? { kind: 'item', itemId: current.id }
        : choice === 'folder' && folder
          ? { kind: 'folder', itemId: folder.id }
          : { kind: 'project' };

  async function finish(job: ExportJob, chosen: ExportFormat) {
    setStatus({ step: 'working' });
    try {
      const file = await job.make();
      if (chosen !== 'web') saveFile(file);
      recordFeature(`export-${chosen}`);
      setStatus({ step: 'done', file, format: chosen });
    } catch {
      recordError('export-failed');
      setStatus({ step: 'failed' });
    } finally {
      if (jobRef.current === job) closeJob();
    }
  }

  async function exportNow() {
    if (usesManuscript && manuscript.name.trim() === '') {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    setStatus({ step: 'working' });
    const details = {
      name: manuscript.name.trim(),
      contact: manuscript.contact.trim(),
      typewriter: manuscript.typewriter,
    };
    if (offersManuscript) {
      // The details stay with the project, so the next export starts with them.
      void updateProjectSettings(project.id, { manuscript: { ...manuscript, ...details } }).catch(
        () => undefined,
      );
    }
    closeJob();
    try {
      const request: Omit<ExportRequest, 'updates'> = {
        project,
        items: [...items],
        scope: scopeOf(scope),
        format,
        // A failed read of the people fails the export, so a share-safe file never goes without aliases.
        people: await privatePeople(project.id),
        shareSafe: safe,
        ...(usesManuscript ? { manuscript: details } : {}),
        ...(usesBook ? { book: book ?? bookOf(project) } : {}),
        ...(format === 'docx' && (keepChanges || keepComments)
          ? { review: { changes: keepChanges, comments: keepComments } }
          : {}),
        ...(offersProvenance && provenance ? { provenance: { at: clock.now() } } : {}),
      };
      const { job, ownFonts, names } = await ExportJob.start(request);
      jobRef.current = job;
      if (safe && (names.unmarked.length > 0 || names.changed.length > 0)) {
        setStatus({ step: 'names', names, job, ownFonts, marked: null });
        return;
      }
      await checkFonts(job, ownFonts);
    } catch {
      closeJob();
      setStatus({ step: 'failed' });
    }
  }

  async function checkFonts(job: ExportJob, ownFonts: string[]) {
    setStatus({ step: 'working' });
    try {
      const swaps = await job.check(await readOwnFonts(ownFonts));
      if (swaps.length > 0) {
        setStatus({ step: 'swaps', swaps, job });
        return;
      }
      await finish(job, format);
    } catch {
      closeJob();
      setStatus({ step: 'failed' });
    }
  }

  const kindLabel = (item: Item) => lower(template.kindLabel[item.kind] ?? item.kind);
  const formatLabel = FORMATS.find((f) => f.id === format)?.label ?? 'file';

  if (status.step === 'names') {
    const { names, job, ownFonts, marked } = status;
    const total = names.unmarked.reduce((n, c) => n + c.count, 0);
    return (
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>Check the private names</DialogTitle>
          <DialogDescription>
            The export puts an alias in place of each real name below. Nothing with a real name leaves this
            device.
          </DialogDescription>
          <NameCheckLists names={names} marked={marked} what="export" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                closeJob();
                setStatus({ step: 'choose' });
              }}
            >
              Back
            </Button>
            {names.unmarked.length > 0 && marked === null && (
              <Button
                type="button"
                variant="outline"
                disabled={marking}
                onClick={() => {
                  setMarking(true);
                  // The result goes to this check only. Back or a new export in the meantime wins.
                  const show = (marked: number) => {
                    setMarking(false);
                    setStatus((now) => (now.step === 'names' && now.job === job ? { ...now, marked } : now));
                  };
                  privatePeople(project.id)
                    .then((list) => markAllInProject(project.id, list))
                    .then(
                      (result) => {
                        show(result.names);
                      },
                      () => {
                        show(FAILED);
                      },
                    );
                }}
              >
                Mark all {total === 1 ? '1 name' : `${String(total)} names`}
              </Button>
            )}
            <Button
              type="button"
              onClick={() => {
                void checkFonts(job, ownFonts);
              }}
            >
              Export with aliases
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (status.step === 'swaps') {
    const unread = status.swaps.some((s) => s.reason.startsWith('Vlo cannot read'));
    return (
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>Some fonts cannot go in the {formatLabel}</DialogTitle>
          <DialogDescription>
            A {formatLabel} holds its fonts. Vlo puts the closest of its own fonts in place of these:
          </DialogDescription>
          <ul className="grid gap-3">
            {status.swaps.map((swap) => (
              <li key={swap.value} className="grid gap-0.5 rounded-[var(--radius-card)] bg-bg p-3 text-sm">
                <span>
                  <span className="font-medium">{swap.name}</span> becomes{' '}
                  <span className="font-medium">{swap.standInName}</span>
                </span>
                <span className="text-muted">{swap.reason}</span>
              </li>
            ))}
          </ul>
          {unread && (
            <p className="text-sm text-muted">
              In Chrome or Edge, Vlo can read a font installed on this computer after you let it see your
              fonts. Choose Font, then Your fonts, then Allow.
            </p>
          )}
          <p className="text-sm text-muted">Word and Markdown files keep each font name, with no swap.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                closeJob();
                setStatus({ step: 'choose' });
              }}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                void finish(status.job, format);
              }}
            >
              Use these fonts and export
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-xl" aria-busy={status.step === 'working'}>
        {status.step === 'done' ? (
          <>
            {status.format === 'web' ? (
              <>
                <DialogTitle>Your web copy is ready</DialogTitle>
                <DialogDescription>
                  {webTarget === 'ao3'
                    ? 'Copy it, then in AO3 choose HTML above the work text and paste.'
                    : 'Copy it, then paste it into the Substack, Medium or blog editor.'}
                </DialogDescription>
              </>
            ) : (
              <>
                <DialogTitle>Your file is ready</DialogTitle>
                <DialogDescription>
                  Vlo saved <span className="font-medium text-text">{status.file.name}</span> to your
                  downloads.
                </DialogDescription>
              </>
            )}
            {status.file.notices.length > 0 && (
              <section aria-labelledby={`${ids}-notices`} className="grid gap-2">
                <h3 id={`${ids}-notices`} className="text-sm font-semibold">
                  What changes in this format
                </h3>
                <ul className="grid list-disc gap-1 pl-5 text-sm text-muted">
                  {status.file.notices.map((notice) => (
                    <li key={notice}>{notice}</li>
                  ))}
                </ul>
              </section>
            )}
            {status.format === 'docx' && (
              <section
                aria-labelledby={`${ids}-docs`}
                className="grid gap-2 rounded-[var(--radius-card)] bg-bg p-4"
              >
                <h3 id={`${ids}-docs`} className="text-sm font-semibold">
                  Open it in Google Docs
                </h3>
                <ol className="grid list-decimal gap-1 pl-5 text-sm">
                  <li>
                    In{' '}
                    <a href="https://drive.google.com/" target="_blank" rel="noreferrer noopener">
                      Google Drive
                    </a>
                    , choose New, then File upload, and pick {status.file.name}.
                  </li>
                  <li>Open the file, then choose File, then Save as Google Docs.</li>
                </ol>
                <p className="text-xs text-muted">
                  Nothing leaves this device until you upload the file yourself.
                </p>
              </section>
            )}
            {status.format === 'epub' && (
              <p className="text-sm text-muted">
                To read it on a Kindle, send the file with Amazon&apos;s Send to Kindle. Apple Books and Kobo
                open it as it is.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {status.format === 'web' ? (
                <WebCopy file={status.file} target={webTarget} />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    saveFile(status.file);
                  }}
                >
                  Download again
                </Button>
              )}
              <DialogClose asChild>
                <Button type="button">Done</Button>
              </DialogClose>
            </div>
          </>
        ) : (
          <>
            <DialogTitle>Export</DialogTitle>
            <DialogDescription>Make a file of your writing to share, print or keep.</DialogDescription>
            <form
              className="grid gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                void exportNow();
              }}
            >
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-semibold">Format</legend>
                <RadioGroupPrimitive.Root
                  aria-label="Format"
                  value={format}
                  onValueChange={(next) => {
                    setFormat(next as ExportFormat);
                  }}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {FORMATS.map((f) => (
                    <OptionCard key={f.id} value={f.id}>
                      <f.icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-text" />
                      <span className="grid gap-1">
                        <span className="font-medium">{f.label}</span>
                        <span className="text-sm text-muted">{f.detail}</span>
                      </span>
                    </OptionCard>
                  ))}
                </RadioGroupPrimitive.Root>
              </fieldset>

              {format === 'web' && (
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-semibold">Where it goes</legend>
                  <RadioGroup
                    aria-label="Where it goes"
                    value={webTarget}
                    onValueChange={(next) => {
                      setWebTarget(next as WebTarget);
                    }}
                  >
                    {WEB_TARGETS.map((target) => (
                      <label key={target.id} className="flex min-h-11 items-center gap-3 text-sm">
                        <RadioGroupItem value={target.id} />
                        {target.label}
                      </label>
                    ))}
                  </RadioGroup>
                </fieldset>
              )}

              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-semibold">What to export</legend>
                <RadioGroup
                  aria-label="What to export"
                  value={scope}
                  onValueChange={(next) => {
                    setScope(next as ScopeChoice);
                  }}
                >
                  {sequence && (
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <RadioGroupItem value="sequence" />
                      <span className="[overflow-wrap:anywhere]">This order: {sequence.name}</span>
                    </label>
                  )}
                  {current && (
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <RadioGroupItem value="item" />
                      <span className="[overflow-wrap:anywhere]">
                        This {kindLabel(current)}: {current.title}
                      </span>
                    </label>
                  )}
                  {folder && (
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <RadioGroupItem value="folder" />
                      <span className="[overflow-wrap:anywhere]">
                        This {kindLabel(folder)}: {folder.title}
                      </span>
                    </label>
                  )}
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <RadioGroupItem value="project" />
                    <span className="[overflow-wrap:anywhere]">The whole project: {project.title}</span>
                  </label>
                </RadioGroup>
              </fieldset>

              {offersBook && (
                <div className="grid gap-1">
                  <div className="flex items-center gap-3">
                    <Switch
                      id={`${ids}-book`}
                      checked={bookLayout}
                      onCheckedChange={setBookLayout}
                      aria-describedby={`${ids}-book-hint`}
                    />
                    <label htmlFor={`${ids}-book`} className="text-sm font-medium">
                      Book layout
                    </label>
                  </div>
                  <p id={`${ids}-book-hint`} className="pl-14 text-sm text-muted">
                    The trim size, chapter style and front and back matter of the Book screen.
                  </p>
                </div>
              )}

              {offersManuscript && (
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <div className="flex items-center gap-3">
                      <Switch
                        id={`${ids}-ms`}
                        checked={manuscript.on}
                        onCheckedChange={(on) => {
                          setManuscript((m) => ({ ...m, on }));
                        }}
                        aria-describedby={`${ids}-ms-hint`}
                      />
                      <label htmlFor={`${ids}-ms`} className="text-sm font-medium">
                        Standard manuscript format
                      </label>
                    </div>
                    <p id={`${ids}-ms-hint`} className="pl-14 text-sm text-muted">
                      The layout agents and publishers ask for: 12 pt, double spacing, your name and a word
                      count on the first page, and each chapter on a new page.
                    </p>
                  </div>
                  {manuscript.on && (
                    <div className="grid gap-3 pl-14">
                      <div className="grid gap-1.5">
                        <Label htmlFor={`${ids}-ms-name`}>Your name</Label>
                        <Input
                          ref={nameRef}
                          id={`${ids}-ms-name`}
                          value={manuscript.name}
                          maxLength={MAX_NAME}
                          autoComplete="name"
                          aria-invalid={nameError || undefined}
                          aria-describedby={nameError ? `${ids}-ms-name-error` : undefined}
                          onChange={(event) => {
                            setManuscript((m) => ({ ...m, name: event.target.value }));
                            setNameError(false);
                          }}
                        />
                        {nameError && (
                          <p id={`${ids}-ms-name-error`} role="alert" className="text-sm text-accent-text">
                            Type the name for the first page and the page header.
                          </p>
                        )}
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`${ids}-ms-contact`}>Contact lines</Label>
                        <Textarea
                          id={`${ids}-ms-contact`}
                          value={manuscript.contact}
                          maxLength={MAX_CONTACT}
                          rows={3}
                          aria-describedby={`${ids}-ms-contact-hint`}
                          onChange={(event) => {
                            setManuscript((m) => ({ ...m, contact: event.target.value }));
                          }}
                        />
                        <p id={`${ids}-ms-contact-hint`} className="text-sm text-muted">
                          Address, email and phone, one on each line. They stay on this device.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch
                          id={`${ids}-ms-typewriter`}
                          checked={manuscript.typewriter}
                          onCheckedChange={(typewriter) => {
                            setManuscript((m) => ({ ...m, typewriter }));
                          }}
                        />
                        <label htmlFor={`${ids}-ms-typewriter`} className="text-sm">
                          Typewriter font (Courier Prime)
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {format === 'docx' && (
                <div className="grid gap-1">
                  <div className="flex items-center gap-3">
                    <Switch
                      id={`${ids}-changes`}
                      checked={keepChanges}
                      onCheckedChange={setKeepChanges}
                      aria-describedby={`${ids}-review-hint`}
                    />
                    <label htmlFor={`${ids}-changes`} className="text-sm font-medium">
                      Keep my tracked changes
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      id={`${ids}-comments`}
                      checked={keepComments}
                      onCheckedChange={setKeepComments}
                      aria-describedby={`${ids}-review-hint`}
                    />
                    <label htmlFor={`${ids}-comments`} className="text-sm font-medium">
                      Include my comments
                    </label>
                  </div>
                  <p id={`${ids}-review-hint`} className="pl-14 text-sm text-muted">
                    An editor can change the file in Word and send it back. Then choose Search, then Import an
                    editor&rsquo;s changes.
                  </p>
                </div>
              )}

              <div className="grid gap-1">
                <div className="flex items-center gap-3">
                  <Switch
                    id={`${ids}-safe`}
                    checked={safe}
                    onCheckedChange={setSafe}
                    aria-describedby={`${ids}-safe-hint`}
                  />
                  <label htmlFor={`${ids}-safe`} className="text-sm font-medium">
                    Share-safe export
                  </label>
                </div>
                <p id={`${ids}-safe-hint`} className="pl-14 text-sm text-muted">
                  {people.length > 0
                    ? `Swaps each real name for its alias: ${String(people.length)} ${people.length === 1 ? 'person' : 'people'}.`
                    : 'Swaps each real name for its alias. This project has no people yet.'}
                </p>
              </div>

              {offersProvenance && (
                <div className="grid gap-1">
                  <div className="flex items-center gap-3">
                    <Switch
                      id={`${ids}-ai`}
                      checked={provenance}
                      onCheckedChange={setProvenance}
                      aria-describedby={`${ids}-ai-hint`}
                    />
                    <label htmlFor={`${ids}-ai`} className="text-sm font-medium">
                      Add an AI provenance page
                    </label>
                  </div>
                  <p id={`${ids}-ai-hint`} className="pl-14 text-sm text-muted">
                    Adds a last page with the share of AI-marked text in each item, and the AI models.
                  </p>
                </div>
              )}

              {status.step === 'failed' && (
                <p role="alert" className="text-sm text-accent-text">
                  Vlo could not make the file. Check the storage space on this device and try again.
                </p>
              )}

              <RecordDownload project={project} />

              <div className="flex flex-wrap justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={status.step === 'working'}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={status.step === 'working'}>
                  {status.step === 'working'
                    ? format === 'web'
                      ? 'Making the copy'
                      : 'Making the file'
                    : format === 'web'
                      ? 'Make the copy'
                      : 'Export'}
                </Button>
              </div>
              <p aria-live="polite" className="sr-only">
                {status.step === 'working' ? 'Making the file.' : ''}
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The Copy button of a web copy: rich text for a blog editor, or the HTML as text for AO3. */
function WebCopy({ file, target }: { file: ExportFile; target: WebTarget }) {
  const html = new TextDecoder().decode(file.bytes);
  return target === 'ao3' ? (
    <CopyButton label="Copy the HTML" text={html} copied="HTML copied.">
      Copy the HTML
    </CopyButton>
  ) : (
    <CopyButton label="Copy the text" text={file.text ?? ''} html={html} copied="Text copied.">
      Copy the text
    </CopyButton>
  );
}
