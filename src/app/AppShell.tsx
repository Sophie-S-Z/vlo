import { useRef } from 'react';
import { NavLink, Outlet } from 'react-router';
import { cn } from '@/ui/cn';
import { MARKETING_URL } from './links';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex min-h-11 items-center rounded-md px-3 text-sm no-underline',
    isActive ? 'bg-surface text-text' : 'text-muted hover:text-text',
  );

export function AppShell() {
  const mainRef = useRef<HTMLElement>(null);

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
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2">
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
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 outline-none"
      >
        <Outlet />
      </main>
      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-muted">
          <p>Your writing stays on this device.</p>
          <a href={MARKETING_URL} rel="noreferrer">
            About Vlo
          </a>
        </div>
      </footer>
    </div>
  );
}
