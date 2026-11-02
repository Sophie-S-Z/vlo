import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { PreferencesProvider } from './PreferencesProvider';
import { RootErrorBoundary } from './RootErrorBoundary';
import { routes } from './routes';
import { UpdateProvider } from './UpdateProvider';

export function App() {
  const [router] = useState(() => createBrowserRouter(routes));
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
