import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, describe, expect, test } from 'vitest';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { parsePlay, playClass, playStyle } from '@/features/editor/format/typePlay';
import { poemDataFromDoc, poemDataToJSON } from '@/features/editor/poemText';
import { itemBlocks, noteCounter } from '@/features/export/read';
import { exportNotices } from '@/features/export/notices';
import type { ExportDoc } from '@/features/export/model';

/* Type play: weight, letter spacing, design axes, an effect and a motion on the typePlay mark. */

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

describe('Type play data', () => {
  test('keeps checked values and drops the rest', () => {
    expect(
      parsePlay({
        weight: 823,
        tracking: 0.123,
        axes: { SOFT: 140, CASL: 0.5, 'x;color:red': 1 },
        effect: 'echo',
        motion: 'spin',
      }),
    ).toEqual({ weight: 820, tracking: 0.12, axes: { SOFT: 100, CASL: 0.5 }, effect: 'echo' });
    expect(parsePlay({ weight: 5, tracking: -3 })).toEqual({ weight: 100, tracking: -0.05 });
    expect(parsePlay({ tracking: 0, axes: { nope: 1 } })).toBeNull();
    expect(parsePlay('weight: 900')).toBeNull();
    expect(parsePlay(null)).toBeNull();
  });

  test('writes only its own properties into the style', () => {
    const play = { weight: 640, tracking: 0.1, axes: { SOFT: 50, WONK: 1 }, effect: 'outline' as const };
    expect(playStyle(play)).toBe(
      "font-weight: 640; letter-spacing: 0.1em; font-variation-settings: 'SOFT' 50, 'WONK' 1",
    );
    expect(playClass({ ...play, motion: 'breathe' })).toBe('vlo-play vlo-play-outline vlo-play-breathe');
  });
});

describe('the typePlay mark', () => {
  test('survives save and reload through Yjs, and an empty play removes the mark', () => {
    const doc = new Y.Doc();
    const e = mount('prose', doc);
    e.commands.setContent('<p>the hollow crown</p>');
    e.commands.setTextSelection({ from: 5, to: 11 });
    expect(e.commands.setTypePlay({ weight: 900, motion: 'flicker' })).toBe(true);
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    expect(mount('prose', copy).getJSON()).toEqual(e.getJSON());
    const span = e.view.dom.querySelector('span[data-play]');
    expect(span?.textContent).toBe('hollow');
    expect(span?.className).toBe('vlo-play vlo-play-flicker');
    expect(span?.getAttribute('style')).toBe('font-weight: 900;');

    e.commands.setTypePlay({});
    expect(e.isActive('typePlay')).toBe(false);
  });

  test('pasted HTML with a bad play keeps only the text', () => {
    const e = mount('prose');
    e.commands.setContent(
      '<p><span data-play="{&quot;weight&quot;:&quot;900;color:red&quot;}">plain</span></p>',
    );
    expect(e.getHTML()).toBe('<p>plain</p>');
  });

  test('a poem keeps every space with Type play on and off', () => {
    const e = mount('poem');
    const poem = [[{ text: '   slow   light', hanging: 2 }]];
    e.commands.setContent(poemDataToJSON(poem));
    e.commands.selectAll();
    e.commands.setTypePlay({ tracking: 0.2, effect: 'engraved' });
    expect(poemDataFromDoc(e.state.doc)).toEqual(poem);
    e.commands.unsetTypePlay();
    expect(e.isActive('typePlay')).toBe(false);
    expect(poemDataFromDoc(e.state.doc)).toEqual(poem);
  });

  test('Clear formatting removes Type play', () => {
    const e = mount('prose');
    e.commands.setContent('<p>ember</p>');
    e.commands.selectAll();
    e.commands.setTypePlay({ effect: 'lifted' });
    e.commands.clearFormatting();
    expect(e.isActive('typePlay')).toBe(false);
  });
});

describe('exports', () => {
  test('a heavy weight becomes bold, and the notice says what stays in Vlo', () => {
    const e = mount('prose');
    e.commands.setContent('<p>light heavy</p>');
    e.commands.setTextSelection({ from: 1, to: 6 });
    e.commands.setTypePlay({ weight: 300, effect: 'echo' });
    e.commands.setTextSelection({ from: 7, to: 12 });
    e.commands.setTypePlay({ weight: 700 });
    const blocks = itemBlocks(e.getJSON(), 'prose', noteCounter());
    const paragraph = blocks[0];
    if (paragraph?.type !== 'paragraph') throw new Error('Expected a paragraph');
    const styles = paragraph.runs.flatMap((run) => (run.type === 'text' ? [run.style] : []));
    expect(styles[0]).toEqual({ play: true });
    expect(styles.at(-1)).toEqual({ play: true, bold: true });

    const doc = { font: 'newsreader', sections: [{ blocks }] } as unknown as ExportDoc;
    expect(exportNotices(doc, 'markdown')).toContain(
      'Type play stays in Vlo. The file keeps a heavy weight as bold, and draws the letters without their spacing, effects and motion.',
    );
  });
});
