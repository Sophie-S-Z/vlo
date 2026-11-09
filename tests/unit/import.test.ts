import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { importBackup } from '@/features/backup/backup';
import { readBackup, writeBackup } from '@/features/backup/file';
import { updateToJson } from '@/features/export/read';
import { readDocx } from '@/features/import/docx';
import { readMarkdown, readPlainText } from '@/features/import/markdown';
import { readPicked, type PickedFile } from '@/features/import/read';
import { readRtf } from '@/features/import/rtf';
import { readScrivener } from '@/features/import/scrivener';
import {
  ImportError,
  placeNodes,
  toBackup,
  type ImportNode,
  type ImportSource,
} from '@/features/import/tree';
import { db, type Template } from '@/lib/db';
import { countWords } from '@/lib/wordcount';
import { docxBytes, SCRIVENER_FILES, zipOf } from '../fixtures/import';
import { POEM_TEXT } from './export-fixtures';

/* Import from other writing tools (roadmap F34, plan Task G4). */

const encoder = new TextEncoder();
const picked = (files: Record<string, string | Uint8Array>): PickedFile[] =>
  Object.entries(files).map(([path, data]) => ({
    path,
    read: () => Promise.resolve(typeof data === 'string' ? encoder.encode(data) : data),
  }));

/** The kinds and titles of the placed tree, as "kind title" lines with two spaces for each level. */
function shape(nodes: readonly ImportNode[], templates: Template[]): string[] {
  const out: string[] = [];
  const walk = (placed: ReturnType<typeof placeNodes>, depth: number) => {
    for (const node of placed) {
      out.push(`${'  '.repeat(depth)}${node.kind} ${node.title}`);
      walk(node.children, depth + 1);
    }
  };
  walk(placeNodes(nodes, templates), 0);
  return out;
}

const text = (words: string) => ({ html: `<p>${words}</p>`, poem: `${words}\n` });

describe('placeNodes', () => {
  const tree: ImportNode[] = [
    {
      title: 'Part One',
      children: [{ title: 'Chapter 1', children: [{ title: 'Scene', text: text('a') }] }],
    },
    { title: 'Loose', text: text('b') },
    {
      title: 'Deep',
      children: [{ title: 'Deeper', children: [{ title: 'Deepest', children: [{ title: 'Leaf' }] }] }],
    },
    { title: 'Research', note: true, children: [{ title: 'Map', text: text('c') }] },
  ];

  test('fits a novel: parts, chapters and scenes, and each loose text gets a chapter of its own', () => {
    expect(shape(tree, ['novel'])).toEqual([
      'part Part One',
      '  chapter Chapter 1',
      '    scene Scene',
      'chapter Loose',
      '  scene Loose',
      'part Deep',
      '  chapter Deeper',
      '    scene Leaf',
      'note Map',
    ]);
  });

  test('fits a poetry collection: sections hold poems, and deeper folders move up', () => {
    expect(shape(tree, ['poetry'])).toEqual([
      'part Part One',
      '  poem Scene',
      'poem Loose',
      'part Deep',
      '  poem Leaf',
      'note Map',
    ]);
  });

  test('keeps every folder in open writing, where a folder can hold folders', () => {
    expect(shape(tree.slice(2, 3), ['open'])).toEqual([
      'part Deep',
      '  part Deeper',
      '    part Deepest',
      '      page Leaf',
    ]);
  });

  test("puts a folder's own text first in the folder", () => {
    const nodes = [{ title: 'Chapter', text: text('own'), children: [{ title: 'Scene', text: text('x') }] }];
    expect(shape(nodes, ['novel'])).toEqual(['chapter Chapter', '  scene Chapter', '  scene Scene']);
  });
});

describe('toBackup', () => {
  beforeEach(async () => {
    await db.open();
  });
  afterEach(async () => {
    await db.delete();
    for (const d of await indexedDB.databases())
      if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
  });

  const source: ImportSource = {
    title: 'Salt Year',
    nodes: [
      {
        title: 'Chapter 1',
        children: [
          {
            title: 'First',
            synopsis: 'It starts.',
            text: text('The harbour <strong>lights</strong> came on.'),
          },
          { title: 'Second', text: text('The gulls slept.') },
        ],
      },
    ],
    skipped: [],
  };

  test('makes a backup that passes the backup checks, in order, with counts and text copies', async () => {
    const backup = toBackup(source, ['novel'], 5);
    const back = await readBackup(await writeBackup(backup));
    expect(back.items.map((i) => [i.kind, i.title])).toEqual([
      ['chapter', 'Chapter 1'],
      ['scene', 'First'],
      ['scene', 'Second'],
    ]);
    const [chapter, first, second] = back.items;
    expect(first?.parentId).toBe(chapter?.id);
    expect(first?.synopsis).toBe('It starts.');
    expect((first?.order ?? '') < (second?.order ?? '')).toBe(true);
    expect(first?.wordCount).toBe(countWords('The harbour lights came on.'));
    expect(back.itemTexts.map((t) => t.text)).toEqual(['The harbour lights came on.', 'The gulls slept.']);
    expect(JSON.stringify(updateToJson(back.updates.get(first?.id ?? '') ?? new Uint8Array()))).toContain(
      'bold',
    );
  });

  test('keeps every space of a poem, and the project is in the Library after the import', async () => {
    const backup = toBackup(
      { title: 'Tide', nodes: [{ title: 'Salt', text: { html: '', poem: POEM_TEXT } }], skipped: [] },
      ['poetry'],
      5,
    );
    const id = await importBackup(backup, 'same');
    const poem = await db.items.where('projectId').equals(id).first();
    const copy = await db.itemTexts.get(poem?.id ?? '');
    expect(copy?.text).toBe(POEM_TEXT);
    expect(poem?.lineCount).toBe(POEM_TEXT.split('\n').filter((l) => l.trim() !== '').length);
    expect((await db.projects.get(id))?.templates).toEqual(['poetry']);
  });
});

describe('readers', () => {
  test('plain text is one item, and a poem keeps its lines as written', () => {
    const node = readPlainText('02 Salt.txt', POEM_TEXT);
    expect(node.title).toBe('Salt');
    expect(node.text?.poem).toBe(POEM_TEXT);
    expect(node.text?.html).toContain('<p>Salt on the sill.<br>');
  });

  test('Markdown: front matter, headings, wiki links and footnotes', () => {
    const nodes = readMarkdown(
      'notes.md',
      '---\ntitle: "The Ledger"\nsynopsis: Mira counts.\n---\nMira met [[Rosa|her aunt]] at [[The Dock]].[^1]\n\n[^1]: On a *Friday*.\n',
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.title).toBe('The Ledger');
    expect(nodes[0]?.synopsis).toBe('Mira counts.');
    expect(nodes[0]?.text?.html).toBe(
      '<p>Mira met her aunt at The Dock.<sup data-footnote="" data-note="&quot;On a Friday.&quot;"></sup></p>',
    );
    const split = readMarkdown('book.md', '# Part\n\n## One\n\nA.\n\n## Two\n\nB.\n');
    expect(split.map((n) => [n.title, n.children?.map((c) => c.title)])).toEqual([['Part', ['One', 'Two']]]);
  });

  test("Markdown: a poem from Vlo's export comes back with its line breaks and spaces", () => {
    const exported = '\u00a0\u00a0\u00a0\u00a0The tide goes out\\\nand  \u00a0takes it.\n\nNew stanza.\n';
    expect(readMarkdown('poem.md', exported)[0]?.text?.poem).toBe(
      '    The tide goes out\nand   takes it.\n\nNew stanza.\n',
    );
  });

  test('Word: headings split the file, marks and footnotes stay, and the table is in the summary', async () => {
    const { nodes, skipped } = await readDocx('Salt Year.docx', await docxBytes());
    expect(skipped).toEqual(['1 table']);
    const [part] = nodes;
    expect(part?.title).toBe('Chapter One');
    expect(part?.children?.map((c) => c.title)).toEqual(['The ledger', 'The key']);
    expect(part?.children?.[0]?.text?.html).toBe(
      '<p><strong>Mira</strong> counted the coins <em>twice</em><sup data-footnote="" data-note="&quot;Forty short.&quot;"></sup>.</p>',
    );
    expect(part?.children?.[1]?.text?.html).toBe('<p><u>Rosa</u><s> left</s><br>at dawn.</p>');
  });

  test('Word: a file that is not a Word file gives a message for the writer', async () => {
    await expect(readDocx('broken.docx', encoder.encode('not a zip'))).rejects.toThrow(ImportError);
  });

  test('RTF: characters, marks, tabs, footnotes and skipped pictures', () => {
    const out = readRtf(SCRIVENER_FILES['Salt Year.scriv/Files/Data/S1/content.rtf'] ?? '');
    expect(out.text).toBe('Mira paid the caf\u00e9 in \u201ccoins\u201d.\nThe tide\tturned.\n');
    expect(out.html).toBe(
      '<p><strong>Mira</strong> paid the caf\u00e9 in \u201ccoins\u201d.<sup data-footnote="" data-note="&quot;Forty short.&quot;"></sup></p><p>The tide\tturned.</p>',
    );
    expect(out.skipped).toEqual(['1 picture']);
  });

  test('Scrivener: the Draft is the binder, Research becomes notes, and the Trash stays out', async () => {
    const files = new Map(
      Object.entries(SCRIVENER_FILES).map(([path, data]) => [
        path,
        () => Promise.resolve(encoder.encode(data)),
      ]),
    );
    const project = await readScrivener(files);
    expect(project.title).toBe('Salt Year');
    expect(project.skipped).toEqual(['pictures', '1 PDF, image or web files']);
    const [chapter, research] = project.nodes;
    expect(chapter?.children?.map((c) => [c.title, c.synopsis])).toEqual([
      ['The ledger', 'Mira counts the debt.'],
      ['The key', undefined],
    ]);
    expect(research?.note).toBe(true);
    expect(research?.children?.map((c) => c.title)).toEqual(['Harbour notes']);
    expect(JSON.stringify(project)).not.toContain('Old opening');
  });
});

describe('readPicked', () => {
  test('a folder of Markdown files becomes folders in name order, with the folder name as the title', async () => {
    const source = await readPicked(
      picked({
        'Salt Year/10 Ten.md': 'Ten.',
        'Salt Year/2 Two.md': 'Two.',
        'Salt Year/Part B/1 One.md': 'One.',
        'Salt Year/.obsidian/app.json': '{}',
        'Salt Year/cover.png': new Uint8Array([1]),
      }),
    );
    expect(source.title).toBe('Salt Year');
    expect(source.nodes.map((n) => [n.title, n.children?.map((c) => c.title)])).toEqual([
      ['Two', undefined],
      ['Ten', undefined],
      ['Part B', ['One']],
    ]);
    expect(source.skipped).toEqual(['1 other file']);
  });

  test('a zip of a Scrivener project goes to the Scrivener reader', async () => {
    const source = await readPicked(picked({ 'Salt Year.scriv.zip': await zipOf(SCRIVENER_FILES) }));
    expect(source.title).toBe('Salt Year');
    expect(source.nodes).toHaveLength(2);
  });

  test('a Vlo backup and an empty pick each give a message for the writer', async () => {
    const backup = await zipOf({ 'project.json': '{}', 'items/a.yjs': new Uint8Array([0]) });
    await expect(readPicked(picked({ 'Salt.vlo.zip': backup }))).rejects.toThrow('Import backup');
    await expect(readPicked(picked({ 'cover.png': new Uint8Array([1]) }))).rejects.toThrow(ImportError);
  });

  test('a zip with project.json from another tool still imports', async () => {
    const zip = await zipOf({ 'project.json': '{}', 'One.md': 'One.' });
    expect((await readPicked(picked({ 'Book.zip': zip }))).nodes.map((n) => n.title)).toEqual(['One']);
  });
});
