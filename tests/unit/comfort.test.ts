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

  test('keep the widest choices', async () => {
    const stored = { comfortFont: true, letterSpacing: 0.1, wordSpacing: 0.2, lineHeight: 2.3 };
    expect(await loadWith(stored)).toMatchObject(stored);
  });

  test('a value that is not a choice falls back to Standard', async () => {
    expect(
      await loadWith({ comfortFont: 'yes', letterSpacing: 3, wordSpacing: '0.1', lineHeight: 1 }),
    ).toMatchObject({
      comfortFont: false,
      letterSpacing: 0,
      wordSpacing: 0,
      lineHeight: 1.7,
    });
  });
});
