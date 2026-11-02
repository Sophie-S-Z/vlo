import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PreferencesProvider, useMotionAllowed, usePreferences } from '@/app/PreferencesProvider';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  loadPreferences,
  resolveTheme,
  savePreferences,
} from '@/app/preferences';

function stubMatchMedia(matches: Record<string, boolean>) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches[query] ?? false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

const wrapper = ({ children }: { children: ReactNode }) => createElement(PreferencesProvider, null, children);

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia({});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('loadPreferences and savePreferences', () => {
  test('empty storage gives the defaults', () => {
    expect(loadPreferences(localStorage)).toEqual({ theme: 'system', calm: false });
    expect(DEFAULT_PREFERENCES).toEqual({ theme: 'system', calm: false });
  });

  test('bad JSON gives the defaults', () => {
    localStorage.setItem(PREFERENCES_KEY, '{bad');
    expect(loadPreferences(localStorage)).toEqual(DEFAULT_PREFERENCES);
  });

  test('an unknown theme value gives the default theme', () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ theme: 'neon', calm: true }));
    expect(loadPreferences(localStorage)).toEqual({ theme: 'system', calm: true });
  });

  test('round trip keeps the values', () => {
    savePreferences(localStorage, { theme: 'sepia', calm: true });
    expect(PREFERENCES_KEY).toBe('vlo:preferences');
    expect(loadPreferences(localStorage)).toEqual({ theme: 'sepia', calm: true });
  });
});

describe('resolveTheme', () => {
  test('system follows the color scheme', () => {
    expect(resolveTheme('system', true)).toBe('ink');
    expect(resolveTheme('system', false)).toBe('paper');
  });
  test('a chosen theme ignores the color scheme', () => {
    expect(resolveTheme('sepia', true)).toBe('sepia');
    expect(resolveTheme('paper', true)).toBe('paper');
  });
});

describe('PreferencesProvider', () => {
  test('sets data-theme and data-calm on the html element', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(document.documentElement.dataset.theme).toBe('paper');
    act(() => {
      result.current.setTheme('sepia');
      result.current.setCalm(true);
    });
    expect(document.documentElement.dataset.theme).toBe('sepia');
    expect(document.documentElement.dataset.calm).toBe('true');
    expect(loadPreferences(localStorage)).toEqual({ theme: 'sepia', calm: true });
  });

  test('a storage event from another tab updates the preferences', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => {
      const value = JSON.stringify({ theme: 'ink', calm: true });
      localStorage.setItem(PREFERENCES_KEY, value);
      window.dispatchEvent(new StorageEvent('storage', { key: PREFERENCES_KEY, newValue: value }));
    });
    expect(result.current.prefs).toEqual({ theme: 'ink', calm: true });
  });

  test('another tab clearing all storage resets the preferences to the defaults', () => {
    savePreferences(localStorage, { theme: 'sepia', calm: true });
    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(result.current.prefs).toEqual(DEFAULT_PREFERENCES);
  });

  test('one change writes storage once, even under StrictMode, and loading writes nothing', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const strict = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, createElement(PreferencesProvider, null, children));
    const { result } = renderHook(() => usePreferences(), { wrapper: strict });
    expect(setItem).not.toHaveBeenCalled();
    act(() => {
      result.current.setTheme('paper');
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(loadPreferences(localStorage).theme).toBe('paper');
    setItem.mockRestore();
  });
});

describe('useMotionAllowed', () => {
  test('true when calm is off and the system allows motion', () => {
    const { result } = renderHook(() => useMotionAllowed(), { wrapper });
    expect(result.current).toBe(true);
  });

  test('false when calm is on', () => {
    savePreferences(localStorage, { theme: 'system', calm: true });
    const { result } = renderHook(() => useMotionAllowed(), { wrapper });
    expect(result.current).toBe(false);
  });

  test('false when the system asks for reduced motion', () => {
    stubMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    const { result } = renderHook(() => useMotionAllowed(), { wrapper });
    expect(result.current).toBe(false);
  });
});
