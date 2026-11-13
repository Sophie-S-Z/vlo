import { ChevronDown, LayoutGrid, List, NotebookPen, Upload } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { startTransition, useRef, useState } from 'react';
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
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { ICON_BUTTON } from '@/ui/tip';
import { DeleteDialog } from './DeleteDialog';
import { NewProjectDialog } from './NewProjectDialog';
import { ProjectCard, type LibraryLayout } from './ProjectCard';
import { RenameDialog } from './RenameDialog';
import { TemplatesDialog } from './TemplatesDialog';
import { useLibrary } from './useLibrary';
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
  'inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted hover:text-text data-[state=on]:bg-surface data-[state=on]:text-text data-[state=on]:shadow-sm';

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-semibold">Library</h1>
        <div className="flex flex-wrap items-center gap-3">
          {library.status === 'ready' && library.projects.length > 0 && (
            <ToggleGroup.Root
              type="single"
              aria-label="Layout"
              value={layout}
              onValueChange={(value) => {
                if (value === 'grid' || value === 'list') changeLayout(value);
              }}
              className="inline-flex rounded-lg border border-rule bg-bg p-0.5"
            >
              <ToggleGroup.Item value="grid" className={toggleClass}>
                <LayoutGrid aria-hidden="true" className="size-4" />
                Grid
              </ToggleGroup.Item>
              <ToggleGroup.Item value="list" className={toggleClass}>
                <List aria-hidden="true" className="size-4" />
                List
              </ToggleGroup.Item>
            </ToggleGroup.Root>
          )}
          {/* Three quiet ways in, behind one menu (Phase 17 decision S4), then the main action. */}
          <ImportBackup ref={backupRef} trigger={false} />
          <ImportWriting ref={writingRef} trigger={false} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost">
                <Upload aria-hidden="true" className="size-4" />
                Import
                <ChevronDown aria-hidden="true" className="size-3.5" />
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
          <Button asChild variant="ghost" className={ICON_BUTTON} data-tip="Quick note">
            <Link to="/capture">
              <NotebookPen aria-hidden="true" className="size-4" />
              <span className="sr-only">Quick note</span>
            </Link>
          </Button>
          <NewProjectDialog />
        </div>
      </div>

      <WeeklyReport />

      {due.length > 0 && (
        <section
          aria-labelledby="backup-reminder"
          className="mt-8 grid gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-5"
        >
          <h2 id="backup-reminder" className="font-display text-xl font-semibold">
            Time for a backup
          </h2>
          <p className="text-sm text-muted">
            {due.length === 1 ? 'This project has' : 'These projects have'} work that is not in a backup file.
            Browsers can clear the data of a website, and a backup file keeps a copy of your work.
          </p>
          <ul className="grid gap-2">
            {due.map(({ project }) => (
              <li key={project.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="font-medium [overflow-wrap:anywhere]">{project.title}</span>
                <Button
                  type="button"
                  variant="outline"
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
        <div className="mt-8 rounded-[var(--radius-card)] border border-rule bg-surface p-6">
          <p className="font-manuscript text-xl">Your projects will live here, on this device.</p>
          <p className="mt-3 text-muted">
            Vlo keeps every manuscript in this browser. No Vlo server receives your text.
          </p>
          <p className="mt-4 text-sm">
            <a href={MARKETING_URL} rel="noreferrer">
              Read more about Vlo
            </a>
          </p>
        </div>
      )}

      {library.status === 'ready' && library.projects.length > 0 && (
        <ul
          aria-label="Projects"
          className={cn(
            'vlo-stagger mt-8 grid',
            layout === 'grid' ? 'gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'gap-2',
          )}
        >
          {library.projects.map(({ project, wordCount }, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              wordCount={wordCount}
              layout={layout}
              index={index}
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
        <section aria-labelledby="library-series" className="mt-10 grid gap-3">
          <h2 id="library-series" className="font-display text-2xl font-semibold">
            Series
          </h2>
          <ul className="grid gap-2">
            {series.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline gap-x-3">
                <Link
                  to={`/series/${s.id}`}
                  className="font-display text-lg font-semibold [overflow-wrap:anywhere]"
                >
                  {s.title}
                </Link>
                <span className="text-sm text-muted">
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
