import { Ellipsis } from 'lucide-react';
import { Link } from 'react-router';
import type { Project, Series } from '@/lib/db';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';

export interface ProjectActions {
  onBackUp: () => void;
  onRename: () => void;
  onTemplates: () => void;
  onSeries: () => void;
  onDelete: () => void;
}

/** The options of one project, on its book and on its row in the list. */
export function ProjectMenu({
  project,
  series,
  className,
  onBackUp,
  onRename,
  onTemplates,
  onSeries,
  onDelete,
}: ProjectActions & { project: Project; series: Series | undefined; className: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Options for ${project.title}`}
        data-tip="Options"
        className={`vlo-tip ${className}`}
      >
        <Ellipsis aria-hidden="true" strokeWidth={1.5} className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
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
  );
}
