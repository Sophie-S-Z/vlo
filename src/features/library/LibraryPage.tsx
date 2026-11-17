import { ChevronDown, Download, Layers, Library as Shelf, NotebookPen, Search, Upload } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useRef, useState } from 'react';
import { Link } from 'react-router';
import { MARKETING_URL } from '@/app/links';
import { safeStorage } from '@/app/preferences';
import { greetingName, readProfile } from '@/features/account/profile';
import { BackupDialog } from '@/features/backup/BackupDialog';
import { FolderAllow } from '@/features/backup/FolderAllow';
import { ImportBackup, type ImportHandle } from '@/features/backup/ImportBackup';
import { ImportWriting } from '@/features/import/ImportWriting';
import { downloadBackup } from '@/features/backup/downloadBackup';
import { FOLDER_KEY } from '@/features/backup/folderKeys';
import { backupDue, backupLabel, changedSinceBackup } from '@/features/backup/reminder';
import { SafariSteps } from '@/features/backup/SafariSteps';
import { SeriesDialog } from '@/features/series/SeriesDialog';
import { clock } from '@/lib/clock';
import { db, type Project, type Series } from '@/lib/db';
import { countUnit } from '@/lib/wordcount';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { ICON_BUTTON } from '@/ui/tip';
import { Bookshelf } from './Bookshelf';
import { BookStack } from './BookStack';
import { DeleteDialog } from './DeleteDialog';
import { formatWords } from './format';
import { NewProjectDialog } from './NewProjectDialog';
import type { ProjectActions } from './ProjectMenu';
import { RenameDialog } from './RenameDialog';
import { TemplatesDialog } from './TemplatesDialog';
import { projectDef } from './templates';
import { useLibrary, type LibraryProject } from './useLibrary';
import { useDocumentTitle } from '@/app/useDocumentTitle';

type LibraryLayout = 'shelf' | 'stack';

const LAYOUT_KEY = 'vlo:libraryLayout';

/** The Library opens in the layout the writer last picked. A writer who never picked sees the shelf. */
function loadLayout(): LibraryLayout {
  try {
    return safeStorage()?.getItem(LAYOUT_KEY) === 'stack' ? 'stack' : 'shelf';
  } catch {
    return 'shelf';
  }
}

function saveLayout(layout: LibraryLayout) {
  try {
    safeStorage()?.setItem(LAYOUT_KEY, layout);
  } catch {
    // Blocked storage: the layout still changes for this visit.
  }
}

const toggleClass =
  'relative z-10 inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm text-muted transition-colors hover:text-text data-[state=on]:text-text';

const pillClass =
  'inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-sm text-muted ring-1 ring-rule transition-colors hover:text-text data-[state=on]:bg-surface data-[state=on]:text-text data-[state=on]:ring-muted';

/** The search and the kind pills show once the shelf holds this many books. */
const FIND_FROM = 4;

/** "6 volumes · 158,164 words". The total shows only when every project counts the same unit (F38). */
function summary(projects: LibraryProject[]): string {
  const count = projects.length === 1 ? '1 volume' : `${String(projects.length)} volumes`;
  const units = new Set(projects.map(({ project }) => countUnit(project.settings.language)));
  const [unit] = units;
  if (units.size !== 1 || unit === undefined) return count;
  return `${count} · ${formatWords(
    projects.reduce((sum, { wordCount }) => sum + wordCount, 0),
    unit,
  )}`;
}

/** The kinds of work on the shelf, the most common first. */
function kindsOf(projects: LibraryProject[]): string[] {
  const counts = new Map<string, number>();
  for (const { project } of projects) {
    const label = projectDef(project).label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}

export function LibraryPage() {
  useDocumentTitle('Library');
  const library = useLibrary();
  const [layout, setLayout] = useState<LibraryLayout>(loadLayout);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const find = useDeferredValue(query.trim().toLowerCase());
  const backupRef = useRef<ImportHandle>(null);
  const writingRef = useRef<ImportHandle>(null);

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

  const projects = library.status === 'ready' ? library.projects : [];
  // A signed-in writer is greeted by name each time the Library opens (ADR 0011).
  const name = useLiveQuery(async () => {
    const profile = await readProfile().catch(() => null);
    return profile ? greetingName(profile) : '';
  }, []);
  const kinds = kindsOf(projects);
  const shown = projects.filter(({ project }) => {
    const label = projectDef(project).label;
    if (kind !== '' && label !== kind) return false;
    return find === '' || `${project.title} ${label}`.toLowerCase().includes(find);
  });
  const seriesOf = (project: Project) => series.find((s) => s.projectIds.includes(project.id));
  const actionsFor = (project: Project): ProjectActions => ({
    onBackUp: () => {
      setBackingUp(project);
    },
    onRename: () => {
      setRenaming(project);
    },
    onTemplates: () => {
      setChanging(project);
    },
    onSeries: () => {
      setJoining(project);
    },
    onDelete: () => {
      setDeleting(project);
    },
  });

  return (
    <section className="grain">
      <div className="relative isolate grid justify-items-center gap-3 pt-2 text-center">
        <div aria-hidden="true" className="vlo-haze" />
        {/* Hidden for the moment that the name loads, so the greeting does not change under the eye. */}
        <h1
          className={cn(
            'vlo-caret max-w-4xl font-manuscript text-5xl leading-[1.05] font-light tracking-[-0.02em] text-balance italic sm:text-6xl',
            name === undefined && 'invisible',
          )}
        >
          {name ? (
            <>
              Welcome back to your library, <span className="whitespace-nowrap">{name}</span>
            </>
          ) : (
            'Welcome to your library'
          )}
        </h1>
        {projects.length > 0 && <p className="text-sm text-muted tabular-nums">{summary(projects)}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {/* Three quiet ways in, behind one menu (Phase 17 decision S4), then the main action. */}
          <ImportBackup ref={backupRef} trigger={false} />
          <ImportWriting ref={writingRef} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="rounded-full">
                <Upload aria-hidden="true" strokeWidth={1.5} className="size-4" />
                Import
                <ChevronDown aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-72">
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
                <span className="text-xs text-muted">
                  Word, PDF, EPUB, RTF, Markdown, text, scripts or Scrivener
                </span>
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

      {projects.length > 0 && (
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] justify-items-center gap-4">
          {projects.length >= FIND_FROM && (
            <label className="vlo-find flex w-full max-w-xl items-center gap-3 pr-7 pb-2">
              <Search aria-hidden="true" strokeWidth={1.25} className="size-4 shrink-0 text-muted" />
              <span className="sr-only">Find a project</span>
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                placeholder="What are you looking for?"
                className="min-w-0 flex-1 bg-transparent text-center font-manuscript text-lg italic outline-none placeholder:text-muted sm:text-xl"
              />
            </label>
          )}
          <div className="flex w-full flex-wrap items-center justify-center gap-3">
            {projects.length >= FIND_FROM && kinds.length > 1 && (
              <ToggleGroup.Root
                type="single"
                aria-label="Kind of work"
                value={kind === '' ? 'all' : kind}
                onValueChange={(value) => {
                  if (value !== '') setKind(value === 'all' ? '' : value);
                }}
                className="flex max-w-full gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]"
              >
                <ToggleGroup.Item value="all" className={pillClass}>
                  All
                </ToggleGroup.Item>
                {kinds.map((label) => (
                  <ToggleGroup.Item key={label} value={label} className={pillClass}>
                    {label}
                  </ToggleGroup.Item>
                ))}
              </ToggleGroup.Root>
            )}
            <ToggleGroup.Root
              type="single"
              aria-label="Layout"
              value={layout}
              data-layout={layout}
              onValueChange={(value) => {
                if (value !== 'shelf' && value !== 'stack') return;
                saveLayout(value);
                setLayout(value);
              }}
              className="vlo-toggle relative grid grid-cols-2 rounded-full p-0.5 ring-1 ring-rule"
            >
              <ToggleGroup.Item value="shelf" className={toggleClass}>
                <Shelf aria-hidden="true" strokeWidth={1.5} className="size-4" />
                Shelf
              </ToggleGroup.Item>
              <ToggleGroup.Item value="stack" className={toggleClass}>
                <Layers aria-hidden="true" strokeWidth={1.5} className="size-4" />
                Stack
              </ToggleGroup.Item>
            </ToggleGroup.Root>
          </div>
        </div>
      )}

      {projects.length > 0 && shown.length === 0 && (
        <p role="status" className="mt-16 text-center font-manuscript text-xl text-muted italic">
          No project matches.
        </p>
      )}

      {shown.length > 0 && layout === 'shelf' && (
        <div className="mt-2">
          <Bookshelf projects={shown} now={now} seriesOf={seriesOf} actionsFor={actionsFor} />
        </div>
      )}

      {shown.length > 0 && layout === 'stack' && (
        <div className="mt-12">
          <BookStack projects={shown} now={now} seriesOf={seriesOf} actionsFor={actionsFor} />
        </div>
      )}

      {due.length > 0 && (
        <section aria-labelledby="backup-reminder" className="vlo-notice mt-12 overflow-hidden rounded-2xl">
          <div className="grid gap-1 px-5 pt-5 pb-4 sm:px-6">
            <h2 id="backup-reminder" className="font-display text-xl font-medium">
              Time for a backup
            </h2>
            <p className="max-w-prose text-sm text-muted">
              {due.length === 1 ? 'This project has' : 'These projects have'} work that is not in a backup
              file. Browsers can clear the data of a website, and a backup file keeps a copy of your work.
            </p>
          </div>
          <ul className="vlo-notice-rows">
            {due.map(({ project }) => (
              <li key={project.id} className="flex items-center gap-4 px-5 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{project.title}</p>
                  <p className="text-xs text-muted">
                    {project.lastBackupAt !== undefined && changedSinceBackup(project)
                      ? 'Changed since the last backup'
                      : backupLabel(project, now)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-9 shrink-0 gap-1.5 rounded-full px-3.5"
                  aria-label={`Back up ${project.title}`}
                  disabled={quick.busy !== null}
                  onClick={() => void backUpNow(project)}
                >
                  <Download aria-hidden="true" strokeWidth={1.75} className="size-4" />
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
        <div className="mt-2">
          {/* An empty shelf waits for the first book. */}
          <div aria-hidden="true" className="vlo-shelf-wrap">
            <div className="vlo-shelf" />
            <div className="vlo-shelf-plank" />
          </div>
          <div className="mt-4 grid justify-items-center gap-3 px-6 text-center">
            <p className="font-display text-3xl font-light tracking-[-0.01em]">
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

      {series.length > 0 && (
        <section aria-labelledby="library-series" className="mt-16 grid gap-4">
          <h2 id="library-series" className="font-display text-3xl font-light tracking-[-0.01em]">
            Series
          </h2>
          <ul className="divide-y divide-rule border-y border-rule">
            {series.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4">
                <Link
                  to={`/series/${s.id}`}
                  className="min-w-0 flex-1 font-display text-xl font-medium text-text no-underline [overflow-wrap:anywhere] hover:underline"
                >
                  {s.title}
                </Link>
                <span className="text-sm text-muted tabular-nums">
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
