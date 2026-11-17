import type { Editor } from '@tiptap/core';

/*
 * Phone typing (Phase 19, Task A1). While the on-screen keyboard is open and the text has focus, the site
 * header, the project rows and the item row go away (`data-typing-hide`), so the text starts at the top of
 * the screen. The toolbar moves to sit on the keyboard (`data-vlo-keyboard-bar` in editor.css).
 *
 * A browser does not say when its keyboard opens. The visual viewport gets shorter than the window by the
 * keyboard's height, so a gap of more than `KEYBOARD_MIN_PX` on a touch screen counts as an open keyboard.
 * The window height goes to the scale of the visual viewport first: a zoom, or a line wider than the screen
 * that widens the layout for a moment, changes the window height with no keyboard.
 */

/** A smaller gap is a browser bar that slides, not a keyboard. */
export const KEYBOARD_MIN_PX = 120;

const ATTR = 'data-vlo-typing';
const INSET = '--vlo-keyboard-inset';

/** The height under the visual viewport that the keyboard covers, in CSS pixels. */
export function keyboardInset(
  view: Pick<VisualViewport, 'width' | 'height' | 'offsetTop'>,
  win: Pick<Window, 'innerWidth' | 'innerHeight'>,
): number {
  const fullHeight = (win.innerHeight * view.width) / win.innerWidth;
  return Math.max(0, Math.round(fullHeight - view.height - view.offsetTop));
}

/** Starts phone typing for this editor on a touch screen. Returns the stop function. */
export function watchPhoneTyping(editor: Editor, win: Window = window): () => void {
  const view = win.visualViewport;
  if (!view || !win.matchMedia('(pointer: coarse)').matches) return () => undefined;
  const root = win.document.documentElement;
  let on = false;

  const update = () => {
    if (editor.isDestroyed) return;
    const inset = keyboardInset(view, win);
    const next = editor.view.hasFocus() && inset > KEYBOARD_MIN_PX;
    if (next) root.style.setProperty(INSET, `${String(inset)}px`);
    if (next === on) return;
    on = next;
    root.toggleAttribute(ATTR, on);
    // The rows above the text came or went, so the caret line moves. Bring it back into view.
    if (on) win.requestAnimationFrame(() => editor.isDestroyed || editor.commands.scrollIntoView());
  };
  // The keyboard opens a moment after the focus, so the focus waits for the next resize too.
  const onBlur = () => {
    win.setTimeout(update, 0);
  };

  view.addEventListener('resize', update);
  view.addEventListener('scroll', update);
  editor.on('focus', update);
  editor.on('blur', onBlur);
  update();
  return () => {
    view.removeEventListener('resize', update);
    view.removeEventListener('scroll', update);
    editor.off('focus', update);
    editor.off('blur', onBlur);
    if (on) root.removeAttribute(ATTR);
    root.style.removeProperty(INSET);
  };
}
