import { Ellipsis } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { Project } from '@/lib/db';
import { cn } from '@/ui/cn';
import { MotionViewTransition } from '@/ui/MotionViewTransition';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { formatWords } from './format';
import { TEMPLATES } from './templates';

export type LibraryLayout = 'grid' | 'list';

interface ProjectCardProps {
  project: Project;
  wordCount: number;
  layout: LibraryLayout;
  /** Place in the list, for the staggered entrance. */
  index: number;
  onRename: () => void;
  onDelete: () => void;
}

export function projectTransitionName(id: string): string {
  return `project-${id}`;
}

export function ProjectCard({ project, wordCount, layout, index, onRename, onDelete }: ProjectCardProps) {
  const list = layout === 'list';
  return (
    // The card morphs into the project screen, and between grid and list.
    <MotionViewTransition name={projectTransitionName(project.id)}>
      <li
        style={{ '--i': index } as CSSProperties}
        className={cn(
          'group relative flex rounded-[var(--radius-card)] border border-rule bg-surface transition-shadow hover:shadow-[var(--shadow-hover)] focus-within:shadow-[var(--shadow-hover)]',
          list ? 'flex-wrap items-baseline gap-x-4 gap-y-1 py-3 pr-14 pl-5' : 'min-h-40 flex-col p-5',
        )}
      >
        <p className={cn('text-xs font-medium tracking-wide text-muted uppercase', list && 'order-2')}>
          {TEMPLATES[project.template].label}
        </p>
        <h2
          className={cn(
            'font-display leading-tight font-semibold [overflow-wrap:anywhere]',
            list ? 'order-1 min-w-0 flex-1 basis-60 text-xl' : 'mt-2 pr-10 text-2xl',
          )}
        >
          <Link
            to={`/p/${project.id}`}
            className="text-text no-underline after:absolute after:inset-0 after:rounded-[var(--radius-card)] after:content-['']"
          >
            {project.title}
          </Link>
        </h2>
        <p className={cn('font-mono text-sm text-muted', list ? 'order-3' : 'mt-auto pt-6')}>
          {formatWords(wordCount)}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Options for ${project.title}`}
            className={cn(
              'absolute right-3 z-10 inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-text',
              list ? 'top-1/2 -translate-y-1/2' : 'top-3',
            )}
          >
            <Ellipsis aria-hidden="true" className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete} className="text-accent-text">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    </MotionViewTransition>
  );
}
