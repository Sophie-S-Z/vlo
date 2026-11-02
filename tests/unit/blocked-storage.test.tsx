import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '@/app/App';
import { markOnboarded } from '@/features/onboarding/firstVisit';
import { db } from '@/lib/db';
import { PreferencesProvider, usePreferences } from '@/app/PreferencesProvider';

const realDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

beforeEach(async () => {
  await db.open();
  await markOnboarded();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  // Browsers that block site data throw from the localStorage getter itself.
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    },
  });
});
afterEach(async () => {
  cleanup();
  await db.delete();
  vi.unstubAllGlobals();
  if (realDescriptor) Object.defineProperty(window, 'localStorage', realDescriptor);
});

test('the app still renders when site storage is blocked', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeTruthy();
});

test('preferences still change for this tab when site storage is blocked', () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(PreferencesProvider, null, children);
  const { result } = renderHook(() => usePreferences(), { wrapper });
  act(() => {
    result.current.setCalm(true);
  });
  expect(result.current.prefs.calm).toBe(true);
});
