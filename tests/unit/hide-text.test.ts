import { afterEach, describe, expect, it } from 'vitest';
import { getFocusPrefs, reloadFocusPrefs, setFocusPrefs } from '@/features/focus/focusPrefs';
import { isHideTextKey, toggleHideText } from '@/features/focus/hideText';

/* Hide the text (Ellipsus comparison, October 2026): the switches on this device and the shortcut. */

afterEach(() => {
  localStorage.clear();
  reloadFocusPrefs();
});

describe('Hide the text', () => {
  it('starts off, with the blur, and with every paragraph hidden', () => {
    expect(getFocusPrefs()).toMatchObject({ hide: false, hideStyle: 'blur', hideKeep: false });
  });

  it('keeps the choices on this device, and a damaged value falls back to the defaults', () => {
    setFocusPrefs({ hideStyle: 'bars', hideKeep: true });
    toggleHideText();
    reloadFocusPrefs();
    expect(getFocusPrefs()).toMatchObject({ hide: true, hideStyle: 'bars', hideKeep: true });
    localStorage.setItem('vlo:focus', JSON.stringify({ hide: 'yes', hideStyle: 'scribble' }));
    reloadFocusPrefs();
    expect(getFocusPrefs()).toMatchObject({ hide: false, hideStyle: 'blur', hideKeep: false });
  });

  it('takes Mod-Shift-. by the physical key, and no other key', () => {
    const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);
    expect(isHideTextKey(key({ ctrlKey: true, shiftKey: true, code: 'Period', key: '>' }))).toBe(true);
    expect(isHideTextKey(key({ metaKey: true, shiftKey: true, code: 'Period', key: '.' }))).toBe(true);
    expect(isHideTextKey(key({ ctrlKey: true, code: 'Period', key: '.' }))).toBe(false);
    expect(isHideTextKey(key({ ctrlKey: true, shiftKey: true, altKey: true, code: 'Period' }))).toBe(false);
    expect(isHideTextKey(key({ shiftKey: true, code: 'Period', key: '>' }))).toBe(false);
  });
});
