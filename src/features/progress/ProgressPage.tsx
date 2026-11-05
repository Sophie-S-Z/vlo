import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { STATUS_LABEL } from '@/features/binder/BinderItem';
import { flattenTree } from '@/features/binder/tree';
import { TEMPLATES } from '@/features/library/templates';
import { useProject } from '@/features/project/useProject';
import { ViewTabs } from '@/features/project/ViewTabs';
import { cn } from '@/ui/cn';
import { CountUp } from './CountUp';
import { Goals } from './Goals';
import { useSessionCount } from './progress';
import { STATUSES, TILE_TONE, Tiles } from './Tiles';

/*
 * Progress (spec 8.4, plan Task C9, F21). Every template has it: the total words and sessions as counting
 * numbers, a map of tiles by status, and the daily goal and streak, which are off by default.
 */

export function ProgressPage() {
  const { projectId = '' } = useParams();
  const state = useProject(projectId);
  const sessions = useSessionCount(projectId);
  // Binder order: each parent, then its children. Kept between renders, so the tile targets are too.
  const items = useMemo(
    () => (state.status === 'ready' ? flattenTree(state.items).map((node) => node.item) : []),
    [state],
  );

  useDocumentTitle(
    state.status === 'ready'
      ? `${state.project.title}, Progress`
      : state.status === 'missing'
        ? 'Project not found'
        : 'Progress',
  );

  if (state.status === 'loading' || sessions === undefined) return null;

  if (state.status === 'missing') {
    return (
      <section>
        <h1 className="font-display text-4xl font-semibold">Project not found</h1>
        <p className="mt-4 text-muted">
          This device has no project at this address. It may have been deleted.
        </p>
        <p className="mt-6">
          <Link to="/">Go to the Library</Link>
        </p>
      </section>
    );
  }

  const { project } = state;
  const template = TEMPLATES[project.template];
  const words = items.reduce((sum, item) => sum + item.wordCount, 0);
  const byStatus = new Map(STATUSES.map((s) => [s, items.filter((i) => i.status === s).length]));

  return (
    <section className="grid gap-10">
      <header className="min-w-0">
        <p className="text-sm text-muted">{template.label}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold [overflow-wrap:anywhere] sm:text-4xl">
          {project.title}
        </h1>
        <ViewTabs project={project} />
      </header>

      <p className="flex flex-wrap items-baseline gap-x-10 gap-y-3" data-testid="progress-totals">
        <span className="grid">
          <CountUp value={words} className="font-display text-5xl font-semibold" />
          <span className="text-sm text-muted">{words === 1 ? 'word' : 'words'} in all</span>
        </span>
        <span className="grid">
          <CountUp value={sessions} className="font-display text-5xl font-semibold" />
          <span className="text-sm text-muted">
            writing {sessions === 1 ? 'session' : 'sessions'} with the timer
          </span>
        </span>
      </p>

      <section aria-labelledby="progress-map" className="grid gap-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h2 id="progress-map" className="mr-auto font-display text-2xl font-semibold">
            Map
          </h2>
          <ul aria-label="Status key" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {STATUSES.map((status) => (
              <li key={status} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={cn('vlo-tile size-3.5 rounded-sm', TILE_TONE[status])} />
                {STATUS_LABEL[status]} {byStatus.get(status) ?? 0}
              </li>
            ))}
          </ul>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted">The binder is empty. Each new item adds a tile here.</p>
        ) : (
          <Tiles project={project} items={items} />
        )}
      </section>

      <Goals project={project} />
    </section>
  );
}
