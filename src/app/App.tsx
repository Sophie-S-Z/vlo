import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { readSpace } from '@/features/sync/space';
import { PreferencesProvider } from './PreferencesProvider';
import { RootErrorBoundary } from './RootErrorBoundary';
import { routes } from './routes';
import { UpdateProvider } from './UpdateProvider';

export function App() {
  const [router] = useState(() => createBrowserRouter(routes));
  // The sync engine loads only on a device that syncs (F49), and stops when sync stops.
  const syncing = useLiveQuery(async () => (await readSpace().catch(() => null))?.spaceId ?? null);
  useEffect(() => {
    if (!syncing) return;
    let stop: (() => void) | undefined;
    let ended = false;
    void import('@/features/sync/engine').then(({ startSync }) => {
      if (!ended) stop = startSync();
    });
    return () => {
      ended = true;
      stop?.();
    };
  }, [syncing]);
  // The daily count (Phase 18, decision A3): once a UTC day, a few seconds after Vlo opens or comes back
  // to the screen. A share link's reader and the welcome screen never count.
  useEffect(() => {
    const count = () => {
      const path = window.location.pathname;
      if (document.visibilityState !== 'visible' || path.startsWith('/r/') || path.startsWith('/welcome'))
        return;
      void import('@/features/account/dailyCount').then(({ sendDailyCount }) => sendDailyCount());
    };
    const timer = setTimeout(count, 5_000);
    document.addEventListener('visibilitychange', count);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', count);
    };
  }, []);
  return (
    <RootErrorBoundary>
      <UpdateProvider>
        <PreferencesProvider>
          <RouterProvider router={router} />
        </PreferencesProvider>
      </UpdateProvider>
    </RootErrorBoundary>
  );
}
