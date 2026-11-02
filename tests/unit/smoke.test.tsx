import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '@/app/App';

beforeEach(() => {
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

test('App renders the Vlo wordmark and the Library', async () => {
  render(<App />);
  expect(screen.getByRole('link', { name: 'Vlo' })).toBeTruthy();
  expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeTruthy();
});
