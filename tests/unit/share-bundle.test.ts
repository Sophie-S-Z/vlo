import * as Y from 'yjs';
import { describe, expect, test } from 'vitest';
import { mathmlFor } from '@/features/export/latex';
import { safeExportTree } from '@/features/export/run';
import { markNames } from '@/features/people/markAll';
import {
  blockQuote,
  MATH_TAGS,
  parseBundle,
  safeLink,
  toBundle,
  type ShareBlock,
  type ShareBundle,
  safeMathAttr,
} from '@/features/share/bundle';
import type { PrivatePerson } from '@/lib/privacy';
import { docFromUpdate } from '@/lib/ydocs';
import {
  item,
  MEMOIR_TEXT,
  POEM_TEXT,
  poemUpdate,
  project,
  proseUpdate,
  RICH_PROSE,
  singleDoc,
  updateOf,
} from './export-fixtures';

/*
 * Plan Task E3 (spec section 11, US06): the share bundle holds the aliased text only, and parseBundle
 * refuses anything that Vlo does not make.
 */

const PEOPLE: PrivatePerson[] = [
  {
    id: 'rosa',
    variants: [
      { real: 'Aunt Rosa', alias: 'Aunt Maria' },
      { real: 'Rosa', alias: 'Maria' },
    ],
  },
  {
    id: 'teo',
    variants: [
      { real: 'Uncle Teo', alias: 'Uncle Sam' },
      { real: 'Teo', alias: 'Sam' },
    ],
  },
];

const MEMOIR = MEMOIR_TEXT.trim().split('\n');

function marked(): Uint8Array {
  const doc = docFromUpdate(proseUpdate(MEMOIR));
  markNames(doc, PEOPLE);
  return Y.encodeStateAsUpdate(doc);
}

const withNote = updateOf(
  {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'The letter from Teo' },
          { type: 'footnote', attrs: { content: [{ type: 'text', text: 'Aunt Rosa kept it.' }] } },
        ],
      },
    ],
  },
  'prose',
);

async function memoirBundle(): Promise<ShareBundle> {
  const { doc } = safeExportTree({
    project: { ...project('memoir'), title: 'Summers with Rosa' },
    items: [
      item('m1', 'memory', 'Rosa at the coast'),
      item('m2', 'memory', 'Uncle Teo stays'),
      item('m3', 'memory', 'Letters'),
    ],
    scope: { kind: 'project' },
    updates: [
      ['m1', marked()],
      ['m2', proseUpdate(MEMOIR)],
      ['m3', withNote],
    ],
    people: PEOPLE,
    shareSafe: true,
  });
  return toBundle(doc, await mathmlFor(doc), 1_700_000_000_000);
}

async function richBundle(): Promise<ShareBundle> {
  const doc = singleDoc(RICH_PROSE, 'prose');
  return toBundle(doc, await mathmlFor(doc), 1);
}

/** The bundle as the reader gets it: JSON text, parsed again. */
const roundTrip = (bundle: unknown) => parseBundle(JSON.parse(JSON.stringify(bundle)) as unknown);

describe('toBundle', () => {
  test('a share-safe memoir bundle holds no real name (US06)', async () => {
    const bundle = await memoirBundle();
    const text = JSON.stringify(bundle);
    expect(text.match(/Rosa|Teo/g)).toBeNull();
    expect(bundle.title).toBe('Summers with Maria');
    expect(text).toContain('Aunt Maria drove us to the coast');
    expect(text).toContain('Uncle Sam stayed behind');
    expect(text).toContain('Aunt Maria kept it.');
    expect(bundle.sections.map((s) => s.title)).toEqual(['Maria at the coast', 'Uncle Sam stays', 'Letters']);
  });

  test('keeps the plain styles and drops fonts, colors, fills and links that are not https', async () => {
    const bundle = await richBundle();
    const text = JSON.stringify(bundle);
    for (const gone of ['eb-garamond', '#c52e48', '#f3e27e', 'metallic', 'javascript:', 'color', 'font'])
      expect(text).not.toContain(gone);
    const blocks = bundle.sections[0]?.blocks ?? [];
    const first = blocks.find((b): b is Extract<ShareBlock, { type: 'p' }> => b.type === 'p');
    expect(first?.align).toBe('justify');
    const run = (t: string) => first?.runs.find((r) => 't' in r && r.t === t);
    expect(run('tide')).toEqual({ t: 'tide', b: true });
    expect(run(' turned')).toEqual({ t: ' turned', i: true, u: true });
    expect(run('gone')).toEqual({ t: 'gone', s: true });
    expect(run(' site')).toEqual({ t: ' site', link: 'https://example.org/a%20b' });
    expect(run(' bad')).toEqual({ t: ' bad' });
    expect(first?.runs.some((r) => 'br' in r)).toBe(true);
    const inline = first?.runs.find((r) => 'math' in r);
    expect(inline && 'math' in inline ? inline.math.children[0]?.tag : '').toBe('mfrac');
    expect(blocks.map((b) => b.type)).toEqual(['h', 'p', 'h', 'list', 'quote', 'break', 'math']);
  });

  test('every equation tree uses the allowed elements only', async () => {
    const bundle = await richBundle();
    const tags: string[] = [];
    JSON.stringify(bundle, (key, value: unknown) => {
      if (key === 'tag' && typeof value === 'string') tags.push(value);
      return value;
    });
    expect(tags.length).toBeGreaterThan(1);
    expect(tags.every((t) => MATH_TAGS.has(t))).toBe(true);
  });

  test('an equation that MathLive cannot write goes as its LaTeX text', () => {
    const doc = singleDoc(RICH_PROSE, 'prose');
    const bundle = toBundle(doc, () => '<math><mmultiscripts><mi>x</mi></mmultiscripts></math>', 1);
    const blocks = bundle.sections[0]?.blocks ?? [];
    expect(blocks.at(-1)).toMatchObject({ type: 'p', runs: [{ t: expect.any(String) as string }] });
    expect(JSON.stringify(bundle)).not.toContain('mmultiscripts');
    expect(roundTrip(bundle)).toEqual(bundle);
  });

  test('a poem keeps its lines and the hanging indents', async () => {
    const poem = safeExportTree({
      project: project('poetry'),
      items: [item('p1', 'poem', 'Tide Tables')],
      scope: { kind: 'item', itemId: 'p1' },
      updates: [['p1', poemUpdate(POEM_TEXT)]],
      people: [],
      shareSafe: false,
    }).doc;
    const bundle = toBundle(poem, await mathmlFor(poem), 1);
    expect(bundle.sections[0]?.form).toBe('poem');
    const stanzas = bundle.sections[0]?.blocks.filter((b) => b.type === 'stanza') ?? [];
    expect(stanzas.length).toBeGreaterThan(0);
    expect(roundTrip(bundle)).toEqual(bundle);
  });

  test('parseBundle takes back every bundle that toBundle makes', async () => {
    for (const bundle of [await memoirBundle(), await richBundle()])
      expect(roundTrip(bundle)).toEqual(bundle);
  });
});

describe('parseBundle refuses a crafted bundle', () => {
  const good = (): Record<string, unknown> => ({
    v: 1,
    title: 'T',
    createdAt: 1,
    sections: [{ title: 'S', form: 'prose', blocks: [{ type: 'p', runs: [{ t: 'hi' }] }] }],
  });

  test('a good bundle passes', () => {
    expect(parseBundle(good())).toEqual(good());
  });

  test.each([
    ['an unknown version', { ...good(), v: 2 }],
    ['a missing title', { ...good(), title: undefined }],
    ['a number for the author', { ...good(), author: 7 }],
    ['a string where the sections go', { ...good(), sections: 'none' }],
    [
      'an unknown block type',
      { ...good(), sections: [{ title: 'S', form: 'prose', blocks: [{ type: 'script' }] }] },
    ],
    ['an unknown form', { ...good(), sections: [{ title: 'S', form: 'html', blocks: [] }] }],
    [
      'a run with no text',
      { ...good(), sections: [{ title: 'S', form: null, blocks: [{ type: 'p', runs: [{}] }] }] },
    ],
    [
      'a style flag that is not true',
      {
        ...good(),
        sections: [{ title: 'S', form: null, blocks: [{ type: 'p', runs: [{ t: 'x', b: 'yes' }] }] }],
      },
    ],
    [
      'a heading level of 7',
      { ...good(), sections: [{ title: 'S', form: null, blocks: [{ type: 'h', level: 7, runs: [] }] }] },
    ],
    [
      'an unknown alignment',
      {
        ...good(),
        sections: [{ title: 'S', form: null, blocks: [{ type: 'p', runs: [], align: 'url(x)' }] }],
      },
    ],
    [
      'a footnote number of 0',
      {
        ...good(),
        sections: [{ title: 'S', form: null, blocks: [{ type: 'p', runs: [{ fn: 0, note: [] }] }] }],
      },
    ],
    [
      'a crafted math element',
      {
        ...good(),
        sections: [
          {
            title: 'S',
            form: null,
            blocks: [{ type: 'math', math: { tag: 'script', attrs: {}, text: 'x', children: [] } }],
          },
        ],
      },
    ],
    [
      'a math element inside an allowed one',
      {
        ...good(),
        sections: [
          {
            title: 'S',
            form: null,
            blocks: [
              {
                type: 'math',
                math: {
                  tag: 'math',
                  attrs: {},
                  text: '',
                  children: [{ tag: 'a', attrs: {}, text: '', children: [] }],
                },
              },
            ],
          },
        ],
      },
    ],
    [
      'a list of nothing but text',
      {
        ...good(),
        sections: [
          { title: 'S', form: null, blocks: [{ type: 'list', ordered: true, start: 1, items: 'x' }] },
        ],
      },
    ],
    ['an array for the bundle', [good()]],
    ['null', null],
  ])('%s', (_name, value) => {
    expect(parseBundle(value)).toBeNull();
  });

  test('drops math attributes outside the list and a link that is not https', () => {
    const value = good();
    value.sections = [
      {
        title: 'S',
        form: null,
        blocks: [
          {
            type: 'p',
            runs: [
              { t: 'a', link: 'javascript:alert(1)' },
              { t: 'b', link: 'http://example.org' },
              { t: 'c', link: 'https://user:pw@example.org' },
              { t: 'd', link: 'https://example.org/x' },
              {
                math: {
                  tag: 'math',
                  attrs: { href: 'javascript:x', onclick: 'x', display: 'block' },
                  text: '',
                  children: [],
                },
              },
            ],
          },
        ],
      },
    ];
    const parsed = parseBundle(value);
    const runs = parsed?.sections[0]?.blocks[0];
    expect(runs).toEqual({
      type: 'p',
      runs: [
        { t: 'a' },
        { t: 'b' },
        { t: 'c' },
        { t: 'd', link: 'https://example.org/x' },
        { math: { tag: 'math', attrs: { display: 'block' }, text: '', children: [] } },
      ],
    });
  });

  test('keeps a math attribute only when its value is a short length or keywords', () => {
    const attrs = {
      width: '0.2778em',
      lspace: '99999em',
      rspace: 'calc(100vw)',
      linethickness: 'thick',
      height: '-.5ex',
      depth: '12px;color:red',
      mathvariant: 'bold-italic',
      columnalign: 'left center right',
      stretchy: 'false" onload="x',
      notation: 'x'.repeat(200),
    };
    expect(Object.entries(attrs).filter(([name, value]) => safeMathAttr(name, value))).toEqual([
      ['width', '0.2778em'],
      ['linethickness', 'thick'],
      ['height', '-.5ex'],
      ['mathvariant', 'bold-italic'],
      ['columnalign', 'left center right'],
    ]);
    const value = good();
    value.sections = [
      {
        title: 'S',
        form: null,
        blocks: [{ type: 'p', runs: [{ math: { tag: 'math', attrs, text: '', children: [] } }] }],
      },
    ];
    const run = parseBundle(value)?.sections[0]?.blocks[0];
    expect(run).toEqual({
      type: 'p',
      runs: [
        {
          math: {
            tag: 'math',
            attrs: {
              width: '0.2778em',
              linethickness: 'thick',
              height: '-.5ex',
              mathvariant: 'bold-italic',
              columnalign: 'left center right',
            },
            text: '',
            children: [],
          },
        },
      ],
    });
  });

  test('refuses nesting deeper than the limit, and clamps a hanging indent', () => {
    let deep: unknown = { type: 'p', runs: [] };
    for (let i = 0; i < 40; i++) deep = { type: 'quote', blocks: [deep] };
    expect(parseBundle({ ...good(), sections: [{ title: 'S', form: null, blocks: [deep] }] })).toBeNull();

    const stanza = {
      type: 'stanza',
      lines: [
        { runs: [], hanging: 9999 },
        { runs: [], hanging: -4 },
      ],
    };
    const parsed = parseBundle({ ...good(), sections: [{ title: 'S', form: 'poem', blocks: [stanza] }] });
    expect(parsed?.sections[0]?.blocks[0]).toEqual({
      type: 'stanza',
      lines: [
        { runs: [], hanging: 20 },
        { runs: [], hanging: 0 },
      ],
    });
  });
});

describe('helpers', () => {
  test('safeLink takes an https address with a host only', () => {
    expect(safeLink('https://example.org')).toBe(true);
    expect(safeLink('http://example.org')).toBe(false);
    expect(safeLink('data:text/html,x')).toBe(false);
    expect(safeLink('not a link')).toBe(false);
  });

  test('blockQuote gives the first 12 words of a block', () => {
    const words = 'one two three four five six seven eight nine ten eleven twelve thirteen';
    expect(blockQuote({ type: 'p', runs: [{ t: words }] })).toBe(words.split(' ').slice(0, 12).join(' '));
    expect(
      blockQuote({
        type: 'stanza',
        lines: [
          { runs: [{ t: 'salt' }], hanging: 0 },
          { runs: [{ t: 'year' }], hanging: 1 },
        ],
      }),
    ).toBe('salt year');
    expect(blockQuote({ type: 'break' })).toBe('');
    // A language with no spaces gives one long word. The quote stays short enough for parseComment.
    const long = '海'.repeat(500);
    const quote = blockQuote({ type: 'p', runs: [{ t: long }] });
    expect(quote.length).toBe(200);
    expect(quote.endsWith('…')).toBe(true);
    expect(blockQuote({ type: 'p', runs: [{ t: '😀'.repeat(300) }] }).length).toBeLessThanOrEqual(200);
  });
});
