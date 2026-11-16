import { CircleAlert } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { Project, Series } from '@/lib/db';
import { countUnit } from '@/lib/wordcount';
import { MotionViewTransition } from '@/ui/MotionViewTransition';
import { backupDue, backupLabel } from '@/features/backup/reminder';
import { formatWords } from './format';
import { ProjectMenu, type ProjectActions } from './ProjectMenu';
import { Sigil } from './Sigil';
import { projectDef } from './templates';

export type LibraryLayout = 'shelf' | 'list';

export function projectTransitionName(id: string): string {
  return `project-${id}`;
}

interface ProjectCardProps extends ProjectActions {
  project: Project;
  wordCount: number;
  /** Place in the list, for the staggered entrance. */
  index: number;
  /** The time the Library was drawn, for the backup date. */
  now: number;
  /** The series of the project (F59), if any. */
  series: Series | undefined;
}

/** One project as a ruled row of the list layout. The shelf layout draws a book instead (BookSpine). */
export function ProjectCard({ project, wordCount, index, now, series, ...actions }: ProjectCardProps) {
  const due = backupDue(project, now);
  return (
    // The row morphs into the project screen, and between the shelf and the list.
    <MotionViewTransition name={projectTransitionName(project.id)}>
      <li style={{ '--i': index } as CSSProperties} className="vlo-row relative">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl py-3.5 pr-16 pl-4">
          <Sigil seed={project.id} className="size-8 shrink-0 text-accent-text" />
          <h2 className="order-1 min-w-0 flex-1 basis-56 font-display text-xl leading-tight font-medium [overflow-wrap:anywhere]">
            <Link
              to={`/p/${project.id}`}
              className="text-text no-underline after:absolute after:inset-0 after:rounded-xl after:content-['']"
            >
              {project.title}
            </Link>
          </h2>
          <p className="vlo-eyebrow order-2">{projectDef(project).label}</p>
          <p className="order-3 font-manuscript text-base text-muted tabular-nums">
            {formatWords(wordCount, countUnit(project.settings.language))}
          </p>
          <p
            className={`order-4 flex items-center gap-1.5 text-sm ${due ? 'text-accent-text' : 'text-muted'}`}
          >
            {due && <CircleAlert aria-hidden="true" strokeWidth={1.5} className="size-4 shrink-0" />}
            {backupLabel(project, now)}
            {due && <span className="sr-only">. Time for a backup.</span>}
          </p>
        </div>
        <ProjectMenu
          project={project}
          series={series}
          {...actions}
          className="absolute top-1/2 right-3 z-10 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-text data-[state=open]:bg-surface data-[state=open]:text-text"
        />
      </li>
    </MotionViewTransition>
  );
}
