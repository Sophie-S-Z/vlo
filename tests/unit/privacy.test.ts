import { describe, expect, test } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { buildExportDoc } from '@/features/export/build';
import { footnotesOf, runsText, type ExportDoc, type Run } from '@/features/export/model';
import { aliasesOf, aliasText, nameCheck, shareSafe, type PrivatePerson } from '@/lib/privacy';
import { item, MEMOIR_TEXT, project, proseUpdate, updateOf } from './export-fixtures';

/* Share-safe export with the memoir fixture's people (spec sections 8.2 and 9, plan Tasks B1 and C5). */

const PEOPLE: PrivatePerson[] = [
  {
    id: 'rosa',
    variants: [
      { real: 'Aunt Rosa', alias: 'Aunt Mae' },
      { real: 'Rosa', alias: 'Mae' },
    ],
  },
  {
    id: 'teo',
    variants: [
      { real: 'Teo', alias: 'Sol' },
      { real: 'Uncle Teo', alias: 'Uncle Sol' },
    ],
  },
];
const ALIASES = aliasesOf(PEOPLE);

function memoirDoc(): ExportDoc {
  const paragraphs = MEMOIR_TEXT.trim().split('\n');
  return buildExportDoc({
    project: project('memoir'),
    items: [item('m1', 'memory', 'Rosa at the coast')],
    scope: { kind: 'item', itemId: 'm1' },
    updates: new Map([['m1', proseUpdate(paragraphs)]]),
  });
}

const text = (doc: ExportDoc) =>
  doc.sections.flatMap((s) => s.blocks.map((b) => ('runs' in b ? runsText(b.runs) : ''))).join('\n');

describe('share-safe export', () => {
  test('replaces every real name in the memoir fixture with its alias', () => {
    const safe = shareSafe(memoirDoc(), PEOPLE, true);
    const out = text(safe);
    expect(out).toContain('Aunt Mae drove us to the coast in the summer of 1994. Uncle Sol stayed behind');
    expect(out).toContain('Mae never said why. Years later, Sol told me');
    for (const name of ['Rosa', 'Teo']) expect(out).not.toContain(name);
    expect(safe.title).toBe('Mae at the coast');
    expect(safe.sections[0]?.title).toBe('Mae at the coast');
  });

  test('keeps the text as written when the switch is off or the list is empty', () => {
    const doc = memoirDoc();
    expect(shareSafe(doc, PEOPLE, false)).toBe(doc);
    expect(shareSafe(doc, [], true)).toBe(doc);
  });

  test('matches whole words only, in any script', () => {
    expect(aliasText('Rosalind met Rosa. Teodora met Teo.', ALIASES)).toBe(
      'Rosalind met Mae. Teodora met Sol.',
    );
    expect(aliasText('Élise and Éli', [{ name: 'Éli', alias: 'Ana' }])).toBe('Élise and Ana');
    expect(aliasText('Rosa’s cup', ALIASES)).toBe('Mae’s cup');
  });

  test('prefers the longest name and never replaces inside an alias', () => {
    expect(aliasText('Aunt Rosa and Rosa', ALIASES)).toBe('Aunt Mae and Mae');
    expect(aliasText('Mae', [{ name: 'Mae', alias: 'Mae' }])).toBe('Mae');
  });

  test('replaces a name that crosses two styled runs, with the style of the run where it starts', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Dear Aunt ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'Rosa', marks: [{ type: 'italic' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'Teo', marks: [{ type: 'underline' }] },
            { type: 'footnote', attrs: { content: [{ type: 'text', text: 'Rosa kept the letters.' }] } },
          ],
        },
      ],
    };
    const doc = buildExportDoc({
      project: project('memoir'),
      items: [item('m1', 'memory', 'Letters')],
      scope: { kind: 'item', itemId: 'm1' },
      updates: new Map([['m1', updateOf(json, 'prose')]]),
    });
    const safe = shareSafe(doc, PEOPLE, true);
    const block = safe.sections[0]?.blocks[1];
    const runs = block && 'runs' in block ? block.runs : [];
    const texts = runs.filter((r): r is Extract<Run, { type: 'text' }> => r.type === 'text');
    expect(texts.map((r) => [r.text, Object.keys(r.style).join(',')])).toEqual([
      ['Dear Aunt Mae', 'bold'],
      [' and ', ''],
      ['Sol', 'underline'],
    ]);
    expect(footnotesOf(safe)[0]?.note[0]?.text).toBe('Mae kept the letters.');
  });
});

/** A one-paragraph memory whose parts carry the given marks. `person` marks a part as a private name. */
function markedDoc(
  parts: readonly { text: string; person?: string; italic?: true }[],
  form: 'prose' | 'poem' = 'prose',
) {
  const content = parts.map((part) => {
    const marks = [
      ...(part.person === undefined ? [] : [{ type: 'privateName', attrs: { personId: part.person } }]),
      ...(part.italic ? [{ type: 'italic' }] : []),
    ];
    return { type: 'text', text: part.text, ...(marks.length > 0 ? { marks } : {}) };
  });
  const json =
    form === 'poem'
      ? { type: 'doc', content: [{ type: 'stanza', content: [{ type: 'poemLine', content }] }] }
      : { type: 'doc', content: [{ type: 'paragraph', content }] };
  return buildExportDoc({
    project: project('memoir'),
    items: [item('m1', form === 'poem' ? 'poem' : 'memory', 'Letters')],
    scope: { kind: 'item', itemId: 'm1' },
    updates: new Map([['m1', updateOf(json, form)]]),
  });
}

describe('marked private names', () => {
  test('the export reads the person of each marked run', () => {
    const doc = markedDoc([{ text: 'Dear ' }, { text: 'Rosa', person: 'rosa' }]);
    const block = doc.sections[0]?.blocks[1];
    const runs = block && 'runs' in block ? block.runs : [];
    expect(runs).toEqual([
      { type: 'text', text: 'Dear ', style: {} },
      { type: 'text', text: 'Rosa', style: {}, person: 'rosa' },
    ]);
  });

  test('a marked name becomes the alias of its matching variant', () => {
    const doc = markedDoc([
      { text: 'Aunt Rosa', person: 'rosa' },
      { text: ' wrote to ' },
      { text: 'Rosa', person: 'rosa' },
      { text: '’s', person: 'rosa' },
    ]);
    expect(text(shareSafe(doc, PEOPLE, true))).toContain('Aunt Mae wrote to Mae’s');
  });

  test('a name the writer changed inside its mark becomes the first alias, and the check lists it', () => {
    const doc = markedDoc([{ text: 'Ros a', person: 'rosa' }, { text: ' came home.' }]);
    const out = text(shareSafe(doc, PEOPLE, true));
    expect(out).toContain('Aunt Mae came home.');
    expect(out).not.toContain('Ros');
    expect(nameCheck(doc, PEOPLE)).toEqual({ unmarked: [], changed: [{ name: 'Ros a', count: 1 }] });
  });

  test('a name marked across two styles takes the style where it starts', () => {
    const doc = markedDoc([
      { text: 'Ro', person: 'rosa', italic: true },
      { text: 'sa', person: 'rosa' },
      { text: ' and Teo' },
    ]);
    const safe = shareSafe(doc, PEOPLE, true);
    const block = safe.sections[0]?.blocks[1];
    const runs = block && 'runs' in block ? block.runs : [];
    expect(runs).toEqual([
      { type: 'text', text: 'Mae', style: { italic: true } },
      { type: 'text', text: ' and Sol', style: {} },
    ]);
  });

  test('a mark of a deleted person counts as unmarked text', () => {
    const doc = markedDoc([{ text: 'Rosa', person: 'gone' }, { text: ' and Rosalind' }]);
    expect(text(shareSafe(doc, PEOPLE, true))).toContain('Mae and Rosalind');
    expect(nameCheck(doc, PEOPLE).unmarked).toEqual([{ name: 'Rosa', count: 1 }]);
  });

  test('the check counts each unmarked name, longest first, and skips marked ones', () => {
    const paragraphs = MEMOIR_TEXT.trim().split('\n');
    const doc = buildExportDoc({
      project: project('memoir'),
      items: [item('m1', 'memory', 'Rosa at the coast')],
      scope: { kind: 'item', itemId: 'm1' },
      updates: new Map([['m1', proseUpdate(paragraphs)]]),
    });
    expect(nameCheck(doc, PEOPLE)).toEqual({
      unmarked: [
        { name: 'Aunt Rosa', count: 1 },
        { name: 'Uncle Teo', count: 1 },
        { name: 'Rosa', count: 1 },
        { name: 'Teo', count: 1 },
      ],
      changed: [],
    });
    const marked = markedDoc([{ text: 'Aunt Rosa', person: 'rosa' }, { text: ' and Rosa' }]);
    expect(nameCheck(marked, PEOPLE).unmarked).toEqual([{ name: 'Rosa', count: 1 }]);
  });

  test('poem spaces stay exact around a marked name', () => {
    const doc = markedDoc(
      [{ text: '    for ' }, { text: 'Rosa', person: 'rosa' }, { text: ',   at the  shore' }],
      'poem',
    );
    const safe = shareSafe(doc, PEOPLE, true);
    const stanza = safe.sections[0]?.blocks.find((b) => b.type === 'stanza');
    const line = stanza?.type === 'stanza' ? stanza.lines[0] : undefined;
    expect(line ? runsText(line.runs) : '').toBe('    for Mae,   at the  shore');
  });
});

/** A one-item memory export of any TipTap JSON paragraph content. */
function paragraphDoc(content: JSONContent[], blocks: JSONContent[] = []) {
  return buildExportDoc({
    project: project('memoir'),
    items: [item('m1', 'memory', 'Letters')],
    scope: { kind: 'item', itemId: 'm1' },
    updates: new Map([
      ['m1', updateOf({ type: 'doc', content: [{ type: 'paragraph', content }, ...blocks] }, 'prose')],
    ]),
  });
}

const textRuns = (doc: ExportDoc) =>
  doc.sections
    .flatMap((s) => s.blocks)
    .flatMap((b) => ('runs' in b ? b.runs : []))
    .filter((r): r is Extract<Run, { type: 'text' }> => r.type === 'text');

describe('names in every place of the text (code review)', () => {
  test('a mark on two names gives each its own alias, and the check lists the other name', () => {
    const doc = markedDoc([{ text: 'Rosa and Teo', person: 'rosa' }, { text: ' came.' }]);
    expect(text(shareSafe(doc, PEOPLE, true))).toContain('Mae and Sol came.');
    expect(nameCheck(doc, PEOPLE).unmarked).toEqual([{ name: 'Teo', count: 1 }]);
  });

  test('a name in a note that two styles split is still swapped', () => {
    const note = [
      { type: 'text', text: 'Ro', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'sa wrote it.' },
    ];
    const doc = paragraphDoc([
      { type: 'text', text: 'Letters' },
      { type: 'footnote', attrs: { content: note } },
    ]);
    const safe = footnotesOf(shareSafe(doc, PEOPLE, true))[0]?.note ?? [];
    expect(safe.map((r) => r.text).join('')).toBe('Mae wrote it.');
    expect(safe[0]).toEqual({ type: 'text', text: 'Mae', marks: [{ type: 'bold' }] });
  });

  test('curly apostrophes, no-break spaces and both Unicode forms of an accent match', () => {
    const people: PrivatePerson[] = [
      { id: 'b', variants: [{ real: "O'Brien", alias: 'Kane' }] },
      { id: 'j', variants: [{ real: 'José', alias: 'Juan' }] },
      { id: 'u', variants: [{ real: 'Uncle Teo', alias: 'Uncle Sol' }] },
    ];
    const aliases = aliasesOf(people);
    expect(aliasText('O’Brien came.', aliases)).toBe('Kane came.');
    expect(aliasText('José came.', aliases)).toBe('Juan came.');
    expect(aliasText('Uncle Teo came.', aliases)).toBe('Uncle Sol came.');
    // An accent stays with its letter, so "José" never matches the "Jose" in "Josee".
    expect(aliasText('Josée came.', aliases)).toBe('Josée came.');
  });

  test('a link that holds a real name loses its address, and an equation gets the alias', () => {
    const doc = paragraphDoc(
      [
        {
          type: 'text',
          text: 'Her letters',
          marks: [{ type: 'link', attrs: { href: 'https://example.org/Rosa-letters' } }],
        },
        {
          type: 'text',
          text: ' and ',
          marks: [{ type: 'link', attrs: { href: 'https://example.org/sea' } }],
        },
        { type: 'mathInline', attrs: { latex: '\\text{Teo}^2' } },
      ],
      [{ type: 'mathBlock', attrs: { latex: '\\text{Aunt Rosa} = 1' } }],
    );
    const safe = shareSafe(doc, PEOPLE, true);
    const runs = textRuns(safe);
    expect(runs.find((r) => r.text === 'Her letters')?.style.link).toBeUndefined();
    expect(runs.find((r) => r.text === ' and ')?.style.link).toBe('https://example.org/sea');
    const maths = safe.sections
      .flatMap((s) => s.blocks)
      .flatMap((b) =>
        b.type === 'math'
          ? [b.latex]
          : 'runs' in b
            ? b.runs.flatMap((r) => (r.type === 'math' ? [r.latex] : []))
            : [],
      );
    expect(maths).toEqual(['\\text{Sol}^2', '\\text{Aunt Mae} = 1']);
  });

  test('an alias with a dollar sign stays as typed', () => {
    expect(aliasText('Rosa came.', [{ name: 'Rosa', alias: '$& $1 $$' }])).toBe('$& $1 $$ came.');
  });
});
