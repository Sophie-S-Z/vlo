import { cleanup, render, screen, waitFor } from '@testing-library/react';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Editor } from '@/features/editor/Editor';

beforeEach(() => {
  // The selection menu asks whether the screen is a phone. jsdom has no matchMedia.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('a rename changes the accessible name of the open editor', async () => {
  const doc = new Y.Doc();
  const { rerender } = render(<Editor doc={doc} kind="prose" label="Chapter one" />);
  const box = await screen.findByRole('textbox', { name: 'Chapter one' });

  rerender(<Editor doc={doc} kind="prose" label="The harbour" />);
  await waitFor(() => {
    expect(screen.getByRole('textbox', { name: 'The harbour' })).toBe(box);
  });
  expect(box.getAttribute('aria-describedby')).not.toBeNull();
  expect(box.classList.contains('vlo-prose')).toBe(true);
});

test('a change of the project templates reaches the / menu and the writer keys', async () => {
  const doc = new Y.Doc();
  const { rerender } = render(<Editor doc={doc} kind="prose" label="Chapter one" templates={['novel']} />);
  const templatesOf = async () => {
    const box = await screen.findByRole<
      HTMLElement & {
        editor?: { extensionManager: { extensions: { name: string; options: { templates?: unknown } }[] } };
      }
    >('textbox', { name: 'Chapter one' });
    return box.editor?.extensionManager.extensions.find((e) => e.name === 'writerKeys')?.options.templates;
  };
  expect(await templatesOf()).toEqual(['novel']);
  rerender(<Editor doc={doc} kind="prose" label="Chapter one" templates={['novel', 'poetry']} />);
  await waitFor(async () => {
    expect(await templatesOf()).toEqual(['novel', 'poetry']);
  });
});
