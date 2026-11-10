import { describe, expect, test } from 'vitest';
import { buildExportDoc } from '@/features/export/build';
import { runExport } from '@/features/export/run';
import { toWebHtml, toWebText } from '@/features/export/web';
import { item, POEM_TEXT, poemUpdate, project, RICH_PROSE, singleDoc } from './export-fixtures';

/* Web copies (roadmap F52, plan Task J2). Review Focus 3: a poem keeps each indent and line break. */

const poemDoc = () =>
  buildExportDoc({
    project: project('poetry'),
    items: [item('p1', 'poem', 'Salt on the Sill')],
    scope: { kind: 'item', itemId: 'p1' },
    updates: new Map([['p1', poemUpdate()]]),
  });

const expectedStanzas = () =>
  POEM_TEXT.trimEnd()
    .split('\n\n')
    .map((stanza) => stanza.split('\n'));

/** The lines of each stanza as a browser shows them: `white-space: normal`, no-break spaces kept. */
function shownStanzas(html: string): string[][] {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  return [...body.querySelectorAll('p')].map((p) =>
    p.innerHTML.split('<br>').map((line) => {
      const span = document.createElement('span');
      span.innerHTML = line;
      // A browser joins plain spaces and drops them at a line start. No-break spaces stay.
      return span.textContent
        .replace(/ +/g, ' ')
        .replace(/^ /, '')
        .replace(/\u00a0/g, ' ');
    }),
  );
}

describe('web copy', () => {
  test('the poem keeps every indent, line and stanza once a browser joins its spaces', () => {
    expect(shownStanzas(toWebHtml(poemDoc()))).toEqual(expectedStanzas());
  });

  test('the plain text keeps every indent and line too', () => {
    const text = toWebText(poemDoc()).replace(/\u00a0/g, ' ');
    expect(text.split('\n\n').map((stanza) => stanza.split('\n'))).toEqual(expectedStanzas());
  });

  test('uses only tags that AO3 keeps, with no style, class or span', () => {
    const html = toWebHtml(singleDoc(RICH_PROSE, 'prose'));
    const tags = new Set([...html.matchAll(/<([a-z0-9]+)/g)].map((m) => m[1]));
    const allowed = new Set('p br em strong u s sup sub h2 h3 h4 blockquote ol ul li hr a'.split(' '));
    expect([...tags].filter((tag) => !allowed.has(tag ?? ''))).toEqual([]);
    expect(html).not.toMatch(/style=|class=|<span/);
  });

  test('keeps the styles, links, lists, quotes, breaks and notes', () => {
    const html = toWebHtml(singleDoc(RICH_PROSE, 'prose'));
    expect(html).toContain('<strong>tide</strong>');
    expect(html).toContain('<em><u>turned</u></em>');
    expect(html).toContain('<s>gone</s>');
    expect(html).toContain('H<sub>2</sub>O x<sup>2</sup>');
    expect(html).toContain(' <a href="https://example.org/a%20b">site</a>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<ol start="3">');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<p align="center">*&#160;&#160;*&#160;&#160;*</p>');
    expect(html).toMatch(/<hr>\n<ol><li>A note with <strong>bold<\/strong>/);
    // The item title is the site's own title, so it is not in the body.
    expect(html).not.toContain('The Kettle');
  });

  test('a web export gives the HTML and the plain text, and its notices', async () => {
    const file = await runExport({
      project: project('poetry'),
      items: [item('p1', 'poem', 'Salt on the Sill')],
      scope: { kind: 'item', itemId: 'p1' },
      updates: [['p1', poemUpdate()]],
      format: 'web',
      people: [],
      shareSafe: false,
    });
    expect(file.name).toBe('Salt on the Sill.html');
    expect(new TextDecoder().decode(file.bytes)).toBe(toWebHtml(poemDoc()));
    expect(file.text).toBe(toWebText(poemDoc()));
  });
});
