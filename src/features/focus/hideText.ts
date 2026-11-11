import { useEffect } from 'react';
import { getFocusPrefs, setFocusPrefs, useFocusPrefs } from './focusPrefs';

/*
 * Hide the text (Ellipsus comparison, October 2026). The writer can type in a café or on a train with the
 * words covered on the screen. Only the screen changes: the text, its saves, its word count and every
 * export stay the same, and a screen reader still reads the words. The CSS is in `styles/editor.css`.
 */

/** The shortcut that turns Hide the text on and off, in TipTap's form for the labels. */
export const HIDE_TEXT_KEYS = 'Mod-Shift-.';

/** Turns Hide the text on or off. */
export function toggleHideText(): void {
  setFocusPrefs({ hide: !getFocusPrefs().hide });
}

/** True for the Hide the text shortcut. The physical key, so a layout with "." on Shift still works. */
export function isHideTextKey(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.code === 'Period';
}

/**
 * Puts the switches on the page root while the project screen is open, so the CSS covers the text of
 * each editor, the pane beside included. Leaving the project shows the text again everywhere else.
 */
export function useHideText(): void {
  const { hide, hideStyle, hideKeep } = useFocusPrefs();
  useEffect(() => {
    if (!hide) return;
    const root = document.documentElement;
    root.dataset.hideText = hideStyle;
    if (hideKeep) root.dataset.hideKeep = 'true';
    return () => {
      delete root.dataset.hideText;
      delete root.dataset.hideKeep;
    };
  }, [hide, hideStyle, hideKeep]);
}
