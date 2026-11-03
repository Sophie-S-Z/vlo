import { Editor } from '@tiptap/core';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import {
  BASE_STACK,
  cleanFontName,
  cleanFontValue,
  DEFAULT_FONT,
  FONT_GROUPS,
  fontLabel,
  fontStack,
  localFont,
  localFontName,
  VLO_FONTS,
} from '@/features/editor/format/fonts';
import {
  canListFonts,
  fontSeemsInstalled,
  listInstalledFonts,
  recentOwnFonts,
  rememberOwnFont,
} from '@/features/editor/format/ownFonts';
import { poemDataFromDoc } from '@/features/editor/poemText';

/* Task A7: the 20 Vlo fonts, the writer's own fonts and the font attribute. */

const require = createRequire(import.meta.url);

/** Every font-family that the app's font CSS files declare, read from the packages they import. */
function declaredFamilies(): Set<string> {
  const families = new Set<string>();
  for (const sheet of ['src/styles/fonts.css', 'src/styles/index.css']) {
    const css = readFileSync(sheet, 'utf8');
    for (const [, path] of css.matchAll(/@import '(@fontsource[^']+)'/g)) {
      const source = readFileSync(require.resolve(path ?? ''), 'utf8');
      for (const [, family] of source.matchAll(/font-family:\s*'([^']+)'/g)) families.add(family ?? '');
    }
  }
  return families;
}

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

/** The CSS font list on the text with the stored font `value`. */
function fontOf(editor: Editor, value: string): string {
  const host = document.createElement('div');
  host.innerHTML = editor.getHTML();
  const span = [...host.querySelectorAll<HTMLElement>('span[data-font]')].find(
    (s) => s.dataset.font === value,
  );
  return span?.style.fontFamily ?? '';
}

function mount(kind: 'prose' | 'poem', doc = new Y.Doc()): Editor {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new Editor({
    element: host,
    extensions: kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc),
  });
  editors.push(editor);
  return editor;
}

describe('the Vlo font list', () => {
  test('has 20 fonts with unique ids in the six groups, and the default is one of them', () => {
    expect(VLO_FONTS).toHaveLength(20);
    expect(new Set(VLO_FONTS.map((f) => f.id)).size).toBe(20);
    expect(new Set(VLO_FONTS.map((f) => f.label)).size).toBe(20);
    for (const group of FONT_GROUPS) {
      expect(VLO_FONTS.some((f) => f.group === group)).toBe(true);
    }
    expect(VLO_FONTS.map((f) => f.id)).toContain(DEFAULT_FONT);
  });

  test('every font family has @font-face rules from the imported font packages', () => {
    const families = declaredFamilies();
    for (const font of VLO_FONTS) expect(families, font.label).toContain(font.family);
  });

  test('the font CSS imports only files from the 20 fonts', () => {
    const css = readFileSync('src/styles/fonts.css', 'utf8');
    const packages = [...css.matchAll(/@import '(@fontsource(?:-variable)?\/[^/]+)\//g)].map((m) => m[1]);
    const allowed = new Set([
      ...VLO_FONTS.map((f) => f.id),
      'jetbrains-mono',
      'inter',
      'fraunces',
      'newsreader',
      'atkinson-hyperlegible-next',
    ]);
    for (const name of packages) expect(allowed).toContain(name?.split('/')[1]);
  });
});

describe('font values', () => {
  test('a font name loses the characters that could break out of CSS', () => {
    expect(cleanFontName(`  My "Font";}body{color:red<b>  `)).toBe('My Fontbodycolor:redb');
    expect(cleanFontName('a'.repeat(300))).toHaveLength(100);
    expect(localFont('  Georgia  ')).toBe('local:Georgia');
    expect(localFont(`"';`)).toBeNull();
    expect(localFontName('local:Georgia')).toBe('Georgia');
    expect(localFontName('lora')).toBeNull();
  });

  test('a stored value is a Vlo font id or a cleaned installed font, and nothing else', () => {
    expect(cleanFontValue('lora')).toBe('lora');
    expect(cleanFontValue('local:Optima')).toBe('local:Optima');
    expect(cleanFontValue("local:Opt'ima;")).toBe('local:Optima');
    expect(cleanFontValue('local:')).toBeNull();
    expect(cleanFontValue('Comic Sans')).toBeNull();
    expect(cleanFontValue(42)).toBeNull();
    expect(cleanFontValue(null)).toBeNull();
  });

  test('the CSS font list falls back to the project font, or to Vlo’s own font for the project itself', () => {
    expect(fontStack('lora')).toBe("'Lora Variable', serif");
    expect(fontStack('courier-prime')).toBe("'Courier Prime', monospace");
    expect(fontStack('local:Optima')).toBe("'Optima', var(--font-manuscript)");
    expect(fontStack('local:Optima', BASE_STACK)).toBe(`'Optima', ${BASE_STACK}`);
    expect(fontStack('unknown', BASE_STACK)).toBe(BASE_STACK);
    expect(fontLabel('eb-garamond')).toBe('EB Garamond');
    expect(fontLabel('local:Optima')).toBe('Optima');
  });
});

describe('the font attribute', () => {
  test('a Vlo font and an installed font survive save and reload, and unsetFont removes the font', () => {
    const doc = new Y.Doc();
    const e = mount('prose', doc);
    e.commands.setContent('<p>quiet rain falls</p>');
    e.commands.setTextSelection({ from: 1, to: 6 });
    expect(e.commands.setFont('caveat')).toBe(true);
    e.commands.setTextSelection({ from: 7, to: 11 });
    e.commands.setFont('local:Optima');
    // A value that is neither a Vlo font nor an installed font changes nothing.
    expect(e.commands.setFont('Comic Sans')).toBe(false);

    expect(fontOf(e, 'caveat')).toMatch(/^["']Caveat Variable["'], cursive$/);
    expect(fontOf(e, 'local:Optima')).toMatch(/^["']?Optima["']?, var\(--font-manuscript\)$/);

    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    expect(mount('prose', copy).getJSON()).toEqual(e.getJSON());

    e.commands.setTextSelection({ from: 1, to: 6 });
    e.commands.unsetFont();
    expect(e.getHTML()).not.toContain('caveat');
  });

  test('pasted HTML keeps a known font and drops an unknown one', () => {
    const e = mount('prose');
    e.commands.setContent(
      `<p><span data-font="lora" style="font-family: 'Lora Variable', serif">one</span> <span data-font="evil;}" style="font-family: Evil">two</span></p>`,
    );
    const html = e.getHTML();
    expect(html).toContain('data-font="lora"');
    expect(html).not.toContain('evil');
    expect(html).not.toContain('Evil');
  });

  test('a font in a poem line keeps its leading and inner spaces', () => {
    const e = mount('poem');
    e.commands.insertContent('   the   sea');
    e.commands.setTextSelection({ from: 5, to: 8 });
    e.commands.setFont('im-fell-english');
    expect(poemDataFromDoc(e.state.doc)).toEqual([[{ text: '   the   sea', hanging: 0 }]]);
    expect(e.getHTML()).toContain('data-font="im-fell-english"');
  });
});

describe('own fonts on this device', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
  });

  test('recent own fonts keep the newest first, without repeats, up to 8', () => {
    expect(recentOwnFonts()).toEqual([]);
    rememberOwnFont('Optima');
    rememberOwnFont('Avenir');
    expect(rememberOwnFont('optima')).toEqual(['optima', 'Avenir']);
    for (let i = 0; i < 10; i++) rememberOwnFont(`Font ${String(i)}`);
    expect(recentOwnFonts()).toHaveLength(8);
    expect(recentOwnFonts()[0]).toBe('Font 9');
    localStorage.setItem('vlo:own-fonts', '{"broken":');
    expect(recentOwnFonts()).toEqual([]);
  });

  test('installed fonts are listed by family, once each, in name order', async () => {
    expect(canListFonts()).toBe(false);
    expect(await listInstalledFonts()).toEqual({ error: 'unsupported' });
    (window as unknown as { queryLocalFonts: unknown }).queryLocalFonts = vi.fn(() =>
      Promise.resolve([{ family: 'Optima' }, { family: 'Avenir' }, { family: 'Optima' }, { family: '"' }]),
    );
    expect(canListFonts()).toBe(true);
    expect(await listInstalledFonts()).toEqual({ fonts: ['Avenir', 'Optima'] });
  });

  test('a refused font list says so', async () => {
    (window as unknown as { queryLocalFonts: unknown }).queryLocalFonts = vi.fn(() =>
      Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    );
    expect(await listInstalledFonts()).toEqual({ error: 'denied' });
  });

  test('a typed font counts as installed when its drawn width differs from the fallback', () => {
    const fake = { font: '', measureText: () => ({ width: fake.font.includes('Optima') ? 120 : 100 }) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      fake as unknown as CanvasRenderingContext2D,
    );
    expect(fontSeemsInstalled('Optima')).toBe(true);
    expect(fontSeemsInstalled('Not A Font')).toBe(false);
    expect(fontSeemsInstalled('')).toBe(false);
  });

  test('a browser that cannot draw gives no answer', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(fontSeemsInstalled('Optima')).toBeNull();
  });
});
