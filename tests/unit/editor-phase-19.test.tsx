import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { targetLabel } from '@/features/binder/BinderItem';
import { parseTarget, setItemTarget } from '@/features/binder/items';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { MAX_PLACES, placeOf, restorePlace, savePlace } from '@/features/editor/lastPlace';
import { keyboardInset, KEYBOARD_MIN_PX, watchPhoneTyping } from '@/features/editor/phoneTyping';
import { targetShare } from '@/features/editor/TargetRing';
import {
  cleanPageLook,
  getWritingPrefs,
  PAGE_WIDTH_MAX,
  setWritingPrefs,
  WRITING_DEFAULTS,
} from '@/features/editor/writingPrefs';

/* Phase 19, Part A: the last place, phone typing, page look and item targets. */

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  localStorage.clear();
  setWritingPrefs({ ...WRITING_DEFAULTS });
});

function editorOn(doc: Y.Doc, content?: string): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({ element, extensions: proseExtensions(doc) });
  if (content !== undefined) editor.commands.setContent(content);
  editors.push(editor);
  return editor;
}

/** The text of the selection's paragraph from the caret on, so a test reads where the caret is. */
function afterCaret(editor: Editor): string {
  const { $head } = editor.state.selection;
  return $head.parent.textContent.slice($head.parentOffset);
}

describe('the last place in an item (Task A2)', () => {
  test('an item opens with the caret where the writer left it', () => {
    const doc = new Y.Doc();
    const first = editorOn(doc, '<p>The harbour lights came on.</p><p>Mara counted them.</p>');
    const at = first.state.doc.textContent.indexOf('counted');
    // Text positions count one more for each paragraph start.
    first.commands.setTextSelection(at + 3);
    expect(afterCaret(first)).toBe('counted them.');
    savePlace('item-1', first);

    const again = editorOn(doc);
    expect(restorePlace('item-1', again)).toBe(true);
    expect(afterCaret(again)).toBe('counted them.');
  });

  test('an edit before the caret in another editor keeps the caret on the same words', () => {
    const doc = new Y.Doc();
    const first = editorOn(doc, '<p>Mara counted them.</p>');
    first.commands.setTextSelection(1 + 'Mara '.length);
    savePlace('item-1', first);
    first.commands.insertContentAt(1, 'Late at night, ');

    const again = editorOn(doc);
    restorePlace('item-1', again);
    expect(afterCaret(again)).toBe('counted them.');
  });

  test('an item with no place, or a damaged store, gives no place', () => {
    const editor = editorOn(new Y.Doc(), '<p>Words.</p>');
    expect(restorePlace('none', editor)).toBe(false);
    localStorage.setItem('vlo:places', '{damaged');
    expect(placeOf('none', editor)).toBeNull();
  });

  test('the store keeps only the newest places', () => {
    const editor = editorOn(new Y.Doc(), '<p>Words.</p>');
    const now = vi.spyOn(Date, 'now');
    for (let i = 0; i <= MAX_PLACES; i++) {
      now.mockReturnValue(1_000_000 + i);
      savePlace(`item-${String(i)}`, editor);
    }
    const kept = Object.keys(JSON.parse(localStorage.getItem('vlo:places') ?? '{}') as object);
    expect(kept).toHaveLength(MAX_PLACES);
    expect(kept).not.toContain('item-0');
  });
});

describe('phone typing (Task A1)', () => {
  test('the keyboard inset is the gap under the visual viewport', () => {
    expect(keyboardInset({ height: 400, offsetTop: 0 }, 800)).toBe(400);
    expect(keyboardInset({ height: 380, offsetTop: 20 }, 800)).toBe(400);
    expect(keyboardInset({ height: 900, offsetTop: 0 }, 800)).toBe(0);
  });

  test('an open keyboard on a touch screen hides the rows above the text, and a closed one shows them', () => {
    const editor = editorOn(new Y.Doc(), '<p>Words.</p>');
    const view = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    const win = {
      visualViewport: view,
      innerHeight: 800,
      document,
      matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' }),
      requestAnimationFrame: (run: () => void) => {
        run();
        return 0;
      },
      setTimeout: (run: () => void) => {
        run();
        return 0;
      },
    } as unknown as Window;
    vi.spyOn(editor.view, 'hasFocus').mockReturnValue(true);
    const stop = watchPhoneTyping(editor, win);
    const root = document.documentElement;
    expect(root.hasAttribute('data-vlo-typing')).toBe(false);

    view.height = 800 - KEYBOARD_MIN_PX - 200;
    view.dispatchEvent(new Event('resize'));
    expect(root.hasAttribute('data-vlo-typing')).toBe(true);
    expect(root.style.getPropertyValue('--vlo-keyboard-inset')).toBe(`${String(KEYBOARD_MIN_PX + 200)}px`);

    view.height = 800;
    view.dispatchEvent(new Event('resize'));
    expect(root.hasAttribute('data-vlo-typing')).toBe(false);
    stop();
  });

  test('a mouse and keyboard screen never starts phone typing', () => {
    const editor = editorOn(new Y.Doc(), '<p>Words.</p>');
    const win = {
      visualViewport: Object.assign(new EventTarget(), { height: 300, offsetTop: 0 }),
      innerHeight: 800,
      document,
      matchMedia: () => ({ matches: false }),
    } as unknown as Window;
    vi.spyOn(editor.view, 'hasFocus').mockReturnValue(true);
    watchPhoneTyping(editor, win)();
    expect(document.documentElement.hasAttribute('data-vlo-typing')).toBe(false);
  });
});

describe('page look (Task A3)', () => {
  test('a look of parts in range is kept, and a damaged one is refused', () => {
    const look = { pageWidth: 64, paragraphs: 'indented', screenFont: 'literata', lineHeight: 2 };
    expect(cleanPageLook(look)).toEqual(look);
    expect(cleanPageLook({ ...look, screenFont: null })).toEqual({ ...look, screenFont: null });
    expect(cleanPageLook({ ...look, pageWidth: PAGE_WIDTH_MAX + 2 })).toBeNull();
    expect(cleanPageLook({ ...look, paragraphs: 'double' })).toBeNull();
    expect(cleanPageLook({ ...look, lineHeight: 5 })).toBeNull();
    expect(cleanPageLook('Book')).toBeNull();
  });

  test('the look and the saved looks stay after a reload, and a damaged saved look goes', async () => {
    setWritingPrefs({ pageWidth: 60, paragraphs: 'airy', screenFont: 'inter' });
    const stored = JSON.parse(localStorage.getItem('vlo:writing') ?? '{}') as Record<string, unknown>;
    stored.looks = [
      { name: 'Night', pageWidth: 60, paragraphs: 'airy', screenFont: 'inter', lineHeight: 2 },
      { name: 'Broken', pageWidth: 'wide', paragraphs: 'airy', screenFont: null, lineHeight: 2 },
    ];
    localStorage.setItem('vlo:writing', JSON.stringify(stored));
    vi.resetModules();
    const fresh = await import('@/features/editor/writingPrefs');
    const prefs = fresh.getWritingPrefs();
    expect([prefs.pageWidth, prefs.paragraphs, prefs.screenFont]).toEqual([60, 'airy', 'inter']);
    expect(prefs.looks.map((l) => l.name)).toEqual(['Night']);
  });

  test('the page width from before Phase 19 comes along', async () => {
    localStorage.clear();
    localStorage.setItem('vlo:pageWidth', '80');
    vi.resetModules();
    const fresh = await import('@/features/editor/writingPrefs');
    expect(fresh.getWritingPrefs().pageWidth).toBe(80);
    expect(getWritingPrefs().pageWidth).toBe(WRITING_DEFAULTS.pageWidth);
  });
});

describe('item targets (Task A4)', () => {
  test('the field reads whole numbers with group marks, and refuses anything else', () => {
    expect(parseTarget('')).toBeNull();
    expect(parseTarget(' 2000 ')).toBe(2000);
    expect(parseTarget('2,000')).toBe(2000);
    expect(parseTarget('2 000')).toBe(2000);
    expect(parseTarget('2.000')).toBe(2000);
    expect(parseTarget('2.5')).toBeNaN();
    expect(parseTarget('0')).toBeNaN();
    expect(parseTarget('-5')).toBeNaN();
    expect(parseTarget('lots')).toBeNaN();
    expect(parseTarget('20000000')).toBeNaN();
  });

  test('a target out of range is refused before the store', async () => {
    await expect(setItemTarget('x', 0)).rejects.toThrow(RangeError);
    await expect(setItemTarget('x', 1.5)).rejects.toThrow(RangeError);
  });

  test('the ring and the binder say how far the item is', () => {
    expect(targetShare(500, 2000)).toBe(0.25);
    expect(targetShare(2500, 2000)).toBe(1);
    expect(targetLabel(500, 2000)).toBe('25% of 2,000');
    expect(targetLabel(2000, 2000)).toBe('Target met');
  });
});
