import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import type { Backup } from '@/features/backup/file';
import { walkawayZip } from '@/features/export/walkaway';
import type { Item, Template } from '@/lib/db';
import { item, poemUpdate, project, proseUpdate } from './export-fixtures';

/* The walkaway export (roadmap F33, plan Task G3). */

const NBSP = '\u00a0';

function backup(template: Template, title: string, items: Item[], updates: [string, Uint8Array][]): Backup {
  return {
    createdAt: 0,
    project: { ...project(template), id: title, title, aiMode: 'pen', createdAt: 0, updatedAt: 0 },
    items,
    snapshots: [],
    sessions: [],
    itemTexts: [],
    updates: new Map(updates),
    music: [],
    research: [],
    views: {} as Backup['views'],
  };
}

const novel = backup(
  'novel',
  'Salt Year',
  [
    item('c1', 'chapter', 'Chapter 1'),
    item('s1', 'scene', 'Harbour', 'c1'),
    item('s2', 'scene', 'Harbour', 'c1'),
    item('n1', 'note', 'Research: tides'),
  ],
  [
    ['s1', proseUpdate(['The harbour lights came on one by one.'])],
    ['s2', proseUpdate(['A <b>second</b> scene & more.'])],
    ['n1', proseUpdate(['Spring tides come twice a month.'])],
  ],
);
const poems = backup('poetry', 'Salt Year', [item('p1', 'poem', 'Salt on the Sill')], [['p1', poemUpdate()]]);

async function files(backups: Backup[]): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await walkawayZip(backups));
  const out: Record<string, string> = {};
  for (const [name, entry] of Object.entries(zip.files))
    if (!entry.dir) out[name] = await entry.async('string');
  return out;
}

describe('walkawayZip', () => {
  test('a folder for each project and binder folder, and a Markdown file for each item in order', async () => {
    const out = await files([novel, poems]);
    expect(Object.keys(out).sort()).toEqual([
      'Salt Year (2)/01 Salt on the Sill.md',
      'Salt Year (2)/index.html',
      'Salt Year/01 Chapter 1/01 Harbour.md',
      'Salt Year/01 Chapter 1/02 Harbour.md',
      'Salt Year/02 Research tides.md',
      'Salt Year/index.html',
      'index.html',
    ]);
    expect(out['Salt Year/01 Chapter 1/01 Harbour.md']).toBe(
      '# Harbour\n\nThe harbour lights came on one by one.\n',
    );
    // Notes are the writer's work too, so they come along.
    expect(out['Salt Year/02 Research tides.md']).toContain('Spring tides come twice a month.');
  });

  test('index.html holds every title in binder order, escapes the text and has no script', async () => {
    const out = await files([novel]);
    const html = out['Salt Year/index.html'] ?? '';
    const order = ['Chapter 1', 'Harbour', 'The harbour lights', 'second', 'Research: tides', 'Spring tides'];
    const at = order.map((text) => html.indexOf(text));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain('A &lt;b&gt;second&lt;/b&gt; scene &amp; more.');
    expect(html).not.toMatch(/<script/i);
    expect(out['index.html']).toContain('<a href="Salt%20Year/index.html">Salt Year</a>');
  });

  test('a poem keeps every leading space and every run of spaces', async () => {
    const out = await files([poems]);
    const md = out['Salt Year/01 Salt on the Sill.md'] ?? '';
    const html = out['Salt Year/index.html'] ?? '';
    for (const line of [
      '    The tide goes out',
      '            one board at a time.',
      'I keep    the kettle    warm',
    ]) {
      const lead = /^ */.exec(line)?.[0].length ?? 0;
      const shown =
        NBSP.repeat(lead) + line.slice(lead).replace(/ {2,}/g, (s) => ` ${NBSP.repeat(s.length - 1)}`);
      expect(md).toContain(shown);
      expect(html).toContain(shown);
    }
    // Each line ends with a hard break, so the lines of a stanza never run together.
    expect(html).toContain(`${NBSP.repeat(4)}The tide goes out<br>`);
  });
});
