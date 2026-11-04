import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { describe, expect, test } from 'vitest';
import { buildExportDoc, exportFileName, folderOf, scopeItems } from '@/features/export/build';
import { footnotesOf, runsText, type Block, type ParagraphBlock } from '@/features/export/model';
import { itemBlocks, noteCounter, updateToJson } from '@/features/export/read';
import { YFRAGMENT } from '@/lib/ydocs';
import { item, poemUpdate, project, proseUpdate, RICH_PROSE, singleDoc, updateOf } from './export-fixtures';

describe('reading an item document', () => {
  test('gives the same JSON as the editor sync plugin, with hashed mark names cleaned', () => {
    const update = updateOf(RICH_PROSE, 'prose');
    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);
    const expected = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(YFRAGMENT));
    doc.destroy();
    expect(updateToJson(update)).toEqual(expected);
  });

  test('maps every mark to a run style with Paper colors and safe links', () => {
    const exported = singleDoc(RICH_PROSE, 'prose');
    const first = exported.sections[0]?.blocks[1] as ParagraphBlock;
    expect(first).toMatchObject({
      type: 'paragraph',
      align: 'justify',
      lineSpacing: 1.5,
      firstLineIndent: true,
      dropCap: true,
    });
    const styleOf = (text: string) => first.runs.find((r) => r.type === 'text' && r.text === text);
    expect(styleOf('tide')).toMatchObject({ style: { bold: true } });
    expect(styleOf(' turned')).toMatchObject({ style: { italic: true, underline: true } });
    expect(styleOf('gone')).toMatchObject({ style: { strike: true } });
    expect(styleOf(' rose')).toMatchObject({ style: { color: '#c52e48' } });
    expect(styleOf(' marked')).toMatchObject({ style: { highlight: '#f3e27e' } });
    expect(styleOf(' big')).toMatchObject({ style: { size: 1.5, font: 'eb-garamond' } });
    expect(styleOf(' gold')).toMatchObject({ style: { fill: { look: 'metallic', shimmer: true } } });
    expect(styleOf(' site')).toMatchObject({ style: { link: 'https://example.org/a%20b' } });
    expect(styleOf(' bad')).toEqual({ type: 'text', text: ' bad', style: {} });
    expect(first.runs.some((r) => r.type === 'break')).toBe(true);
    expect(first.runs.find((r) => r.type === 'math')).toMatchObject({ latex: '\\frac{a}{b}' });
    expect(runsText(first.runs)).toContain('Once  the tide');
  });

  test('keeps headings one level under the item title, lists, quotes, scene breaks and equations', () => {
    const blocks = singleDoc(RICH_PROSE, 'prose').sections[0]?.blocks ?? [];
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'list',
      'quote',
      'sceneBreak',
      'math',
    ]);
    expect(blocks[2]).toMatchObject({ type: 'heading', level: 3, align: 'center' });
    const list = blocks[3] as Extract<Block, { type: 'list' }>;
    expect(list).toMatchObject({ ordered: true, start: 3 });
    expect(list.items[1]?.[1]).toMatchObject({ type: 'list', ordered: false });
  });

  test('drops empty trailing paragraphs but keeps empty ones between text', () => {
    const blocks = itemBlocks(updateToJson(proseUpdate(['One', '', 'Two', '', ''])), 'prose', noteCounter());
    expect(blocks.map((b) => (b.type === 'paragraph' ? runsText(b.runs) : b.type))).toEqual([
      'One',
      '',
      'Two',
    ]);
  });

  test('reads a poem with every space and its stanzas', () => {
    const blocks = itemBlocks(updateToJson(poemUpdate()), 'poem', noteCounter());
    expect(blocks).toHaveLength(3);
    const lines = blocks.flatMap((b) => (b.type === 'stanza' ? b.lines.map((l) => runsText(l.runs)) : []));
    expect(lines[1]).toBe('    The tide goes out');
    expect(lines[4]).toBe('I keep    the kettle    warm');
  });

  test('caps a hanging indent at 20 em', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'stanza',
          content: [{ type: 'poemLine', attrs: { hanging: 99 }, content: [{ type: 'text', text: 'far' }] }],
        },
      ],
    };
    const blocks = itemBlocks(updateToJson(updateOf(json, 'poem')), 'poem', noteCounter());
    expect(blocks[0]).toMatchObject({ type: 'stanza', lines: [{ hanging: 20 }] });
  });
});

describe('building an export', () => {
  const items = [
    item('part', 'part', 'Part One'),
    item('ch1', 'chapter', 'Chapter One', 'part'),
    item('s1', 'scene', 'Arrival', 'ch1'),
    item('n1', 'note', 'Research', 'ch1'),
    item('s2', 'scene', 'Night', 'ch1'),
    item('ch2', 'chapter', 'Chapter Two', 'part'),
    item('s3', 'scene', 'Morning', 'ch2'),
  ];
  const updates = new Map([
    ['s1', proseUpdate(['First scene.'])],
    ['s2', proseUpdate(['Second scene.'])],
    ['s3', proseUpdate(['Third scene.'])],
    ['n1', proseUpdate(['Never exported.'])],
  ]);

  test('puts the items in binder order, leaves out notes and separates scenes with a break', () => {
    const doc = buildExportDoc({ project: project('novel'), items, scope: { kind: 'project' }, updates });
    const outline = doc.sections.flatMap((s) =>
      s.blocks.map((b) =>
        b.type === 'heading'
          ? `h${String(b.level)}:${runsText(b.runs)}`
          : b.type === 'paragraph'
            ? runsText(b.runs)
            : b.type,
      ),
    );
    expect(outline).toEqual([
      'h1:Part One',
      'h2:Chapter One',
      'First scene.',
      'sceneBreak',
      'Second scene.',
      'h2:Chapter Two',
      'Third scene.',
    ]);
    expect(doc.title).toBe('Salt Year');
    expect(doc.font).toBe('newsreader');
    expect(doc.paper).toBe('letter');
  });

  test('a chapter scope holds the chapter and its scenes, with the chapter as the title', () => {
    expect(scopeItems(items, { kind: 'folder', itemId: 'ch1' }).map((n) => n.item.id)).toEqual([
      'ch1',
      's1',
      's2',
    ]);
    const doc = buildExportDoc({
      project: project('novel'),
      items,
      scope: { kind: 'folder', itemId: 'ch1' },
      updates,
    });
    expect(doc.title).toBe('Chapter One');
    expect(doc.sections[0]?.blocks[0]).toMatchObject({ type: 'heading', level: 2 });
  });

  test('finds the chapter above a scene', () => {
    expect(folderOf(items, 's2')?.id).toBe('ch1');
    expect(folderOf([item('m', 'memory', 'Alone')], 'm')).toBeNull();
  });

  test('numbers footnotes across the whole export', () => {
    const note = (text: string) => ({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text },
            { type: 'footnote', attrs: { content: [{ type: 'text', text: `${text} note` }] } },
          ],
        },
      ],
    });
    const two = new Map([
      ['s1', updateOf(note('One'), 'prose')],
      ['s2', updateOf(note('Two'), 'prose')],
    ]);
    const doc = buildExportDoc({
      project: project('novel'),
      items,
      scope: { kind: 'folder', itemId: 'ch1' },
      updates: two,
    });
    expect(footnotesOf(doc).map((n) => `${String(n.number)}:${n.note[0]?.text ?? ''}`)).toEqual([
      '1:One note',
      '2:Two note',
    ]);
  });

  test('uses A4 paper and the project font when the project sets them', () => {
    const doc = buildExportDoc({
      project: project('memoir', { settings: { page: 'a4', font: 'eb-garamond' } }),
      items: [item('m', 'memory', 'Alone')],
      scope: { kind: 'project' },
      updates: new Map(),
    });
    expect(doc).toMatchObject({ paper: 'a4', font: 'eb-garamond' });
  });

  test('gives a safe file name', () => {
    expect(exportFileName('Salt: a "year"/1994?')).toBe('Salt a year 1994');
    expect(exportFileName('  ')).toBe('Vlo export');
  });
});
