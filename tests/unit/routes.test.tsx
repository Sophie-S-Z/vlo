import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PreferencesProvider } from '@/app/PreferencesProvider';
import { AppShell } from '@/app/AppShell';
import { RouteError } from '@/app/RouteError';
import { routes } from '@/app/routes';
import { markOnboarded } from '@/features/onboarding/firstVisit';
import { db } from '@/lib/db';

beforeEach(async () => {
  await db.open();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await db.delete();
});

function renderAt(path: string, table: RouteObject[] = routes) {
  const router = createMemoryRouter(table, { initialEntries: [path] });
  render(
    <PreferencesProvider>
      <RouterProvider router={router} />
    </PreferencesProvider>,
  );
}

test('a first visit to / goes to the welcome screen', async () => {
  renderAt('/');
  expect(await screen.findByRole('heading', { level: 1, name: 'What do you write?' })).toBeTruthy();
});

test('/ shows the Library after onboarding', async () => {
  await markOnboarded();
  renderAt('/');
  expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeTruthy();
});

test('/settings shows Settings', async () => {
  renderAt('/settings');
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
});

test('an unknown path shows the 404 screen with a link home', async () => {
  renderAt('/nope');
  expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Go to the Library' }).getAttribute('href')).toBe('/');
});

test('a route that throws shows the error screen', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const Boom = () => {
    throw new Error('boom');
  };
  const table: RouteObject[] = [
    {
      path: '/',
      element: <AppShell />,
      errorElement: <RouteError />,
      children: [{ path: 'boom', element: <Boom /> }],
    },
  ];
  renderAt('/boom', table);
  expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reload Vlo' })).toBeTruthy();
});

test('/p/:projectId loads the project screen, which reports a missing project', async () => {
  renderAt('/p/missing');
  expect(await screen.findByRole('heading', { level: 1, name: 'Project not found' })).toBeTruthy();
});
