import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PreferencesProvider } from '@/app/PreferencesProvider';
import { LibraryPage } from '@/features/library/LibraryPage';
import { db, type Item, type Project } from '@/lib/db';

beforeEach(async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: () => Promise.resolve(true) },
  });
  await db.open();
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'storage');
  await db.delete();
});

function project(id: string, title: string, template: Project['template'], updatedAt: number): Project {
  return {
    id,
    title,
    template,
    aiMode: 'pen',
    createdAt: 1,
    updatedAt,
    settings: { snapshotEveryMinutes: 10, aliasAiRequests: false, streaksEnabled: false, restDays: [] },
  };
}

function item(id: string, projectId: string, wordCount: number): Item {
  return {
    id,
    projectId,
    parentId: null,
    kind: 'scene',
    title: id,
    status: 'draft',
    order: 'a0',
    wordCount,
    createdAt: 1,
    updatedAt: 1,
  };
}

function renderLibrary() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <LibraryPage /> },
      { path: '/p/:projectId', element: <p>Project screen</p> },
    ],
    { initialEntries: ['/'] },
  );
  render(
    <PreferencesProvider>
      <RouterProvider router={router} />
    </PreferencesProvider>,
  );
  return router;
}

async function seedTwo() {
  await db.projects.bulkAdd([
    project('old', 'Salt Hours', 'poetry', 100),
    project('new', 'The Lighthouse Debt', 'novel', 200),
  ]);
  await db.items.bulkAdd([item('a', 'new', 1000), item('b', 'new', 234), item('c', 'old', 12)]);
}

function openMenu(title: string) {
  const trigger = screen.getByRole('button', { name: `Options for ${title}` });
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

test('with no projects, the Library shows the empty state and a New project button', async () => {
  renderLibrary();
  expect(await screen.findByText('Your projects will live here, on this device.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'New project' })).toBeTruthy();
});

test('project cards sort newest first and show title, template and word count', async () => {
  await seedTwo();
  renderLibrary();
  const list = await screen.findByRole('list', { name: 'Projects' });
  await waitFor(() => {
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });
  const [first, second] = within(list).getAllByRole('listitem');
  if (!first || !second) throw new Error('two cards expected');
  expect(
    within(first)
      .getByRole('link', { name: /The Lighthouse Debt/ })
      .getAttribute('href'),
  ).toBe('/p/new');
  expect(within(first).getByText('Novel')).toBeTruthy();
  expect(within(first).getByText('1,234 words')).toBeTruthy();
  expect(within(second).getByRole('link', { name: /Salt Hours/ })).toBeTruthy();
  expect(within(second).getByText('Poetry collection')).toBeTruthy();
  expect(within(second).getByText('12 words')).toBeTruthy();
});

test('one word reads "1 word"', async () => {
  await db.projects.add(project('p', 'Short', 'memoir', 1));
  await db.items.add(item('i', 'p', 1));
  renderLibrary();
  expect(await screen.findByText('1 word')).toBeTruthy();
});

describe('New project', () => {
  test('creates a Poetry project with the default title and opens it at its first poem', async () => {
    const router = renderLibrary();
    fireEvent.click(await screen.findByRole('button', { name: 'New project' }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    expect(within(dialog).getAllByRole('radio')).toHaveLength(3);
    fireEvent.click(within(dialog).getByRole('radio', { name: /Poetry collection/ }));
    const title = within(dialog).getByLabelText('Title');
    expect((title as HTMLInputElement).value).toBe('Untitled collection');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await screen.findByText('Project screen');
    const [created] = await db.projects.toArray();
    expect(created?.template).toBe('poetry');
    expect(created?.title).toBe('Untitled collection');
    const poem = await db.items
      .where('projectId')
      .equals(created?.id ?? '')
      .first();
    expect(router.state.location.pathname).toBe(`/p/${created?.id ?? ''}`);
    expect(router.state.location.search).toBe(`?item=${poem?.id ?? ''}`);
  });

  test('a typed title is kept when the template changes', async () => {
    renderLibrary();
    fireEvent.click(await screen.findByRole('button', { name: 'New project' }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    const title = within(dialog).getByLabelText<HTMLInputElement>('Title');
    expect(title.value).toBe('Untitled novel');
    fireEvent.change(title, { target: { value: 'Tide Tables' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Memoir/ }));
    expect(title.value).toBe('Tide Tables');
  });

  test('an empty title shows an error and creates nothing', async () => {
    renderLibrary();
    fireEvent.click(await screen.findByRole('button', { name: 'New project' }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: '  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    expect(await within(dialog).findByText('A project needs a title.')).toBeTruthy();
    expect(await db.projects.count()).toBe(0);
  });
});

test('Rename changes the title', async () => {
  await seedTwo();
  renderLibrary();
  await screen.findByRole('link', { name: /Salt Hours/ });
  openMenu('Salt Hours');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const dialog = await screen.findByRole('dialog', { name: 'Rename project' });
  const input = within(dialog).getByLabelText<HTMLInputElement>('Title');
  expect(input.value).toBe('Salt Hours');
  fireEvent.change(input, { target: { value: 'Salt Days' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('link', { name: /Salt Days/ })).toBeTruthy();
  expect((await db.projects.get('old'))?.title).toBe('Salt Days');
});

test('Delete asks first, and only the confirm button deletes', async () => {
  await seedTwo();
  renderLibrary();
  await screen.findByRole('link', { name: /Salt Hours/ });

  openMenu('Salt Hours');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  let dialog = await screen.findByRole('alertdialog', { name: 'Delete Salt Hours?' });
  expect(within(dialog).getByText('This removes it from this device.')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  expect(await db.projects.get('old')).toBeTruthy();

  openMenu('Salt Hours');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  dialog = await screen.findByRole('alertdialog', { name: 'Delete Salt Hours?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));
  await waitFor(() => {
    expect(screen.queryByRole('link', { name: /Salt Hours/ })).toBeNull();
  });
  expect(await db.projects.get('old')).toBeUndefined();
  expect(await db.items.where('projectId').equals('old').count()).toBe(0);
  expect(await screen.findByRole('link', { name: /The Lighthouse Debt/ })).toBeTruthy();
});
