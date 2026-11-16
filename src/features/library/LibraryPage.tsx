import { ChevronDown, Hourglass, LayoutGrid, List, NotebookPen, Upload } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { startTransition, useRef, useState, type PointerEvent } from 'react';
import { Link } from 'react-router';
import { MARKETING_URL } from '@/app/links';
import { safeStorage } from '@/app/preferences';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { BackupDialog } from '@/features/backup/BackupDialog';
import { FolderAllow } from '@/features/backup/FolderAllow';
import { ImportBackup, type ImportHandle } from '@/features/backup/ImportBackup';
import { ImportWriting } from '@/features/import/ImportWriting';
import { downloadBackup } from '@/features/backup/downloadBackup';
import { FOLDER_KEY } from '@/features/backup/folderKeys';
import { backupDue, changedSinceBackup } from '@/features/backup/reminder';
import { SafariSteps } from '@/features/backup/SafariSteps';
import { SeriesDialog } from '@/features/series/SeriesDialog';
import { clock } from '@/lib/clock';
import { db, type Project, type Series } from '@/lib/db';
import { countUnit } from '@/lib/wordcount';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { ICON_BUTTON } from '@/ui/tip';
import { DeleteDialog } from './DeleteDialog';
import { formatWords } from './format';
import { NewProjectDialog } from './NewProjectDialog';
import { ProjectCard, type LibraryLayout } from './ProjectCard';
import { RenameDialog } from './RenameDialog';
import { TemplatesDialog } from './TemplatesDialog';
import { Sigil } from './Sigil';
import { useLibrary, type LibraryProject } from './useLibrary';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { WeeklyReport } from '@/features/usage/WeeklyReport';

const LAYOUT_KEY = 'vlo:libraryLayout';

function loadLayout(): LibraryLayout {
  try {
    return safeStorage()?.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

const toggleClass =
  'relative z-10 inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm text-muted transition-colors hover:text-text data-[state=on]:text-text';

/** "6 projects · 158,164 words". The total shows only when every project counts the same unit (F38). */
function summary(projects: LibraryProject[]): string {
  const count = projects.length === 1 ? '1 project' : `${String(projects.length)} projects`;
  const units = new Set(projects.map(({ project }) => countUnit(project.settings.language)));
  const [unit] = units;
  if (units.size !== 1 || unit === undefined) return count;
  return `${count} · ${formatWords(
    projects.reduce((sum, { wordCount }) => sum + wordCount, 0),
    unit,
  )}`;
}

/** The rim light of a card follows a mouse. Touch and pen leave it at rest. */
function followPointer(event: PointerEvent<HTMLUListElement>) {
  if (event.pointerType !== 'mouse' || !(event.target instanceof Element)) return;
  const folio = event.target.closest<HTMLElement>('.vlo-folio');
  if (!folio) return;
  const box = folio.getBoundingClientRect();
  folio.style.setProperty('--mx', `${String(event.clientX - box.left)}px`);
  folio.style.setProperty('--my', `${String(event.clientY - box.top)}px`);
}

export function LibraryPage() {
  useDocumentTitle('Library');
  const library = useLibrary();
  const motion = useMotionAllowed();
  const [layout, setLayout] = useState<LibraryLayout>(loadLayout);
  const backupRef = useRef<ImportHandle>(null);
  const writingRef = useRef<ImportHandle>(null);

  const changeLayout = (next: LibraryLayout) => {
    try {
      safeStorage()?.setItem(LAYOUT_KEY, next);
    } catch {
      // Blocked storage: the layout still changes for this visit.
    }
    // In a transition, each card morphs to its new place. With motion off, the change is instant.
    if (motion) {
      startTransition(() => {
        setLayout(next);
      });
    } else {
      setLayout(next);
    }
  };
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [changing, setChanging] = useState<Project | null>(null);
  const [backingUp, setBackingUp] = useState<Project | null>(null);
  const [joining, setJoining] = useState<Project | null>(null);
  const series = useLiveQuery(
    async () => (await db.series.toArray()).sort((a, b) => a.title.localeCompare(b.title)),
    [],
    [] as Series[],
  );
  // The time the Library opened, for the backup dates on the cards.
  const [now] = useState(() => clock.now());
  // With folder save on, the folder keeps the copies, so the Library asks only after 7 days. Else it
  // asks after each change, and one press makes the backup (roadmap F32).
  const folderOn = useLiveQuery(
    async () => (await db.appMeta.get(FOLDER_KEY).catch(() => undefined)) !== undefined,
    [],
    true,
  );
  const due =
    library.status === 'ready'
      ? library.projects.filter(
          ({ project }) => backupDue(project, now) || (!folderOn && changedSinceBackup(project)),
        )
      : [];
  const [quick, setQuick] = useState<{ busy: string | null; message: string }>({ busy: null, message: '' });
  const backUpNow = async (project: Project) => {
    setQuick({ busy: project.id, message: 'Making the backup.' });
    try {
      const file = await downloadBackup(project.id, { music: false });
      setQuick({ busy: null, message: `Vlo saved ${file.name} to your downloads.` });
    } catch {
      setQuick({ busy: null, message: 'Vlo could not make the backup. Reload Vlo and try again.' });
    }
  };

  return (
    <section className="grain">
      <div className="vlo-masthead grid gap-5">
        <Sigil
          seed="Vlo Library"
          className="vlo-orrery pointer-events-none absolute -top-4 right-2 hidden size-52 text-accent-text opacity-20 md:block"
        />
        <p className="vlo-eyebrow flex items-center gap-2.5">
          <span aria-hidden="true" className="vlo-diamond" />
          Your private library
        </p>
        <h1 className="font-display text-6xl leading-[0.95] font-light tracking-[-0.03em] [font-variation-settings:'SOFT'_100,'WONK'_1] sm:text-8xl">
          Library
        </h1>
        {library.status === 'ready' && library.projects.length > 0 && (
          <p className="font-manuscript text-lg text-muted italic tabular-nums">
            {summary(library.projects)}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {library.status === 'ready' && library.projects.length > 0 ? (
            <ToggleGroup.Root
              type="single"
              aria-label="Layout"
              value={layout}
              data-layout={layout}
              onValueChange={(value) => {
                if (value === 'grid' || value === 'list') changeLayout(value);
              }}
              className="vlo-toggle relative grid grid-cols-2 rounded-full p-0.5 ring-1 ring-rule"
            >
              <ToggleGroup.Item value="grid" className={toggleClass}>
                <LayoutGrid aria-hidden="true" strokeWidth={1.5} className="size-4" />
                Grid
              </ToggleGroup.Item>
              <ToggleGroup.Item value="list" className={toggleClass}>
                <List aria-hidden="true" strokeWidth={1.5} className="size-4" />
                List
              </ToggleGroup.Item>
            </ToggleGroup.Root>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {/* Three quiet ways in, behind one menu (Phase 17 decision S4), then the main action. */}
            <ImportBackup ref={backupRef} trigger={false} />
            <ImportWriting ref={writingRef} trigger={false} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="rounded-full">
                  <Upload aria-hidden="true" strokeWidth={1.5} className="size-4" />
                  Import
                  <ChevronDown aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem
                  className="grid gap-0.5"
                  onSelect={() => {
                    backupRef.current?.open();
                  }}
                >
                  <span className="font-medium">Import backup</span>
                  <span className="text-xs text-muted">A .vlo.zip file that Vlo made</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="grid gap-0.5"
                  onSelect={() => {
                    writingRef.current?.open();
                  }}
                >
                  <span className="font-medium">Import writing</span>
                  <span className="text-xs text-muted">Word, Markdown, Fountain, text or Scrivener</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button asChild variant="ghost" className={cn(ICON_BUTTON, 'rounded-full')} data-tip="Quick note">
              <Link to="/capture">
                <NotebookPen aria-hidden="true" strokeWidth={1.5} className="size-4" />
                <span className="sr-only">Quick note</span>
              </Link>
            </Button>
            <NewProjectDialog />
          </div>
        </div>
        <div aria-hidden="true" className="vlo-rule mt-4">
          <span className="vlo-diamond" />
        </div>
      </div>

      <WeeklyReport />

      {due.length > 0 && (
        <section
          aria-labelledby="backup-reminder"
          className="vlo-notice mt-10 grid gap-4 rounded-[1.25rem] p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <Hourglass
              aria-hidden="true"
              strokeWidth={1.25}
              className="mt-1 size-5 shrink-0 text-accent-text"
            />
            <div className="grid gap-1">
              <h2 id="backup-reminder" className="font-display text-xl font-medium">
                Time for a backup
              </h2>
              <p className="text-sm text-muted">
                {due.length === 1 ? 'This project has' : 'These projects have'} work that is not in a backup
                file. Browsers can clear the data of a website, and a backup file keeps a copy of your work.
              </p>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2 sm:pl-8">
            {due.map(({ project }) => (
              <li
                key={project.id}
                className="flex max-w-full min-w-0 items-center gap-3 rounded-full bg-surface py-1 pr-1 pl-4 ring-1 ring-rule"
              >
                <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{project.title}</span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-9 shrink-0 rounded-full px-3.5"
                  aria-label={`Back up ${project.title}`}
                  disabled={quick.busy !== null}
                  onClick={() => void backUpNow(project)}
                >
                  {quick.busy === project.id ? 'Backing up…' : 'Back up'}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p
        role="status"
        className={quick.busy === null && quick.message ? 'mt-4 text-sm text-muted' : 'sr-only'}
      >
        {quick.message}
      </p>

      <FolderAllow />
      <SafariSteps closable className="mt-8" />

      {library.status === 'error' && (
        <div role="alert" className="mt-8 rounded-[var(--radius-card)] border border-rule bg-surface p-6">
          <p className="font-manuscript text-xl">Vlo cannot open its storage in this browser.</p>
          <p className="mt-3 text-muted">
            The browser may block site data, or a private window may limit it. Allow site data for Vlo, then
            reload.
          </p>
        </div>
      )}

      {library.status === 'ready' && library.projects.length === 0 && (
        <div className="vlo-folio mt-10">
          <div className="vlo-folio-core grid justify-items-center gap-3 px-6 py-14 text-center">
            <Sigil seed="A first page" className="size-20 text-accent-text opacity-80" />
            <p className="mt-4 font-display text-3xl font-light tracking-[-0.01em]">
              Your projects will live here, on this device.
            </p>
            <p className="max-w-md text-muted">
              Vlo keeps every manuscript in this browser. No Vlo server receives your text.
            </p>
            <p className="mt-2 text-sm">
              <a href={MARKETING_URL} rel="noreferrer">
                Read more about Vlo
              </a>
            </p>
          </div>
        </div>
      )}

      {library.status === 'ready' && library.projects.length > 0 && (
        <ul
          aria-label="Projects"
          onPointerMove={followPointer}
          className={cn(
            'vlo-stagger mt-10 grid',
            layout === 'grid' ? 'gap-5 sm:grid-cols-2 lg:grid-cols-3' : 'divide-y divide-rule/70',
          )}
        >
          {library.projects.map(({ project, wordCount }, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              wordCount={wordCount}
              layout={layout}
              index={index}
              featured={index === 0}
              now={now}
              onBackUp={() => {
                setBackingUp(project);
              }}
              onRename={() => {
                setRenaming(project);
              }}
              series={series.find((s) => s.projectIds.includes(project.id))}
              onTemplates={() => {
                setChanging(project);
              }}
              onSeries={() => {
                setJoining(project);
              }}
              onDelete={() => {
                setDeleting(project);
              }}
            />
          ))}
        </ul>
      )}

      {series.length > 0 && (
        <section aria-labelledby="library-series" className="mt-16 grid gap-4">
          <h2 id="library-series" className="font-display text-3xl font-light tracking-[-0.01em]">
            Series
          </h2>
          <ul className="divide-y divide-rule border-y border-rule">
            {series.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4">
                <Sigil seed={s.id} className="size-7 shrink-0 text-accent-text" />
                <Link
                  to={`/series/${s.id}`}
                  className="min-w-0 flex-1 font-display text-xl font-medium text-text no-underline [overflow-wrap:anywhere] hover:underline"
                >
                  {s.title}
                </Link>
                <span className="vlo-eyebrow">
                  {s.projectIds.length === 1 ? '1 book' : `${String(s.projectIds.length)} books`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SeriesDialog
        project={joining}
        series={series}
        onClose={() => {
          setJoining(null);
        }}
      />
      <RenameDialog
        project={renaming}
        onClose={() => {
          setRenaming(null);
        }}
      />
      <TemplatesDialog
        project={changing}
        onClose={() => {
          setChanging(null);
        }}
      />
      <DeleteDialog
        project={deleting}
        onClose={() => {
          setDeleting(null);
        }}
      />
      <BackupDialog
        project={backingUp}
        onClose={() => {
          setBackingUp(null);
        }}
      />
    </section>
  );
}
