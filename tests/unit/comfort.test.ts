import { afterEach, describe, expect, test, vi } from 'vitest';

/* Reading comfort on this device (roadmap F37, plan Task G8, decision P5). */

async function loadWith(stored: unknown) {
  localStorage.setItem('vlo:writing', JSON.stringify(stored));
  vi.resetModules();
  const { getWritingPrefs } = await import('@/features/editor/writingPrefs');
  return getWritingPrefs();
}

afterEach(() => {
  localStorage.clear();
});

describe('comfort settings', () => {
  test('start at Standard, with the project font', async () => {
    expect(await loadWith({})).toMatchObject({
      comfortFont: false,
      letterSpacing: 0,
      wordSpacing: 0,
      lineHeight: 1.7,
    });
  });

  test('keep any spacing in its range', async () => {
    const stored = { comfortFont: true, letterSpacing: 0.37, wordSpacing: -0.15, lineHeight: 3.25 };
    expect(await loadWith(stored)).toMatchObject(stored);
  });

  test('a spacing goes to its nearest step', async () => {
    expect(await loadWith({ letterSpacing: 0.123, lineHeight: 2.32 })).toMatchObject({
      letterSpacing: 0.12,
      lineHeight: 2.3,
    });
  });

  test('a value out of its range falls back to Standard', async () => {
    expect(
      await loadWith({ comfortFont: 'yes', letterSpacing: 3, wordSpacing: '0.1', lineHeight: 0.5 }),
    ).toMatchObject({
      comfortFont: false,
      letterSpacing: 0,
      wordSpacing: 0,
      lineHeight: 1.7,
    });
  });
});
