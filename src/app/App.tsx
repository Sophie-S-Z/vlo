import { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { readSpace } from '@/features/sync/space';
import { PreferencesProvider } from './PreferencesProvider';
import { RootErrorBoundary } from './RootErrorBoundary';
import { routes } from './routes';
import { UpdateProvider } from './UpdateProvider';

export function App() {
  const [router] = useState(() => createBrowserRouter(routes));
  // The sync engine loads only on a device that syncs (F49).
  useEffect(() => {
    let stop: (() => void) | undefined;
    let ended = false;
    void readSpace()
      .then(async (space) => {
        if (!space) return;
        const { startSync } = await import('@/features/sync/engine');
        if (!ended) stop = startSync();
      })
      .catch(() => undefined);
    return () => {
      ended = true;
      stop?.();
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
