import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { parsePoemText, poemDataToJSON } from '@/features/editor/poemText';
import { FocusTools } from '@/features/focus/focusExtension';
import { DIM_CLASS, refreshFocus, typewriterTarget } from '@/features/focus/focusPlugin';
import { getFocusPrefs, reloadFocusPrefs, setFocusPrefs } from '@/features/focus/focusPrefs';

let editor: Editor;

function mount(kind: 'prose' | 'poem') {
  const host = document.createElement('div');
  document.body.append(host);
  const doc = new Y.Doc();
  editor = new Editor({
    element: host,
    extensions: [
      ...(kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc)),
      FocusTools,
    ],
  });
}

/** For each block, true when it is dimmed. Poems give one entry per line. */
function dimmed(selector: string) {
  return [...editor.view.dom.querySelectorAll(selector)].map((el) => el.classList.contains(DIM_CLASS));
}

beforeEach(() => {
  localStorage.clear();
  reloadFocusPrefs();
});
afterEach(() => {
  editor.destroy();
  document.body.replaceChildren();
  localStorage.clear();
});

describe('focus-line dimming', () => {
  test('with dimming off, nothing dims', () => {
    mount('prose');
    editor.commands.setContent('<p>One</p><p>Two</p><p>Three</p>');
    expect(dimmed('p')).toEqual([false, false, false]);
  });

  test('with dimming on, only the block with the cursor stays bright, and it follows the cursor', () => {
    setFocusPrefs({ dim: true });
    mount('prose');
    editor.commands.setContent('<p>One</p><p>Two</p><p>Three</p>');
    editor.commands.setTextSelection(7); // inside "Two"
    expect(dimmed('p')).toEqual([true, false, true]);
    editor.commands.setTextSelection(2); // inside "One"
    expect(dimmed('p')).toEqual([false, true, true]);
  });

  test('typing in the bright block keeps the others dim, and Enter moves the light to the new block', () => {
    setFocusPrefs({ dim: true });
    mount('prose');
    editor.commands.setContent('<p>One</p><p>Two</p>');
    editor.commands.setTextSelection(4);
    editor.commands.insertContent('s');
    expect(dimmed('p')).toEqual([false, true]);
    editor.commands.splitBlock();
    expect(dimmed('p')).toEqual([true, false, true]);
  });

  test('a poem dims line by line', () => {
    setFocusPrefs({ dim: true });
    mount('poem');
    editor.commands.setContent(poemDataToJSON(parsePoemText('Salt\nTide\n\nKettle\n')));
    editor.commands.setTextSelection(9); // inside "Tide"
    expect(dimmed('[data-poem-line]')).toEqual([true, false, true]);
  });

  test('switching dimming off and refreshing clears it at once', () => {
    setFocusPrefs({ dim: true });
    mount('prose');
    editor.commands.setContent('<p>One</p><p>Two</p>');
    setFocusPrefs({ dim: false });
    editor.view.dispatch(refreshFocus(editor.state.tr));
    expect(dimmed('p')).toEqual([false, false]);
  });
});

describe('typewriter scrolling', () => {
  test('the scroll target puts the caret line at the vertical center', () => {
    // Caret from 700 to 730 in an 800 px viewport scrolled to 1000: its middle (715) must move to 400.
    expect(typewriterTarget(700, 730, 800, 1000)).toBe(1315);
  });

  test('with a phone keyboard open, the caret goes to the middle of the part above it', () => {
    // A 300 px visible area that starts 100 px down: its middle is at 250.
    expect(typewriterTarget(700, 730, 300, 1000, 100)).toBe(1465);
  });

  test('the target never goes above the top of the page', () => {
    expect(typewriterTarget(10, 40, 800, 0)).toBe(0);
  });
});

test('focus switches persist on this device', () => {
  setFocusPrefs({ typewriter: true });
  reloadFocusPrefs();
  expect(getFocusPrefs()).toEqual({ typewriter: true, dim: false });
});
