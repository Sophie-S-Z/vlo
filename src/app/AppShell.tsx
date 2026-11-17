import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowUpRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigation } from 'react-router';
import { AccountMenu } from '@/features/account/AccountMenu';
import { readProfile } from '@/features/account/profile';
import { readSession } from '@/features/account/session';
import { SafetyBadge } from '@/features/backup/SafetyBadge';
import { sharingReady } from '@/features/share/rpc';
import { cn } from '@/ui/cn';
import { MARKETING_URL } from './links';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex min-h-11 items-center rounded-md px-3 text-sm no-underline',
    isActive ? 'bg-surface text-text' : 'text-muted hover:text-text',
  );

// Footer links are chrome, so they stay quiet next to the page's own links.
const FOOTER_LINK = 'text-muted no-underline transition-colors hover:text-text';

export function AppShell() {
  const mainRef = useRef<HTMLElement>(null);
  // The project screen has up to three columns, so it uses the full window width.
  const wide = useMatch('/p/:projectId') !== null;
  const width = wide ? 'max-w-[110rem]' : 'max-w-5xl';
  const { pathname } = useLocation();
  const firstPath = useRef(true);
  // A screen's code loads on its first visit. While it loads, a line at the top shows that Vlo is working.
  const loading = useNavigation().state === 'loading';
  // Accounts (Phase 18): the header says "Sign in" until this device has an account, then shows the
  // writer's photo and name (ADR 0011).
  const account = useLiveQuery(
    async () => {
      const session = await readSession().catch(() => null);
      return session && { email: session.email, profile: await readProfile().catch(() => null) };
    },
    [],
    null,
  );

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
    <div className="flex min-h-dvh flex-col overflow-x-clip">
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
      {loading && <div aria-hidden="true" className="vlo-route-loading" />}
      <header data-chrome data-typing-hide className="border-b border-rule">
        <div className={cn('mx-auto flex items-center justify-between gap-4 px-4 py-2', width)}>
          <NavLink
            to="/"
            data-tip="Your library"
            data-tip-align="start"
            className="vlo-tip font-display text-2xl font-semibold text-text no-underline [font-variation-settings:'SOFT'_50,'opsz'_72]"
          >
            Vlo
          </NavLink>
          <div className="flex items-center gap-1">
            <SafetyBadge />
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
                {sharingReady() && !account && (
                  <li>
                    <NavLink to="/account" className={navClass}>
                      Sign in
                    </NavLink>
                  </li>
                )}
              </ul>
            </nav>
            {sharingReady() && account && <AccountMenu email={account.email} profile={account.profile} />}
          </div>
        </div>
      </header>
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        aria-busy={loading || undefined}
        className={cn('mx-auto w-full flex-1 px-4 py-8 outline-none', width)}
      >
        <Outlet />
      </main>
      <footer data-chrome className="border-t border-rule">
        <div
          className={cn(
            'mx-auto grid gap-3 px-4 py-6 text-sm text-muted sm:flex sm:items-center sm:justify-between',
            width,
          )}
        >
          <p>
            Your writing stays on this device.{' '}
            <Link
              to="/network"
              className="text-muted underline decoration-rule underline-offset-4 hover:text-text hover:decoration-current"
            >
              See the network log
            </Link>
          </p>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              <li>
                <Link to="/help" className={FOOTER_LINK}>
                  Help
                </Link>
              </li>
              <li>
                <Link to="/send-feedback" state={{ from: pathname }} className={FOOTER_LINK}>
                  Send feedback
                </Link>
              </li>
              <li>
                <Link to="/send-feedback?kind=note" state={{ from: pathname }} className={FOOTER_LINK}>
                  Write to Sophie
                </Link>
              </li>
              <li>
                <Link to="/privacy" className={FOOTER_LINK}>
                  Privacy
                </Link>
              </li>
              <li>
                <Link to="/ai-policy" className={FOOTER_LINK}>
                  AI policy
                </Link>
              </li>
              <li>
                <a
                  href={MARKETING_URL}
                  rel="noreferrer"
                  className={cn(FOOTER_LINK, 'inline-flex items-center gap-1')}
                >
                  Vlo website
                  <ArrowUpRight aria-hidden="true" strokeWidth={1.75} className="size-3.5" />
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
