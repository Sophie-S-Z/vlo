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

test('a render error outside the router shows the root error screen', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { RootErrorBoundary } = await import('@/app/RootErrorBoundary');
  const Boom = () => {
    throw new Error('boom');
  };
  render(
    <RootErrorBoundary>
      <Boom />
    </RootErrorBoundary>,
  );
  expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reload Vlo' })).toBeTruthy();
});
