import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PreferencesProvider } from '@/app/PreferencesProvider';
import { AppShell } from '@/app/AppShell';
import { RouteError } from '@/app/RouteError';
import { routes } from '@/app/routes';
import { createProject } from '@/features/library/projects';
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
  return router;
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
  // The project route loads the editor code on first use. Under a busy test run, its first transform can
  // take over the 1 s default, so this wait is longer. The app itself is not under test for speed here.
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Project not found' }, { timeout: 5_000 }),
  ).toBeTruthy();
});

test.each(['board', 'timeline', 'people', 'sequences', 'submissions', 'progress'])(
  'the %s view reports a missing project with a link to the Library',
  async (view) => {
    renderAt(`/p/missing/${view}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Project not found' }, { timeout: 5_000 }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the Library' }).getAttribute('href')).toBe('/');
  },
);

test.each([
  ['board', 'poetry', 'The Story Board is for novel projects. This project is a poetry collection.'],
  ['timeline', 'novel', 'The Memory Timeline is for memoir projects. This project is a novel.'],
  ['people', 'novel', 'People and private names are for memoir projects. This project is a novel.'],
  ['sequences', 'memoir', 'The Collection Sequencer is for poetry collections. This project is a memoir.'],
] as const)('the %s view of a %s project says which template it is for', async (view, template, text) => {
  const { project } = await createProject({ title: 'Salt Year', templates: [template] });
  renderAt(`/p/${project.id}/${view}`);
  expect(await screen.findByText(text, {}, { timeout: 5_000 })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Go back to the writing' }).getAttribute('href')).toBe(
    `/p/${project.id}`,
  );
});

test.each([
  ['/settings', 'Settings · Vlo'],
  ['/nope', 'Page not found · Vlo'],
  ['/p/missing', 'Project not found · Vlo'],
])('%s sets the tab title', async (path, title) => {
  await markOnboarded();
  renderAt(path);
  await waitFor(() => {
    expect(document.title).toBe(title);
  });
});

test('after moving to another screen, focus goes to its heading', async () => {
  await markOnboarded();
  const router = renderAt('/settings');
  await screen.findByRole('heading', { level: 1, name: 'Settings' });
  // The first screen keeps the browser's own focus.
  expect(document.activeElement).toBe(document.body);
  await act(async () => {
    await router.navigate('/');
  });
  const library = await screen.findByRole('heading', { level: 1, name: 'Library' });
  await waitFor(() => {
    expect(document.activeElement).toBe(library);
  });
  expect(document.title).toBe('Library · Vlo');
});
