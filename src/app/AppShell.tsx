import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router';
import { cn } from '@/ui/cn';
import { MARKETING_URL } from './links';
import { UpdatePrompt } from './UpdatePrompt';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex min-h-11 items-center rounded-md px-3 text-sm no-underline',
    isActive ? 'bg-surface text-text' : 'text-muted hover:text-text',
  );

export function AppShell() {
  const mainRef = useRef<HTMLElement>(null);
  // The project screen has up to three columns, so it uses the full window width.
  const wide = useMatch('/p/:projectId') !== null;
  const width = wide ? 'max-w-[110rem]' : 'max-w-5xl';
  const { pathname } = useLocation();
  const firstPath = useRef(true);

  // After moving to another screen, focus goes to its heading, so a screen reader starts there. When the
  // new screen already put focus inside the page, such as the editor, it stays.
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      const main = mainRef.current;
      const active = document.activeElement;
      if (!main || (active && active !== document.body && main.contains(active))) return;
      const heading = main.querySelector('h1');
      if (!heading) return;
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
        className="sr-only rounded-md bg-surface px-3 py-2 text-text focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <header data-chrome className="border-b border-rule">
        <div className={cn('mx-auto flex items-center justify-between gap-4 px-4 py-2', width)}>
          <NavLink
            to="/"
            className="font-display text-2xl font-semibold text-text no-underline [font-variation-settings:'SOFT'_50,'opsz'_72]"
          >
            Vlo
          </NavLink>
          <nav aria-label="Main">
            <ul className="flex items-center gap-1">
              <li>
                <NavLink to="/" end className={navClass}>
                  Library
                </NavLink>
              </li>
              <li>
                <NavLink to="/settings" className={navClass}>
                  Settings
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className={cn('mx-auto w-full flex-1 px-4 py-8 outline-none', width)}
      >
        <Outlet />
      </main>
      <footer data-chrome className="border-t border-rule">
        <div
          className={cn(
            'mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-muted',
            width,
          )}
        >
          <p>
            Your writing stays on this device.{' '}
            <Link to="/network" className="underline">
              See the network log
            </Link>
          </p>
          <UpdatePrompt />
          <p className="flex flex-wrap gap-x-4 gap-y-2">
            <Link to="/help" className="underline">
              Help
            </Link>
            <Link to="/privacy" className="underline">
              Privacy
            </Link>
            <Link to="/ai-policy" className="underline">
              AI policy
            </Link>
            <a href={MARKETING_URL} rel="noreferrer">
              About Vlo
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
