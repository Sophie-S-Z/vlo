import { useState } from 'react';
import { MARKETING_URL } from '@/app/links';
import type { Project } from '@/lib/db';
import { DeleteDialog } from './DeleteDialog';
import { NewProjectDialog } from './NewProjectDialog';
import { ProjectCard } from './ProjectCard';
import { RenameDialog } from './RenameDialog';
import { useLibrary } from './useLibrary';

export function LibraryPage() {
  const library = useLibrary();
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  return (
    <section className="grain">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-semibold">Library</h1>
        <NewProjectDialog />
      </div>

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
        <ul aria-label="Projects" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {library.projects.map(({ project, wordCount }) => (
            <ProjectCard
              key={project.id}
              project={project}
              wordCount={wordCount}
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
    </section>
  );
}
