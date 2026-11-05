import { Link, useLocation } from 'react-router';
import type { Project } from '@/lib/db';
import { cn } from '@/ui/cn';

/*
 * The project's view tabs (plan decision D5): Write, then the views of the template, then Submissions.
 * Each later task adds its tab here when its screen exists (section 0, rule 8).
 */

interface Tab {
  label: string;
  /** The path after /p/<project id>, with its search part. */
  to: string;
  /** True when this tab is the screen on show. */
  active: (path: string, search: URLSearchParams) => boolean;
}

/** The search value that shows the Plot Grid on the board screen. */
export const GRID_VIEW = 'grid';

function tabsFor(project: Project): Tab[] {
  const write: Tab = {
    label: 'Write',
    to: '',
    active: (path) =>
      !['/board', '/timeline', '/people', '/sequences', '/submissions'].some((end) => path.endsWith(end)),
  };
  // Every template tracks the pieces sent out (spec 8.4), so Submissions is the last tab of each.
  const submissions: Tab = {
    label: 'Submissions',
    to: '/submissions',
    active: (path) => path.endsWith('/submissions'),
  };
  return [write, ...viewsOf(project), submissions];
}

/** The views of one template, between Write and Submissions. */
function viewsOf(project: Project): Tab[] {
  if (project.template === 'novel')
    return [
      {
        label: 'Board',
        to: '/board',
        active: (path, search) => path.endsWith('/board') && search.get('view') !== GRID_VIEW,
      },
      {
        label: 'Plot Grid',
        to: `/board?view=${GRID_VIEW}`,
        active: (path, search) => path.endsWith('/board') && search.get('view') === GRID_VIEW,
      },
    ];
  if (project.template === 'memoir')
    return [
      { label: 'Timeline', to: '/timeline', active: (path) => path.endsWith('/timeline') },
      { label: 'People', to: '/people', active: (path) => path.endsWith('/people') },
    ];
  // Poetry.
  return [{ label: 'Sequences', to: '/sequences', active: (path) => path.endsWith('/sequences') }];
}

export function ViewTabs({ project }: { project: Project }) {
  const location = useLocation();
  const tabs = tabsFor(project);
  const search = new URLSearchParams(location.search);
  return (
    <nav aria-label="Project views" className="mt-3">
      <ul className="flex flex-wrap gap-1 border-b border-rule">
        {tabs.map((tab) => {
          const active = tab.active(location.pathname, search);
          return (
            <li key={tab.label}>
              <Link
                to={`/p/${project.id}${tab.to}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm font-medium no-underline',
                  active ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
