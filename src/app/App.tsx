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
