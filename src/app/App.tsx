import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { PreferencesProvider } from './PreferencesProvider';
import { routes } from './routes';

export function App() {
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <PreferencesProvider>
      <RouterProvider router={router} />
    </PreferencesProvider>
  );
}
