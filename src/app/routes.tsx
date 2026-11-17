import { redirect, type LoaderFunctionArgs, type RouteObject } from 'react-router';
import { profileLater, profileStep, readProfile } from '@/features/account/profile';
import { readSession } from '@/features/account/session';
import { LibraryPage } from '@/features/library/LibraryPage';
import { sharingReady } from '@/features/share/rpc';
import { ACTIVE_ACCOUNT, guestChosen } from '@/lib/library';
import { needsOnboarding } from '@/features/onboarding/firstVisit';
import { WelcomePage } from '@/features/onboarding/WelcomePage';
import { AppShell } from './AppShell';
import { NotFound } from './NotFound';
import { RouteError } from './RouteError';

/**
 * A first visit to the Library goes to the welcome screen, after the sign-in screen when the visit is
 * signed out. If storage fails, the Library shows why.
 */
async function firstVisitLoader(args: LoaderFunctionArgs) {
  const signIn = await signInLoader(args);
  if (signIn) return signIn;
  try {
    if (await needsOnboarding()) return redirect('/welcome');
  } catch {
    return null;
  }
  return null;
}

/** Screens that a signed-out visitor opens with no sign-in first: a sign-in itself, a pairing link and help. */
const OPEN_PATHS = ['/account', '/pair', '/privacy', '/ai-policy', '/help', '/verify'];

/**
 * A signed-out visit opens on the sign-in screen, in a build with accounts. A writer who chose to write
 * with no account in this tab goes on. A signed-in account with no profile on this device gives its name
 * first (ADR 0011), unless the device is offline or the server did not answer in this tab. Storage that fails lets the visit through, so no one is
 * locked out.
 */
async function signInLoader({ request }: LoaderFunctionArgs) {
  if (!sharingReady()) return null;
  const { pathname, search } = new URL(request.url);
  if (OPEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;
  if (guestChosen() && ACTIVE_ACCOUNT === null) return null;
  try {
    if (await readSession()) {
      const named = !navigator.onLine || profileLater() || (await readProfile()) !== null;
      return named ? null : redirect(profileStep(pathname + search));
    }
  } catch {
    return null;
  }
  return redirect(`/sign-in?next=${encodeURIComponent(pathname + search)}`);
}

/** The route table. Each phase adds the routes for the screens it builds (spec section 4). */
export const routes: RouteObject[] = [
  { path: '/welcome', element: <WelcomePage />, errorElement: <RouteError /> },
  {
    path: '/sign-in',
    errorElement: <RouteError />,
    lazy: async () => ({ Component: (await import('@/features/account/SignInPage')).SignInPage }),
  },
  // The name step after a first sign-in (ADR 0011), on its own page like the sign-in screen.
  {
    path: '/profile/new',
    errorElement: <RouteError />,
    lazy: async () => ({ Component: (await import('@/features/account/ProfileSetupPage')).ProfileSetupPage }),
  },
  // A share link's reader view (plan Task E4): outside the app shell and the welcome redirect.
  {
    path: '/r/:shareId',
    errorElement: <RouteError />,
    lazy: async () => ({ Component: (await import('@/features/reader/ReaderPage')).ReaderPage }),
  },
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    loader: signInLoader,
    // The check runs as Vlo opens, not at each move between screens.
    shouldRevalidate: () => false,
    children: [
      { index: true, loader: firstVisitLoader, element: <LibraryPage /> },
      {
        path: 'p/:projectId',
        lazy: async () => ({ Component: (await import('@/features/project/ProjectPage')).ProjectPage }),
      },
      {
        path: 'p/:projectId/board',
        lazy: async () => ({ Component: (await import('@/features/board/BoardPage')).BoardPage }),
      },
      {
        path: 'p/:projectId/timeline',
        lazy: async () => ({ Component: (await import('@/features/timeline/TimelinePage')).TimelinePage }),
      },
      {
        path: 'p/:projectId/people',
        lazy: async () => ({ Component: (await import('@/features/people/PeoplePage')).PeoplePage }),
      },
      {
        path: 'p/:projectId/sequences',
        lazy: async () => ({
          Component: (await import('@/features/sequences/SequencesPage')).SequencesPage,
        }),
      },
      {
        path: 'p/:projectId/outline',
        lazy: async () => ({ Component: (await import('@/features/outline/OutlinePage')).OutlinePage }),
      },
      {
        path: 'p/:projectId/codex',
        lazy: async () => ({ Component: (await import('@/features/codex/CodexPage')).CodexPage }),
      },
      {
        path: 'p/:projectId/feedback',
        lazy: async () => ({ Component: (await import('@/features/feedback/FeedbackPage')).FeedbackPage }),
      },
      {
        path: 'p/:projectId/book',
        lazy: async () => ({ Component: (await import('@/features/book/BookPage')).BookPage }),
      },
      {
        path: 'p/:projectId/submissions',
        lazy: async () => ({
          Component: (await import('@/features/submissions/SubmissionsPage')).SubmissionsPage,
        }),
      },
      {
        path: 'p/:projectId/progress',
        lazy: async () => ({ Component: (await import('@/features/progress/ProgressPage')).ProgressPage }),
      },
      // The Workshop (Phase 17 decision D1): deeper tools for each writing mode.
      {
        path: 'p/:projectId/workshop',
        lazy: async () => ({ Component: (await import('@/features/workshop/WorkshopPage')).WorkshopPage }),
      },
      // A series of books (F59): its books, shared Codex and style sheet.
      {
        path: 'series/:seriesId',
        lazy: async () => ({ Component: (await import('@/features/series/SeriesPage')).SeriesPage }),
      },
      {
        path: 'profile',
        lazy: async () => ({ Component: (await import('@/features/account/ProfilePage')).ProfilePage }),
      },
      {
        path: 'settings',
        lazy: async () => ({ Component: (await import('@/features/settings/SettingsPage')).SettingsPage }),
      },
      // A pairing link for sync (F49). The fragment holds the space, so the page takes it once.
      {
        path: 'pair',
        lazy: async () => ({ Component: (await import('@/features/sync/PairPage')).PairPage }),
      },
      // Quick capture (F48): the share sheet and the app shortcut open it.
      {
        path: 'capture',
        lazy: async () => ({ Component: (await import('@/features/capture/CapturePage')).CapturePage }),
      },
      {
        path: 'network',
        lazy: async () => ({ Component: (await import('@/features/network/NetworkPage')).NetworkPage }),
      },
      {
        path: 'ai-policy',
        lazy: async () => ({ Component: (await import('@/features/policy/AiPolicyPage')).AiPolicyPage }),
      },
      {
        path: 'privacy',
        lazy: async () => ({ Component: (await import('@/features/policy/PrivacyPage')).PrivacyPage }),
      },
      // The check of an authorship record (F54): it reads a file in the browser and needs no project.
      {
        path: 'verify',
        lazy: async () => ({ Component: (await import('@/features/authorship/VerifyPage')).VerifyPage }),
      },
      // Accounts, sync on every device, feedback to the owner and the owner page (Phase 18).
      {
        path: 'account',
        lazy: async () => ({ Component: (await import('@/features/account/AccountPage')).AccountPage }),
      },
      {
        path: 'send-feedback',
        lazy: async () => ({
          Component: (await import('@/features/account/SendFeedbackPage')).SendFeedbackPage,
        }),
      },
      {
        path: 'owner',
        lazy: async () => ({ Component: (await import('@/features/account/OwnerPage')).OwnerPage }),
      },
      {
        path: 'help',
        lazy: async () => ({ Component: (await import('@/features/help/HelpPage')).HelpPage }),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
