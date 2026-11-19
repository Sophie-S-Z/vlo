import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { buildExportDoc } from '@/features/export/build';
import { escapeMarkdown, toMarkdown } from '@/features/export/markdown';
import { item, POEM_TEXT, poemUpdate, project, RICH_PROSE, singleDoc } from './export-fixtures';

/* Markdown export (spec section 9). Each check renders the Markdown, as a reader would show it. */

const md = new MarkdownIt({ html: true, breaks: false });

function poemMarkdown(): string {
  return toMarkdown(
    buildExportDoc({
      project: project('poetry'),
      items: [item('p1', 'poem', 'Salt on the Sill')],
      scope: { kind: 'item', itemId: 'p1' },
      updates: new Map([['p1', poemUpdate()]]),
    }),
  );
}

/** The text of each rendered line, with no-break spaces read as spaces, stanza by stanza. */
function renderedStanzas(markdown: string): string[][] {
  const html = md.render(markdown);
  const stanzas = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1] ?? '');
  return stanzas.map((stanza) =>
    stanza.split(/<br>\n?/).map((line) =>
      line
        .replace(/<[^>]+>/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/&amp;/g, '&'),
    ),
  );
}

describe('Markdown export', () => {
  test('the poem fixture keeps every space, every line and every stanza when rendered', () => {
    const markdown = poemMarkdown();
    expect(markdown.startsWith('# Salt on the Sill\n')).toBe(true);
    const expected = POEM_TEXT.trimEnd()
      .split('\n\n')
      .map((stanza) => stanza.split('\n'));
    const rendered = renderedStanzas(markdown).slice(0);
    expect(rendered).toEqual(expected);
  });

  test('ends each poem line but the last of a stanza with a backslash break', () => {
    const lines = poemMarkdown().split('\n');
    expect(lines).toContain('Salt on the sill.\\');
    expect(lines).toContain('    The tide goes out\\');
    expect(lines).toContain('            one board at a time.');
  });

  test('writes every style, link, footnote and equation', () => {
    const markdown = toMarkdown(singleDoc(RICH_PROSE, 'prose'));
    expect(markdown).toContain('**tide**');
    expect(markdown).toContain(' *<u>turned</u>*');
    expect(markdown).toContain('~~gone~~');
    expect(markdown).toContain('H<sub>2</sub>O x<sup>2</sup>');
    expect(markdown).toContain(' <mark>marked</mark>');
    expect(markdown).toContain(' [site](https://example.org/a%20b)');
    expect(markdown).not.toContain('javascript:');
    expect(markdown).toContain('[^1] and $\\frac{a}{b}$\\\nnext line');
    expect(markdown).toContain('### Harbor');
    expect(markdown).toContain('3. first\n4. second\n   - inner');
    expect(markdown).toContain('> Quoted words');
    expect(markdown).toContain('\n***\n');
    expect(markdown).toContain('$$\\sum_{i=1}^{n} i^2$$');
    expect(markdown).toContain('[^1]: A note with **bold**');
    const html = md.render(markdown);
    expect(html).toContain('<strong>tide</strong>');
    expect(html).toContain('<ol start="3">');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<hr>');
  });

  test('a single item does not repeat its title', () => {
    const markdown = toMarkdown(singleDoc(RICH_PROSE, 'prose'));
    expect(markdown.match(/The Kettle/g)).toHaveLength(1);
  });

  test('escapes characters that would read as formatting', () => {
    expect(escapeMarkdown('2 * 3 = $6 [a](b) <i>')).toBe('2 \\* 3 = \\$6 \\[a\\](b) \\<i\\>');
    const doc = singleDoc(
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1. Not a list' }] }] },
      'prose',
    );
    expect(md.render(toMarkdown(doc))).toContain('<p>1. Not a list</p>');
  });

  test('a list three levels deep and an item of two paragraphs keep their shape', () => {
    const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const list = (...items: object[][]) => ({
      type: 'bulletList',
      content: items.map((content) => ({ type: 'listItem', content })),
    });
    const doc = singleDoc(
      { type: 'doc', content: [list([p('top'), list([p('mid'), list([p('deep')])])], [p('one'), p('two')])] },
      'prose',
    );
    const html = md.render(toMarkdown(doc)).replace(/\n/g, '');
    expect(html).toContain('<li>mid<ul><li>deep</li></ul></li>');
    expect(html).toContain('<li><p>one</p><p>two</p></li>');
  });

  test('a rule, a list or a heading underline after a line break stays text', () => {
    const lines = (...texts: string[]) => ({
      type: 'paragraph',
      content: texts.flatMap((text, i) => [
        ...(i > 0 ? [{ type: 'hardBreak' }] : []),
        { type: 'text', text },
      ]),
    });
    const doc = singleDoc(
      {
        type: 'doc',
        content: [lines('---'), lines('Shopping:', '- eggs'), lines('Title', '==='), lines('Day', '1. one')],
      },
      'prose',
    );
    const html = md.render(toMarkdown(doc));
    expect(html).not.toMatch(/<hr>|<ul>|<ol>|<h1>Title/);
    expect(html).toContain('<p>---</p>');
    expect(html).toContain('- eggs');
  });
});
