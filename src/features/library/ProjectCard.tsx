import { Ellipsis } from 'lucide-react';
import { ViewTransition } from 'react';
import { Link } from 'react-router';
import type { Project } from '@/lib/db';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { formatWords } from './format';
import { TEMPLATES } from './templates';

interface ProjectCardProps {
  project: Project;
  wordCount: number;
  onRename: () => void;
  onDelete: () => void;
}

export function projectTransitionName(id: string): string {
  return `project-${id}`;
}

export function ProjectCard({ project, wordCount, onRename, onDelete }: ProjectCardProps) {
  return (
    <ViewTransition name={projectTransitionName(project.id)} update="none">
      <li className="group relative flex min-h-40 flex-col rounded-[var(--radius-card)] border border-rule bg-surface p-5 transition-shadow hover:shadow-[var(--shadow-hover)] focus-within:shadow-[var(--shadow-hover)]">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          {TEMPLATES[project.template].label}
        </p>
        <h2 className="mt-2 pr-10 font-display text-2xl leading-tight font-semibold [overflow-wrap:anywhere]">
          <Link
            to={`/p/${project.id}`}
            className="text-text no-underline after:absolute after:inset-0 after:rounded-[var(--radius-card)] after:content-['']"
          >
            {project.title}
          </Link>
        </h2>
        <p className="mt-auto pt-6 font-mono text-sm text-muted">{formatWords(wordCount)}</p>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Options for ${project.title}`}
            className="absolute top-3 right-3 z-10 inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-text"
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
    </ViewTransition>
  );
}
