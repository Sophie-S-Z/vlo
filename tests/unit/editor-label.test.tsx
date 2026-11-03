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
