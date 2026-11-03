import { Editor, type JSONContent } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import { normalizeHref } from '@/features/editor/toolbar/panels/LinkPanel';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { swatchVar } from '@/features/editor/format/palette';
import { parsePoemText, poemDataFromDoc, poemDataToJSON } from '@/features/editor/poemText';

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

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

/** The same document as a second device or a reload sees it: only the Yjs update crosses over. */
function reload(kind: 'prose' | 'poem', doc: Y.Doc): JSONContent {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return mount(kind, copy).getJSON();
}

describe('prose formats', () => {
  test('every mark and block style survives save and reload through Yjs', () => {
    const doc = new Y.Doc();
    const e = mount('prose', doc);
    e.commands.setContent('<p>alpha beta gamma delta epsilon</p><p>zeta</p>');
    const word = (n: number) => {
      const start =
        1 + 'alpha beta gamma delta epsilon'.split(' ').slice(0, n).join(' ').length + (n ? 1 : 0);
      const length = 'alpha beta gamma delta epsilon'.split(' ')[n]?.length ?? 0;
      e.commands.setTextSelection({ from: start, to: start + length });
    };
    word(0);
    e.commands.toggleSuperscript();
    word(1);
    e.commands.toggleSubscript();
    word(2);
    e.commands.setHighlight({ color: swatchVar('mark', 'mint') });
    word(3);
    e.chain().setColor(swatchVar('text', 'iris')).setFontSize('1.5em').run();
    word(4);
    e.chain().setColor('#3a7bd5').toggleStrike().run();
    e.commands.setTextSelection(2);
    e.chain().setTextAlign('justify').setLineSpacing(2).toggleFirstLineIndent().toggleDropCap().run();

    const before = e.getJSON();
    expect(reload('prose', doc)).toEqual(before);
    const html = e.getHTML();
    expect(html).toContain('<sup>alpha</sup>');
    expect(html).toContain('<sub>beta</sub>');
    expect(html).toContain('data-color="var(--vlo-mark-mint)"');
    expect(html).toContain('color: var(--vlo-text-iris)');
    expect(html).toContain('font-size: 1.5em');
    expect(html).toContain('data-line-spacing="2"');
    expect(html).toContain('line-height: 2.3');
    expect(html).toContain('data-indent="first"');
    expect(html).toContain('data-drop-cap="true"');
    expect(html).toContain('text-align: justify');
  });

  test('superscript and subscript replace each other', () => {
    const e = mount('prose');
    e.commands.setContent('<p>H2O</p>');
    e.commands.setTextSelection({ from: 2, to: 3 });
    e.commands.toggleSuperscript();
    e.commands.toggleSubscript();
    expect(e.isActive('subscript')).toBe(true);
    expect(e.isActive('superscript')).toBe(false);
  });

  test('clear formatting removes marks and resets the block styles of the selection', () => {
    const e = mount('prose');
    e.commands.setContent(
      '<p style="text-align: center" data-line-spacing="1.5" data-indent="first" data-drop-cap="true"><strong>loud</strong> <mark data-color="#f3e27e">lit</mark></p>',
    );
    e.commands.selectAll();
    e.commands.clearFormatting();
    expect(e.getHTML()).toBe('<p>loud lit</p>');
  });

  test('pasted HTML keeps the stored formats', () => {
    const e = mount('prose');
    e.commands.setContent(
      '<p data-line-spacing="1.15" style="line-height: 1.32"><span style="color: var(--vlo-text-rose); font-size: 0.85em">small rose</span></p>',
    );
    expect(e.getAttributes('paragraph').lineSpacing).toBe(1.15);
    e.commands.setTextSelection(3);
    expect(e.getAttributes('textStyle')).toMatchObject({ color: 'var(--vlo-text-rose)', fontSize: '0.85em' });
  });

  test('a line spacing that Vlo does not offer reads as the default', () => {
    const e = mount('prose');
    e.commands.setContent('<p data-line-spacing="7">wide</p>');
    expect(e.getAttributes('paragraph').lineSpacing).toBeNull();
  });
});

describe('poem formats', () => {
  test('inline formats keep every leading and inner space, and survive reload', () => {
    const doc = new Y.Doc();
    const e = mount('poem', doc);
    const poem = parsePoemText('    salt   on the sill\n  tide\n');
    e.commands.setContent(poemDataToJSON(poem));
    e.commands.setTextSelection({ from: 3, to: 12 });
    e.chain()
      .toggleBold()
      .setColor(swatchVar('text', 'teal'))
      .setHighlight({ color: '#a3daf5' })
      .toggleSuperscript()
      .run();
    expect(poemDataFromDoc(e.state.doc)).toEqual(poem);
    expect(reload('poem', doc)).toEqual(e.getJSON());
  });

  test('poems have no block tools, so line layout stays exact', () => {
    const e = mount('poem');
    const commands = e.commands as unknown as Record<string, unknown>;
    for (const name of [
      'setTextAlign',
      'setLineSpacing',
      'toggleDropCap',
      'toggleHeading',
      'toggleBulletList',
    ]) {
      expect(commands[name], name).toBeUndefined();
    }
  });

  test('clear formatting in a poem removes marks and keeps hanging indents', () => {
    const e = mount('poem');
    e.commands.setContent(poemDataToJSON([[{ text: '  bold line', hanging: 3 }]]));
    e.commands.selectAll();
    e.commands.toggleBold();
    e.commands.clearFormatting();
    expect(e.isActive('bold')).toBe(false);
    expect(poemDataFromDoc(e.state.doc)).toEqual([[{ text: '  bold line', hanging: 3 }]]);
  });
});

test('link addresses get https:// unless they name their own scheme', () => {
  expect(normalizeHref('example.com/a')).toBe('https://example.com/a');
  expect(normalizeHref(' https://vlo.app ')).toBe('https://vlo.app');
  expect(normalizeHref('mailto:a@b.c')).toBe('mailto:a@b.c');
  expect(normalizeHref('#notes')).toBe('#notes');
  expect(normalizeHref('')).toBe('');
});
