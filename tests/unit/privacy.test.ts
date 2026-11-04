import { describe, expect, test } from 'vitest';
import { buildExportDoc } from '@/features/export/build';
import { footnotesOf, runsText, type ExportDoc, type Run } from '@/features/export/model';
import { aliasText, shareSafe, type Alias } from '@/lib/privacy';
import { item, MEMOIR_TEXT, project, proseUpdate, updateOf } from './export-fixtures';

/* Share-safe export with the memoir fixture's alias list (spec section 9, plan Task B1). */

const ALIASES: Alias[] = [
  { name: 'Rosa', alias: 'Mae' },
  { name: 'Aunt Rosa', alias: 'Aunt Mae' },
  { name: 'Teo', alias: 'Sol' },
  { name: 'Uncle Teo', alias: 'Uncle Sol' },
];

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
    const safe = shareSafe(memoirDoc(), ALIASES, true);
    const out = text(safe);
    expect(out).toContain('Aunt Mae drove us to the coast in the summer of 1994. Uncle Sol stayed behind');
    expect(out).toContain('Mae never said why. Years later, Sol told me');
    for (const name of ['Rosa', 'Teo']) expect(out).not.toContain(name);
    expect(safe.title).toBe('Mae at the coast');
    expect(safe.sections[0]?.title).toBe('Mae at the coast');
  });

  test('keeps the text as written when the switch is off or the list is empty', () => {
    const doc = memoirDoc();
    expect(shareSafe(doc, ALIASES, false)).toBe(doc);
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
    const safe = shareSafe(doc, ALIASES, true);
    const block = safe.sections[0]?.blocks[1];
    const runs = block && 'runs' in block ? block.runs : [];
    const texts = runs.filter((r): r is Extract<Run, { type: 'text' }> => r.type === 'text');
    expect(texts.map((r) => [r.text, Object.keys(r.style).join(',')])).toEqual([
      ['Dear ', 'bold'],
      ['Aunt Mae', 'bold'],
      [' and ', ''],
      ['Sol', 'underline'],
    ]);
    expect(footnotesOf(safe)[0]?.note[0]?.text).toBe('Mae kept the letters.');
  });
});
