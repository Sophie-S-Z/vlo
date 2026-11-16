import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { readSpace } from '@/features/sync/space';
import { recordPersistence, renewPersistence } from '@/lib/storage';
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
  // Persistent storage: Vlo asks again at start, and at once after an install, because Chrome and Safari
  // often grant it to an installed app.
  useEffect(() => {
    void renewPersistence();
    const installed = () => void recordPersistence();
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  // The daily count (Phase 18, decision A3): a few seconds after Vlo opens, each minute while it is on the
  // screen, and as it leaves the screen. The count goes only on a new day or after the projects change, so
  // most checks send nothing. A share link's reader and the welcome screen never count.
  useEffect(() => {
    const count = () => {
      const path = window.location.pathname;
      if (path.startsWith('/r/') || path.startsWith('/welcome')) return;
      const leaving = document.visibilityState !== 'visible';
      void import('@/features/account/dailyCount').then(({ sendDailyCount }) => sendDailyCount(leaving));
    };
    const timer = setTimeout(count, 5_000);
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') count();
    }, 60_000);
    document.addEventListener('visibilitychange', count);
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
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
