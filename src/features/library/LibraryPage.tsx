import { LayoutGrid, List } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import { startTransition, useState } from 'react';
import { MARKETING_URL } from '@/app/links';
import { safeStorage } from '@/app/preferences';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { BackupDialog } from '@/features/backup/BackupDialog';
import { ImportBackup } from '@/features/backup/ImportBackup';
import { backupDue } from '@/features/backup/reminder';
import { SafariSteps } from '@/features/backup/SafariSteps';
import { clock } from '@/lib/clock';
import type { Project } from '@/lib/db';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { DeleteDialog } from './DeleteDialog';
import { NewProjectDialog } from './NewProjectDialog';
import { ProjectCard, type LibraryLayout } from './ProjectCard';
import { RenameDialog } from './RenameDialog';
import { useLibrary } from './useLibrary';
import { useDocumentTitle } from '@/app/useDocumentTitle';

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
  const [backingUp, setBackingUp] = useState<Project | null>(null);
  // The time the Library opened, for the backup dates on the cards.
  const [now] = useState(() => clock.now());
  const due =
    library.status === 'ready' ? library.projects.filter(({ project }) => backupDue(project, now)) : [];

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
          <ImportBackup />
          <NewProjectDialog />
        </div>
      </div>

      {due.length > 0 && (
        <section
          aria-labelledby="backup-reminder"
          className="mt-8 grid gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-5"
        >
          <h2 id="backup-reminder" className="font-display text-xl font-semibold">
            Time for a backup
          </h2>
          <p className="text-sm text-muted">
            {due.length === 1 ? 'This project has' : 'These projects have'} no backup from the last 7 days.
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
                  onClick={() => {
                    setBackingUp(project);
                  }}
                >
                  Back up
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
              onDelete={() => {
                setDeleting(project);
              }}
            />
          ))}
        </ul>
      )}

      <RenameDialog
        project={renaming}
        onClose={() => {
          setRenaming(null);
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
