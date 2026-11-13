import { redirect, type RouteObject } from 'react-router';
import { LibraryPage } from '@/features/library/LibraryPage';
import { needsOnboarding } from '@/features/onboarding/firstVisit';
import { WelcomePage } from '@/features/onboarding/WelcomePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AppShell } from './AppShell';
import { NotFound } from './NotFound';
import { RouteError } from './RouteError';

/** A first visit to the Library goes to the welcome screen. If storage fails, the Library shows why. */
async function firstVisitLoader() {
  try {
    if (await needsOnboarding()) return redirect('/welcome');
  } catch {
    return null;
  }
  return null;
}

/** The route table. Each phase adds the routes for the screens it builds (spec section 4). */
export const routes: RouteObject[] = [
  { path: '/welcome', element: <WelcomePage />, errorElement: <RouteError /> },
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
      { path: 'settings', element: <SettingsPage /> },
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
      {
        path: 'help',
        lazy: async () => ({ Component: (await import('@/features/help/HelpPage')).HelpPage }),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
