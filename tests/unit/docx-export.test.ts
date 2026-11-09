import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { buildExportDoc } from '@/features/export/build';
import { bookmarkName, textFillXml, toDocx, wordFontName } from '@/features/export/docx';
import { linearMath, parseMathml } from '@/features/export/mathml';
import type { ExportReview } from '@/features/export/model';
import { item, poemUpdate, project, RICH_PROSE, singleDoc, updateOf } from './export-fixtures';

/* Word export (spec section 9). Each check unzips the file and reads its XML, as Word would. */

async function parts(bytes: Uint8Array): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(bytes);
  const out: Record<string, string> = {};
  for (const name of [
    'word/document.xml',
    'word/footnotes.xml',
    'word/numbering.xml',
    'word/styles.xml',
    'word/comments.xml',
  ]) {
    out[name] = (await zip.file(name)?.async('string')) ?? '';
  }
  return out;
}

/** The text of each paragraph in the body, with every space. */
function paragraphs(document: string): string[] {
  const body = document.slice(document.indexOf('<w:body>'));
  return [...body.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map((p) =>
    [...(p[1] ?? '').matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1] ?? '').join(''),
  );
}

describe('Word export', () => {
  test('the poem fixture keeps every space, with an empty paragraph between stanzas', async () => {
    const doc = buildExportDoc({
      project: project('poetry'),
      items: [item('p1', 'poem', 'Salt on the Sill')],
      scope: { kind: 'item', itemId: 'p1' },
      updates: new Map([['p1', poemUpdate()]]),
    });
    const xml = (await parts(await toDocx(doc)))['word/document.xml'] ?? '';
    expect(paragraphs(xml)).toEqual([
      'Salt on the Sill',
      'Salt on the sill.',
      '    The tide goes out',
      '        and takes the porch light with it,',
      '            one board at a time.',
      '',
      'I keep    the kettle    warm',
      'for no one, and the no one',
      '    drinks it slowly.',
      '',
      'The long line runs past the right margin on purpose and must wrap under its own hanging indent without losing a single space.',
    ]);
    // Every text run keeps its spaces.
    expect(xml.match(/<w:t>/g)).toBeNull();
    expect(xml).toContain('<w:t xml:space="preserve">    The tide goes out</w:t>');
  });

  test('maps a hanging indent to a hanging paragraph indent of the same width', async () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'stanza',
          content: [
            { type: 'poemLine', attrs: { hanging: 2 }, content: [{ type: 'text', text: 'a long line' }] },
          ],
        },
      ],
    };
    const xml = (await parts(await toDocx(singleDoc(json, 'poem'))))['word/document.xml'] ?? '';
    expect(xml).toContain('<w:ind w:left="480" w:hanging="480"/>');
  });

  test('writes every style as Word run properties', async () => {
    const xml = (await parts(await toDocx(singleDoc(RICH_PROSE, 'prose'))))['word/document.xml'] ?? '';
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
    expect(xml).toContain('<w:u w:val="single"/>');
    expect(xml).toContain('<w:strike/>');
    expect(xml).toContain('<w:vertAlign w:val="subscript"/>');
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(xml).toContain('<w:color w:val="C52E48"/>');
    expect(xml).toContain('<w:shd w:fill="F3E27E" w:color="auto" w:val="clear"/>');
    expect(xml).toContain('w:ascii="EB Garamond"');
    expect(xml).toContain('<w:sz w:val="36"/>');
    expect(xml).toContain('<w:jc w:val="both"/>');
    expect(xml).toContain('<w:spacing w:line="360" w:lineRule="auto"/>');
    expect(xml).toContain('<w:ind w:firstLine="480"/>');
    expect(xml).toContain('<w:hyperlink');
    expect(xml).not.toContain('javascript');
    // The title of a one-item export appears once.
    expect(xml.match(/The Kettle/g)).toHaveLength(1);
  });

  test('a gradient becomes a Word text fill, with its first color for other readers', async () => {
    const xml = (await parts(await toDocx(singleDoc(RICH_PROSE, 'prose'))))['word/document.xml'] ?? '';
    expect(xml).not.toContain('VloFill');
    expect(xml).toMatch(
      /<w:color w:val="B8860B"\/><w14:textFill><w14:gradFill><w14:gsLst><w14:gs w14:pos="0"><w14:srgbClr w14:val="B8860B"\/><\/w14:gs><w14:gs w14:pos="50000">/,
    );
    expect(xml).toContain('<w14:lin w14:ang="0" w14:scaled="0"/>');
    expect(xml).toMatch(/mc:Ignorable="[^"]*w14/);
  });

  test('turns a CSS gradient angle into a DrawingML angle, and adds a halo for a glow', () => {
    const fill = {
      stops: [
        { color: '#ff0000', at: 0 },
        { color: '#0000ff', at: 100 },
      ],
      angle: 180,
      look: 'glow',
      shimmer: false,
      speed: 6,
    } as const;
    const xml = textFillXml({ ...fill, stops: [...fill.stops] });
    expect(xml).toContain('w14:ang="5400000"');
    expect(xml.startsWith('<w14:glow')).toBe(true);
    expect(xml.indexOf('<w14:glow')).toBeLessThan(xml.indexOf('<w14:textFill'));
  });

  test('writes a drop cap as a framed first letter', async () => {
    const xml = (await parts(await toDocx(singleDoc(RICH_PROSE, 'prose'))))['word/document.xml'] ?? '';
    expect(xml).toMatch(/<w:framePr w:dropCap="drop"[^>]*w:lines="3"/);
    expect(paragraphs(xml)[1]).toBe('O');
    expect(paragraphs(xml)[2]?.startsWith('nce  the tide')).toBe(true);
  });

  test('writes real footnotes, numbered lists, quotes and centered scene breaks', async () => {
    const files = await parts(await toDocx(singleDoc(RICH_PROSE, 'prose')));
    const xml = files['word/document.xml'] ?? '';
    expect(xml).toContain('<w:footnoteReference w:id="1"/>');
    expect(files['word/footnotes.xml']).toMatch(
      /<w:footnote w:id="1">[\s\S]*A note with [\s\S]*<w:b\/>[\s\S]*bold/,
    );
    expect(files['word/numbering.xml']).toContain('<w:start w:val="3"/><w:numFmt w:val="decimal"/>');
    expect(xml).toMatch(/<w:numPr><w:ilvl w:val="1"\/>/);
    expect(xml).toContain('<w:ind w:left="720"/></w:pPr><w:r><w:t xml:space="preserve">Quoted words');
    expect(xml).toContain('<w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">#</w:t>');
  });

  test('writes each equation as a Word equation', async () => {
    const xml = (await parts(await toDocx(singleDoc(RICH_PROSE, 'prose'))))['word/document.xml'] ?? '';
    expect(xml).toContain(
      '<m:oMath><m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f></m:oMath>',
    );
    expect(xml).toMatch(
      /<m:nary><m:naryPr><m:chr m:val="∑"\/>[\s\S]*<m:sub>[\s\S]*<m:t>=<\/m:t>[\s\S]*<m:sup><m:r><m:t>n<\/m:t>/,
    );
  });

  test('keeps the LaTeX inside the equation when MathLive cannot read a command', async () => {
    const json = { type: 'doc', content: [{ type: 'mathBlock', attrs: { latex: '\\overline{x}' } }] };
    const bytes = await toDocx(singleDoc(json, 'prose'), { toMathml: () => '' });
    const xml = (await parts(bytes))['word/document.xml'] ?? '';
    expect(xml).toContain('<m:oMath><m:r><m:t>\\overline{x}</m:t></m:r></m:oMath>');
  });

  test('uses the sheet size of the project', async () => {
    const doc = buildExportDoc({
      project: project('memoir', { settings: { page: 'a4' } }),
      items: [item('m', 'memory', 'Alone')],
      scope: { kind: 'project' },
      updates: new Map([['m', updateOf({ type: 'doc', content: [{ type: 'paragraph' }] }, 'prose')]]),
    });
    const xml = (await parts(await toDocx(doc)))['word/document.xml'] ?? '';
    expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838"');
  });

  test('names Vlo fonts and installed fonts as Word knows them', () => {
    expect(wordFontName('eb-garamond')).toBe('EB Garamond');
    expect(wordFontName('local:Garamond Premier Pro')).toBe('Garamond Premier Pro');
    expect(wordFontName('nonsense')).toBeUndefined();
  });
});

/* Plan Task I2 (roadmap F45): the Word file keeps tracked changes and comments for an editor. */
describe('Word export for an editor', () => {
  const AT = Date.UTC(2026, 10, 9, 12, 0, 0);
  const suggestion = (kind: 'insert' | 'delete', by = '') => ({
    type: 'suggestion',
    attrs: { id: `s-${kind}`, kind, pass: 2, at: AT, by },
  });
  const comment = { type: 'comment', attrs: { id: 'c1', text: 'Too quiet?\nSay more.', at: AT, by: '' } };
  // "Mira finds the ledger." with "Mira " struck, " at last" new, and a comment from "ledger" to the end of the next line.
  const SCENE = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Mira ', marks: [suggestion('delete')] },
          { type: 'text', text: 'finds the ' },
          { type: 'text', text: 'ledger', marks: [comment] },
          { type: 'text', text: ' at last', marks: [comment, suggestion('insert', 'Ana')] },
          { type: 'text', text: '.', marks: [comment] },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'It is cold.', marks: [comment] }] },
    ],
  };
  const sceneDoc = (review?: ExportReview) =>
    buildExportDoc({
      project: project('novel', { authorName: 'Rae Moss' }),
      items: [item('a1b2-c3d4', 'scene', 'One'), item('e5f6-a7b8', 'scene', 'Two')],
      scope: { kind: 'project' },
      updates: new Map([
        ['a1b2-c3d4', updateOf(SCENE, 'prose')],
        [
          'e5f6-a7b8',
          updateOf(
            { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dawn.' }] }] },
            'prose',
          ),
        ],
      ]),
      ...(review ? { review } : {}),
    });

  test('a default Word file has the accepted text and no changes or comments', async () => {
    const files = await parts(await toDocx(sceneDoc()));
    const xml = files['word/document.xml'] ?? '';
    expect(paragraphs(xml)).toContain('finds the ledger at last.');
    expect(xml).not.toMatch(/<w:ins |<w:del |<w:commentRangeStart/);
    expect(files['word/comments.xml']).toBe('');
  });

  test('tracked changes keep their kind, author and date', async () => {
    const xml =
      (await parts(await toDocx(sceneDoc({ changes: true, comments: false }))))['word/document.xml'] ?? '';
    const date = new Date(AT).toISOString();
    expect(xml).toMatch(
      new RegExp(
        `<w:del w:id="\\d+" w:author="Rae Moss" w:date="${date}"><w:r><w:delText xml:space="preserve">Mira </w:delText>`,
      ),
    );
    expect(xml).toMatch(
      new RegExp(
        `<w:ins w:id="\\d+" w:author="Ana" w:date="${date}"><w:r><w:t xml:space="preserve"> at last</w:t>`,
      ),
    );
    expect(xml).not.toContain('<w:commentRangeStart');
  });

  test('a comment holds its words in one range, across two paragraphs', async () => {
    const files = await parts(await toDocx(sceneDoc({ changes: false, comments: true })));
    const xml = files['word/document.xml'] ?? '';
    expect(xml.match(/<w:commentRangeStart w:id="0"\/>/g)).toHaveLength(1);
    expect(xml.match(/<w:commentRangeEnd w:id="0"\/>/g)).toHaveLength(1);
    expect(xml.match(/<w:commentReference w:id="0"\/>/g)).toHaveLength(1);
    const range = xml.slice(xml.indexOf('<w:commentRangeStart'), xml.indexOf('<w:commentRangeEnd'));
    expect(range).toContain('>ledger<');
    expect(range).toContain('>It is cold.<');
    // The range ends with its last words, before the next item.
    expect(xml.indexOf('<w:commentRangeEnd')).toBeLessThan(xml.indexOf('<w:t xml:space="preserve">#<'));
    const comments = files['word/comments.xml'] ?? '';
    expect(comments).toContain('w:author="Rae Moss"');
    expect(comments).toContain('>Too quiet?<');
    expect(comments).toContain('>Say more.<');
  });

  test('each section starts with the bookmark of its item', async () => {
    const xml = (await parts(await toDocx(sceneDoc())))['word/document.xml'] ?? '';
    expect(bookmarkName('a1b2-c3d4')).toBe('vlo_a1b2c3d4');
    expect(bookmarkName('0f0e0d0c-0b0a-4908-8706-050403020100')).toHaveLength(36);
    const one = xml.indexOf('w:name="vlo_a1b2c3d4"');
    const two = xml.indexOf('w:name="vlo_e5f6a7b8"');
    expect(one).toBeGreaterThan(-1);
    expect(xml.indexOf('finds the')).toBeGreaterThan(one);
    expect(two).toBeGreaterThan(xml.indexOf('It is cold.'));
    expect(xml.indexOf('Dawn.')).toBeGreaterThan(two);
  });
});

describe('MathML reader', () => {
  test('reads MathLive MathML and gives a plain-text form', () => {
    const tree = parseMathml(
      '<mrow><mfrac><mi>a</mi><mi>b</mi></mfrac><mo>+</mo><msup><mi>x</mi><mn>2</mn></msup><mo>&#x2061;</mo><msqrt><mn>2</mn></msqrt><mtext >if </mtext></mrow>',
    );
    expect(tree.children[0]?.tag).toBe('mrow');
    expect(linearMath(tree)).toBe('a/b+x^2√2if ');
    expect(
      linearMath(parseMathml('<mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mn>2</mn></mfrac>')),
    ).toBe('(a+b)/2');
  });

  test('gives an empty root for broken input', () => {
    expect(parseMathml('').children).toEqual([]);
    expect(parseMathml('<<<').children).toEqual([]);
  });
});
