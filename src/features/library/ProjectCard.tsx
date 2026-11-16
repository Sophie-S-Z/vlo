import { ArrowUpRight, CircleAlert, Ellipsis } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { Project, Series } from '@/lib/db';
import { cn } from '@/ui/cn';
import { MotionViewTransition } from '@/ui/MotionViewTransition';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { backupDue, backupLabel } from '@/features/backup/reminder';
import { formatWords } from './format';
import { countUnit } from '@/lib/wordcount';
import { Sigil } from './Sigil';
import { projectDef } from './templates';

export type LibraryLayout = 'grid' | 'list';

interface ProjectCardProps {
  project: Project;
  wordCount: number;
  layout: LibraryLayout;
  /** Place in the list, for the staggered entrance. */
  index: number;
  /** The most recent project spans two columns in the grid. */
  featured: boolean;
  /** The time the Library was drawn, for the backup date. */
  now: number;
  /** The series of the project (F59), if any. */
  series: Series | undefined;
  onBackUp: () => void;
  onRename: () => void;
  onTemplates: () => void;
  onSeries: () => void;
  onDelete: () => void;
}

export function projectTransitionName(id: string): string {
  return `project-${id}`;
}

export function ProjectCard({
  project,
  wordCount,
  layout,
  index,
  featured,
  now,
  series,
  onBackUp,
  onRename,
  onTemplates,
  onSeries,
  onDelete,
}: ProjectCardProps) {
  const list = layout === 'list';
  const wide = featured && !list;
  const due = backupDue(project, now);
  return (
    // The card morphs into the project screen, and between grid and list.
    <MotionViewTransition name={projectTransitionName(project.id)}>
      <li
        style={{ '--i': index } as CSSProperties}
        data-layout={layout}
        className={cn('vlo-folio', wide && 'sm:col-span-2')}
      >
        <div
          className={cn(
            'vlo-folio-core flex h-full',
            list
              ? 'flex-wrap items-center gap-x-5 gap-y-1 py-3.5 pr-16 pl-4'
              : cn('min-h-60 flex-col p-6', wide && 'sm:min-h-72 sm:p-8'),
          )}
        >
          {wide && <Sigil seed={project.id} className="vlo-folio-mark hidden text-accent-text md:block" />}
          <div className={cn('flex items-center gap-3', list && 'order-0')}>
            <Sigil
              seed={project.id}
              className={cn('shrink-0 text-accent-text', list ? 'size-8' : 'size-11')}
            />
            {wide && (
              <span className="vlo-eyebrow rounded-full px-2.5 py-1 ring-1 ring-rule">Most recent</span>
            )}
          </div>
          <p className={cn('vlo-eyebrow', list ? 'order-2' : 'mt-7')}>{projectDef(project).label}</p>
          <h2
            className={cn(
              'font-display leading-[1.08] font-medium tracking-[-0.01em] [overflow-wrap:anywhere]',
              list ? 'order-1 min-w-0 flex-1 basis-56 text-xl' : 'mt-2 mb-8 pr-8 text-[1.75rem]',
              wide && 'sm:text-5xl sm:font-light md:max-w-[calc(100%-12rem)]',
            )}
          >
            <Link
              to={`/p/${project.id}`}
              className="text-text no-underline after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
            >
              {project.title}
            </Link>
          </h2>
          <div
            className={cn(
              list ? 'contents' : 'mt-auto flex items-end justify-between gap-4 border-t border-rule/70 pt-4',
            )}
          >
            <div className={list ? 'contents' : 'grid gap-0.5'}>
              <p
                className={cn(
                  'font-manuscript text-base tabular-nums',
                  list ? 'order-3 text-muted' : 'text-text',
                )}
              >
                {formatWords(wordCount, countUnit(project.settings.language))}
              </p>
              <p
                className={cn(
                  'flex items-center gap-1.5 text-sm',
                  due ? 'text-accent-text' : 'text-muted',
                  list && 'order-4',
                )}
              >
                {due && <CircleAlert aria-hidden="true" strokeWidth={1.5} className="size-4 shrink-0" />}
                {backupLabel(project, now)}
                {due && <span className="sr-only">. Time for a backup.</span>}
              </p>
            </div>
            {!list && (
              <span aria-hidden="true" className="vlo-folio-go">
                <ArrowUpRight strokeWidth={1.25} className="size-4" />
              </span>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Options for ${project.title}`}
              className={cn(
                'absolute right-3 z-10 inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text data-[state=open]:bg-bg data-[state=open]:text-text',
                list ? 'top-1/2 -translate-y-1/2' : 'top-4',
              )}
            >
              <Ellipsis aria-hidden="true" strokeWidth={1.5} className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onBackUp}>Back up</DropdownMenuItem>
              <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
              <DropdownMenuItem onSelect={onTemplates}>Change templates</DropdownMenuItem>
              {series ? (
                <DropdownMenuItem asChild>
                  <Link to={`/series/${series.id}`}>Open {series.title}</Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={onSeries}>Add to a series</DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onDelete} className="text-accent-text">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </li>
    </MotionViewTransition>
  );
}
