import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { Project, Series } from '@/lib/db';
import { countUnit } from '@/lib/wordcount';
import { backupDue, backupLabel } from '@/features/backup/reminder';
import { bookLook } from './book';
import { formatWords } from './format';
import { ProjectMenu, type ProjectActions } from './ProjectMenu';
import { projectDef } from './templates';
import type { LibraryProject } from './useLibrary';
import { preloadProject, useOpenBook } from './useOpenBook';

interface BookStackProps {
  projects: LibraryProject[];
  now: number;
  seriesOf: (project: Project) => Series | undefined;
  actionsFor: (project: Project) => ProjectActions;
}

/**
 * The stack layout of the Library: the books lie flat in one pile, spines to the writer. A book is as long
 * as it is tall on the shelf, and as thick as it is wide there. Hover or focus slides a book out of the
 * pile; a click pulls it out and opens the project. The pile settles from the bottom up.
 */
export function BookStack({ projects, now, seriesOf, actionsFor }: BookStackProps) {
  const { opening, open } = useOpenBook();
  return (
    <ul aria-label="Projects" className="vlo-stack" data-opening={opening !== null || undefined}>
      {projects.map(({ project, wordCount }, index) => {
        const look = bookLook(project, wordCount);
        const due = backupDue(project, now);
        const style = {
          '--i': projects.length - 1 - index,
          '--len': `${String(Math.round(look.height * 1.7))}px`,
          '--thick': `${String(Math.max(34, Math.round(look.width * 0.8)))}px`,
          '--nudge': `${String(look.depth * 3)}px`,
          '--lean': `${String(look.lean / 3)}deg`,
          '--spine': look.spine,
          '--ink': look.ink,
          '--band': look.band,
        } as CSSProperties;
        return (
          <li
            key={project.id}
            className="vlo-slab"
            style={style}
            data-opening={opening === project.id || undefined}
            onPointerEnter={preloadProject}
            onFocus={preloadProject}
          >
            <Link
              to={`/p/${project.id}`}
              className="vlo-slab-hit"
              draggable={false}
              onClick={open(project.id)}
            >
              <span className="vlo-slab-body">
                <span className="vlo-slab-title" data-face={look.face} data-caps={look.caps || undefined}>
                  {project.title}
                </span>
                <span className="vlo-slab-meta">{projectDef(project).label}</span>
                <span className="vlo-slab-meta tabular-nums">
                  {formatWords(wordCount, countUnit(project.settings.language))}
                </span>
              </span>
            </Link>
            <p className="sr-only">
              {backupLabel(project, now)}
              {due && '. Time for a backup.'}
            </p>
            <ProjectMenu
              project={project}
              series={seriesOf(project)}
              {...actionsFor(project)}
              className="vlo-slab-ribbon"
            />
          </li>
        );
      })}
    </ul>
  );
}
