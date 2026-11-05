import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import type { Project } from '@/lib/db';
import { cn } from '@/ui/cn';

/*
 * The project's view tabs (plan decision D5): Write, then the views of the template, then Submissions and
 * Progress. Each later task adds its tab here when its screen exists (section 0, rule 8).
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
      !['/board', '/timeline', '/people', '/sequences', '/submissions', '/progress'].some((end) =>
        path.endsWith(end),
      ),
  };
  // Every template has Submissions and Progress (spec 8.4), after its own views.
  const shared: Tab[] = [
    { label: 'Submissions', to: '/submissions', active: (path) => path.endsWith('/submissions') },
    { label: 'Progress', to: '/progress', active: (path) => path.endsWith('/progress') },
  ];
  return [write, ...viewsOf(project), ...shared];
}

/** The views of one template, between Write and the shared views. */
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
  const listRef = useRef<HTMLUListElement>(null);

  // On a phone the row scrolls, so bring the tab of this screen into view. Only the row scrolls, never
  // the page.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector('[aria-current="page"]');
    if (!list || !current) return;
    const row = list.getBoundingClientRect();
    const tab = current.getBoundingClientRect();
    if (tab.right > row.right) list.scrollLeft += Math.ceil(tab.right - row.right);
    else if (tab.left < row.left) list.scrollLeft -= Math.ceil(row.left - tab.left);
  }, [location.pathname, location.search]);

  return (
    // `contain: inline-size` keeps the long row from widening the page; the row scrolls inside instead.
    <nav aria-label="Project views" className="mt-3 [contain:inline-size]">
      {/* One row that scrolls on a phone, so the active tab keeps its line on the rule. */}
      <ul ref={listRef} className="flex gap-1 overflow-x-auto border-b border-rule [scrollbar-width:thin]">
        {tabs.map((tab) => {
          const active = tab.active(location.pathname, search);
          return (
            <li key={tab.label} className="shrink-0">
              <Link
                to={`/p/${project.id}${tab.to}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap no-underline focus-visible:outline-offset-[-2px]',
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
