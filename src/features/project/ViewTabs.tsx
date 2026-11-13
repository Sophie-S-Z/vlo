import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { hasTemplate } from '@/features/library/templates';
import { Link, useLocation } from 'react-router';
import { ModeBadge } from '@/features/ai/ModeBadge';
import type { Project } from '@/lib/db';
import { cn } from '@/ui/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';

/*
 * The project's view tabs (plan decision D5): Write, then the views of the template, then Submissions and
 * Progress. Each later task adds its tab here when its screen exists (section 0, rule 8). The AI mode badge
 * (F23) ends the row, so it shows on every project screen.
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

/**
 * The Outline is for every template. At the Simple tool level its tab shows only on its own screen, and
 * the command menu opens it (roadmap rule 2).
 */
const outline: Tab = { label: 'Outline', to: '/outline', active: (path) => path.endsWith('/outline') };
/** The Codex (F42) is for every template too, with the same rule. */
const codex: Tab = { label: 'Codex', to: '/codex', active: (path) => path.endsWith('/codex') };
/** Feedback (F50) is for every template too, with the same rule. */
const feedback: Tab = { label: 'Feedback', to: '/feedback', active: (path) => path.endsWith('/feedback') };
/** The Book screen (F51) is for every template too, with the same rule. */
const book: Tab = { label: 'Book', to: '/book', active: (path) => path.endsWith('/book') };

/** A view with a line that says what it is for, in the More menu. */
interface MoreTab extends Tab {
  hint: string;
}

/** The views behind the More menu (Phase 17 decision S3), in menu order. */
const moreViews: readonly MoreTab[] = [
  { ...outline, hint: 'Synopses and labels of every item, in one list' },
  { ...codex, hint: 'Characters, places and things, and where each one shows' },
  { ...feedback, hint: 'Notes from your readers, in one place' },
  { ...book, hint: 'The look of the printed book, page by page' },
  {
    label: 'Submissions',
    to: '/submissions',
    active: (path) => path.endsWith('/submissions'),
    hint: 'Where you sent the work, and the answers',
  },
  {
    label: 'Progress',
    to: '/progress',
    active: (path) => path.endsWith('/progress'),
    hint: 'Words each day, goals and streaks',
  },
];

/**
 * Write and the views of the templates show as tabs. The other views go in the More menu, so the row stays
 * short. The view on show always has its tab.
 */
function tabsFor(project: Project, path: string, search: URLSearchParams): { tabs: Tab[]; more: MoreTab[] } {
  const write: Tab = {
    label: 'Write',
    to: '',
    active: (path) =>
      ![
        '/board',
        '/outline',
        '/codex',
        '/feedback',
        '/book',
        '/timeline',
        '/people',
        '/sequences',
        '/submissions',
        '/progress',
      ].some((end) => path.endsWith(end)),
  };
  const shown = moreViews.filter((tab) => tab.active(path, search));
  return {
    tabs: [write, ...viewsOf(project), ...shown],
    more: moreViews.filter((tab) => !tab.active(path, search)),
  };
}

/** The views of the project's templates, between Write and the shared views. Open writing has none. */
function viewsOf(project: Project): Tab[] {
  const tabs: Tab[] = [];
  if (hasTemplate(project, 'novel'))
    tabs.push(
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
    );
  if (hasTemplate(project, 'memoir'))
    tabs.push(
      { label: 'Timeline', to: '/timeline', active: (path) => path.endsWith('/timeline') },
      { label: 'People', to: '/people', active: (path) => path.endsWith('/people') },
    );
  if (hasTemplate(project, 'poetry'))
    tabs.push({ label: 'Sequences', to: '/sequences', active: (path) => path.endsWith('/sequences') });
  return tabs;
}

export function ViewTabs({
  project,
  modeOpen,
  onModeOpenChange,
  tools,
}: {
  project: Project;
  /** The Write screen's tool icons, which share this row on a wide screen. */
  tools?: ReactNode;
  /** The mode dialog, when the screen also opens it from its command menu. */
  modeOpen?: boolean;
  onModeOpenChange?: (open: boolean) => void;
}) {
  const location = useLocation();
  const [ownModeOpen, setOwnModeOpen] = useState(false);
  const search = new URLSearchParams(location.search);
  const { tabs, more } = tabsFor(project, location.pathname, search);
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
    <div className="mt-3 flex items-center gap-2 border-b border-rule">
      {/* `contain: inline-size` keeps the long row from widening the page; the row scrolls inside instead. */}
      <nav aria-label="Project views" className="min-w-0 flex-1 [contain:inline-size]">
        {/* One row that scrolls on a phone, so the active tab keeps its line on the rule. */}
        <ul ref={listRef} className="flex gap-1 overflow-x-auto [scrollbar-width:thin]">
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
          <li className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-1 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted hover:text-text focus-visible:outline-offset-[-2px] data-[state=open]:text-text"
                >
                  More
                  <ChevronDown aria-hidden="true" className="size-3.5" />
                  <span className="sr-only"> views</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                {more.map((tab) => (
                  <DropdownMenuItem key={tab.label} asChild>
                    <Link to={`/p/${project.id}${tab.to}`} className="grid gap-0.5 text-text no-underline">
                      <span className="font-medium">{tab.label}</span>
                      <span className="text-xs text-muted">{tab.hint}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>
      </nav>
      {tools}
      <ModeBadge
        project={project}
        open={modeOpen ?? ownModeOpen}
        onOpenChange={onModeOpenChange ?? setOwnModeOpen}
      />
    </div>
  );
}
