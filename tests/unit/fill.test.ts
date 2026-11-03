import { Editor, type AnyExtension } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { TYPING_PAUSE_MS, TypingState } from '@/features/editor/extensions/textFill';
import {
  FILL_PRESETS,
  colorAt,
  fillStyle,
  gradientCss,
  parseFill,
  weakestStop,
  type TextFill,
} from '@/features/editor/format/fill';
import { removeLook, saveLook, savedLooks } from '@/features/editor/format/savedLooks';
import { poemDataFromDoc, poemDataToJSON } from '@/features/editor/poemText';

const GOLD: TextFill = {
  stops: [
    { color: '#8a6316', at: 0 },
    { color: '#fff0b3', at: 50 },
    { color: '#7a5512', at: 100 },
  ],
  angle: 90,
  look: 'metallic',
  shimmer: true,
  speed: 6,
};

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  localStorage.clear();
  vi.useRealTimers();
});

function mount(kind: 'prose' | 'poem', doc = new Y.Doc(), extra: AnyExtension[] = []) {
  const host = document.createElement('div');
  document.body.append(host);
  const base = kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc);
  const editor = new Editor({ element: host, extensions: [...base, ...extra] });
  editors.push(editor);
  return editor;
}

describe('fill data', () => {
  test('every preset is a valid fill that reads back unchanged', () => {
    expect(FILL_PRESETS).toHaveLength(16);
    for (const p of FILL_PRESETS) expect(parseFill(p.fill), p.name).toEqual(p.fill);
  });

  test('untrusted values are cleaned: colors must parse, places and speed are bounded, stops are sorted', () => {
    const fill = parseFill({
      stops: [
        { color: 'red; background: url(x)', at: 10 },
        { color: '#ABC', at: 140 },
        { color: 'rgb(1, 2, 3)', at: -5 },
      ],
      angle: -90,
      look: 'sparkly',
      shimmer: 'yes',
      speed: 99,
    });
    expect(fill).toEqual({
      stops: [
        { color: '#010203', at: 0 },
        { color: '#aabbcc', at: 100 },
      ],
      angle: 270,
      look: 'gradient',
      shimmer: false,
      speed: 12,
    });
    expect(parseFill({ stops: [{ color: '#fff', at: 0 }] })).toBeNull();
    expect(parseFill('linear-gradient(red, blue)')).toBeNull();
  });

  test('the CSS names only the cleaned values', () => {
    expect(gradientCss(GOLD)).toBe('linear-gradient(90deg, #8a6316 0%, #fff0b3 50%, #7a5512 100%)');
    expect(fillStyle(GOLD)).toBe(
      '--vlo-fill: linear-gradient(90deg, #8a6316 0%, #fff0b3 50%, #7a5512 100%); --vlo-fill-glow: #fff0b3; --vlo-fill-speed: 6s',
    );
  });

  test('a new stop takes the color the gradient has at its place', () => {
    const fill: TextFill = {
      ...GOLD,
      stops: [
        { color: '#000000', at: 0 },
        { color: '#ffffff', at: 100 },
      ],
    };
    expect(colorAt(fill, 50)).toBe('#808080');
    expect(colorAt(fill, 0)).toBe('#000000');
    expect(colorAt(fill, 100)).toBe('#ffffff');
  });

  test('the contrast check names the weakest stop on the current page', () => {
    expect(weakestStop(GOLD, 'paper')?.stop.color).toBe('#fff0b3');
    expect(weakestStop(GOLD, 'ink')?.stop.color).toBe('#7a5512');
    expect(weakestStop(GOLD, 'paper')?.ratio).toBeLessThan(1.5);
  });

  test('saved looks keep their name, replace a same-named look and can be removed', () => {
    saveLook('Moonlit gold', GOLD);
    saveLook('Other', { ...GOLD, look: 'glow' });
    saveLook('Moonlit gold', { ...GOLD, angle: 45 });
    expect(savedLooks().map((l) => [l.name, l.fill.angle])).toEqual([
      ['Moonlit gold', 45],
      ['Other', 90],
    ]);
    expect(removeLook('Other').map((l) => l.name)).toEqual(['Moonlit gold']);
  });
});

describe('the textFill mark', () => {
  test('survives save and reload through Yjs and renders its class and style', () => {
    const doc = new Y.Doc();
    const e = mount('prose', doc);
    e.commands.setContent('<p>gold leaf</p>');
    e.commands.setTextSelection({ from: 1, to: 5 });
    expect(e.commands.setTextFill(GOLD)).toBe(true);
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    expect(mount('prose', copy).getJSON()).toEqual(e.getJSON());
    const span = e.view.dom.querySelector('span[data-fill]');
    expect(span?.className).toBe('vlo-fill vlo-fill-metallic vlo-fill-shimmer');
    expect(span?.getAttribute('style')).toContain('--vlo-fill-speed: 6s');
  });

  test('text typed at the end of a filled run joins it (Review Focus 1)', () => {
    const e = mount('prose');
    e.commands.setContent('<p>gold</p>');
    e.commands.selectAll();
    e.commands.setTextFill(GOLD);
    e.commands.setTextSelection(5);
    e.commands.insertContent('en');
    expect(e.view.dom.querySelector('span[data-fill]')?.textContent).toBe('golden');
  });

  test('the text gets its own paint layer class only while it has a fill', () => {
    const e = mount('prose');
    e.commands.setContent('<p>gold leaf</p>');
    expect(e.view.dom.classList.contains('vlo-has-fill')).toBe(false);
    e.commands.setTextSelection({ from: 1, to: 5 });
    e.commands.setTextFill(GOLD);
    expect(e.view.dom.classList.contains('vlo-has-fill')).toBe(true);
    e.commands.selectAll();
    e.commands.unsetTextFill();
    expect(e.view.dom.classList.contains('vlo-has-fill')).toBe(false);
  });

  test('pasted HTML with a broken fill keeps the text and drops the fill', () => {
    const e = mount('prose');
    e.commands.setContent('<p><span data-fill="{&quot;stops&quot;:1}">plain</span></p>');
    expect(e.getHTML()).toBe('<p>plain</p>');
  });

  test('a fill in a poem keeps every space and the hanging indent', () => {
    const e = mount('poem');
    const poem = [[{ text: '   shine   on', hanging: 2 }]];
    e.commands.setContent(poemDataToJSON(poem));
    e.commands.selectAll();
    e.commands.setTextFill(GOLD);
    expect(poemDataFromDoc(e.state.doc)).toEqual(poem);
    e.commands.unsetTextFill();
    expect(e.isActive('textFill')).toBe(false);
    expect(poemDataFromDoc(e.state.doc)).toEqual(poem);
  });
});

test('typing marks the page as typing, and the mark goes 1.5 s after the last key', () => {
  vi.useFakeTimers();
  const e = mount('prose', new Y.Doc(), [TypingState]);
  const root = document.documentElement;
  e.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  expect(root.dataset.typing).toBe('true');
  vi.advanceTimersByTime(TYPING_PAUSE_MS - 100);
  e.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
  vi.advanceTimersByTime(TYPING_PAUSE_MS - 100);
  expect(root.dataset.typing).toBe('true');
  vi.advanceTimersByTime(200);
  expect(root.dataset.typing).toBeUndefined();
});
