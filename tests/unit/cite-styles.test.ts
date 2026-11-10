import { readFileSync } from 'node:fs';
import type { JSONContent } from '@tiptap/core';
import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { parseBibtex } from '@/features/cite/sources';
import { mlaPages, reference, sortReferences } from '@/features/cite/styles';
import type { Run } from '@/features/export/model';
import { exportNotices } from '@/features/export/notices';
import { makeExport, prepareExport, type ExportRequest } from '@/features/export/run';
import type { CiteStyle, Source } from '@/lib/db';
import { item, loadPublicFile, project, updateOf } from './export-fixtures';

/* Roadmap 2 F64, plan Task M7: the reference list of APA 7, MLA 9 and Chicago author-date, in each export. */

/** A source of a draft, as the project stores it. */
const stored = (fields: Omit<Source, 'id' | 'projectId'>): Source => ({
  id: fields.key,
  projectId: 'p1',
  ...fields,
});

/** The entry as text, with each italic part in asterisks. */
const entry = (source: Source, style: CiteStyle) =>
  reference(source, style)
    .map((run: Run) => (run.type === 'text' ? (run.style.italic ? `*${run.text}*` : run.text) : ''))
    .join('');

const [book, chapter, article, web] = parseBibtex(
  readFileSync('tests/fixtures/sources/zotero.bib', 'utf8'),
).map((draft) => stored({ key: '', ...draft }));
if (!book || !chapter || !article || !web) throw new Error('The fixture has four sources.');

describe('published examples', () => {
  test('APA 7: the journal article and the chapter of the APA Style website', () => {
    const grady = stored({
      key: 'grady2019',
      type: 'article',
      authors: [
        { family: 'Grady', given: 'Jessica S.' },
        { family: 'Her', given: 'Malina' },
        { family: 'Moreno', given: 'Geena' },
        { family: 'Perez', given: 'Catherine' },
        { family: 'Yelinek', given: 'Jillian' },
      ],
      title:
        'Emotions in storybooks: A comparison of storybooks that represent ethnic and racial groups in the United States',
      container: 'Psychology of Popular Media Culture',
      year: '2019',
      volume: '8',
      issue: '3',
      pages: '207-217',
      doi: '10.1037/ppm0000185',
    });
    expect(entry(grady, 'apa')).toBe(
      'Grady, J. S., Her, M., Moreno, G., Perez, C., & Yelinek, J. (2019). Emotions in storybooks: A comparison of storybooks that represent ethnic and racial groups in the United States. *Psychology of Popular Media Culture*, *8*(3), 207–217. https://doi.org/10.1037/ppm0000185',
    );
    const aron = stored({
      key: 'aron2019',
      type: 'chapter',
      authors: [
        { family: 'Aron', given: 'Lisa' },
        { family: 'Botella', given: 'Marion' },
        { family: 'Lubart', given: 'Todd' },
      ],
      editors: [
        { family: 'Subotnik', given: 'Rena F.' },
        { family: 'Olszewski-Kubilius', given: 'Paula' },
        { family: 'Worrell', given: 'Frank C.' },
      ],
      title: 'Culinary arts: Talent and their development',
      container: 'The psychology of high performance: Developing human potential into domain-specific talent',
      publisher: 'American Psychological Association',
      year: '2019',
      pages: '345-359',
      doi: '10.1037/0000120-016',
    });
    expect(entry(aron, 'apa')).toBe(
      'Aron, L., Botella, M., & Lubart, T. (2019). Culinary arts: Talent and their development. In R. F. Subotnik, P. Olszewski-Kubilius, & F. C. Worrell (Eds.), *The psychology of high performance: Developing human potential into domain-specific talent* (pp. 345–359). American Psychological Association. https://doi.org/10.1037/0000120-016',
    );
  });

  test('MLA 9: a book by two authors and a work in an anthology', () => {
    const lunsford = stored({
      key: 'lunsford1990',
      type: 'book',
      authors: [
        { family: 'Lunsford', given: 'Andrea' },
        { family: 'Ede', given: 'Lisa' },
      ],
      title: 'Singular Texts/Plural Authors: Perspectives on Collaborative Writing',
      publisher: 'Southern Illinois UP',
      year: '1990',
    });
    expect(entry(lunsford, 'mla')).toBe(
      'Lunsford, Andrea, and Lisa Ede. *Singular Texts/Plural Authors: Perspectives on Collaborative Writing*. Southern Illinois UP, 1990.',
    );
    const wells = stored({
      key: 'wells1995',
      type: 'chapter',
      authors: [{ family: 'Wells', given: 'Ida B.' }],
      editors: [{ family: 'Logan', given: 'Shirley Wilson' }],
      title: 'Lynch Law in All Its Phases',
      container: 'With Pen and Voice: A Critical Anthology of Nineteenth-Century African-American Women',
      publisher: 'Southern Illinois UP',
      year: '1995',
      pages: '80-99',
    });
    expect(entry(wells, 'mla')).toBe(
      'Wells, Ida B. “Lynch Law in All Its Phases.” *With Pen and Voice: A Critical Anthology of Nineteenth-Century African-American Women*, edited by Shirley Wilson Logan, Southern Illinois UP, 1995, pp. 80–99.',
    );
  });

  test('Chicago author-date: a book by one author', () => {
    const oakley = stored({
      key: 'oakley2003',
      type: 'book',
      authors: [{ family: 'Oakley', given: 'Ann' }],
      title: 'Gender on Planet Earth',
      publisher: 'New Press',
      year: '2003',
    });
    expect(entry(oakley, 'chicago')).toBe('Oakley, Ann. 2003. *Gender on Planet Earth*. New Press.');
  });
});

describe('each type in each style', () => {
  test('APA 7', () => {
    expect([book, chapter, article, web].map((s) => entry(s, 'apa'))).toEqual([
      'Marlow, A., & Quill, J. (2019). *Night Ferry: A History of the North Sea Crossing*. Harbour Press.',
      'Björk, S. (2020). Lights on the Water. In M. Hale (Ed.), *Harbours of the North* (pp. 45–67). Fjord Books.',
      'Osei, K. (2021). Tides and Timetables. *Journal of Maritime Studies*, *12*(3), 201–219. https://doi.org/10.1000/tides.2021.3',
      'North Sea Ferry Board. (2022). *Ferry timetables*. North Sea Ferries. https://example.org/ferries',
    ]);
  });

  test('MLA 9', () => {
    expect([book, chapter, article, web].map((s) => entry(s, 'mla'))).toEqual([
      'Marlow, Ada, and Jonah Quill. *Night Ferry: A History of the North Sea Crossing*. Harbour Press, 2019.',
      'Björk, Søren. “Lights on the Water.” *Harbours of the North*, edited by Mina Hale, Fjord Books, 2020, pp. 45–67.',
      'Osei, Kwame. “Tides and Timetables.” *Journal of Maritime Studies*, vol. 12, no. 3, 2021, pp. 201–19, https://doi.org/10.1000/tides.2021.3.',
      'North Sea Ferry Board. “Ferry timetables.” *North Sea Ferries*, 2022, https://example.org/ferries.',
    ]);
  });

  test('Chicago author-date', () => {
    expect([book, chapter, article, web].map((s) => entry(s, 'chicago'))).toEqual([
      'Marlow, Ada, and Jonah Quill. 2019. *Night Ferry: A History of the North Sea Crossing*. Harbour Press.',
      'Björk, Søren. 2020. “Lights on the Water.” In *Harbours of the North*, edited by Mina Hale. Fjord Books.',
      'Osei, Kwame. 2021. “Tides and Timetables.” *Journal of Maritime Studies* 12 (3): 201–219. https://doi.org/10.1000/tides.2021.3.',
      'North Sea Ferry Board. 2022. “Ferry timetables.” North Sea Ferries. https://example.org/ferries.',
    ]);
  });

  test('a work with no author starts with its title, and three or more authors follow each style', () => {
    const untitled = { ...book, authors: [] };
    expect(entry(untitled, 'apa')).toBe(
      '*Night Ferry: A History of the North Sea Crossing*. (2019). Harbour Press.',
    );
    const three = { ...book, authors: [...book.authors, { family: 'Hale', given: 'Mina' }] };
    expect(entry(three, 'apa')).toMatch(/^Marlow, A., Quill, J., & Hale, M. \(2019\)/);
    expect(entry(three, 'mla')).toMatch(/^Marlow, Ada, et al\. \*/);
    expect(entry(three, 'chicago')).toMatch(/^Marlow, Ada, Jonah Quill, and Mina Hale\. 2019\./);
  });

  test('MLA shortens the second page number, and the list goes by author and year', () => {
    expect(['21-48', '89-116', '398-401', '201-219', '1003-1005', '1608-1774'].map(mlaPages)).toEqual([
      '21–48',
      '89–116',
      '398–401',
      '201–19',
      '1003–05',
      '1608–774',
    ]);
    expect(sortReferences([web, article, book, chapter], 'en').map((s) => s.authors[0]?.family)).toEqual([
      'Björk',
      'Marlow',
      'North Sea Ferry Board',
      'Osei',
    ]);
  });
});

describe('a bibliography in each export', () => {
  const sources = [book, article].map((s, i) => ({ ...s, key: `k${String(i)}` }));
  const paragraph = (content: JSONContent[]): JSONContent => ({
    type: 'doc',
    content: [{ type: 'paragraph', content }],
  });
  const cite = (key: string, page = '') => ({ type: 'cite', attrs: { key, page } });
  const request = (format: ExportRequest['format'], style: CiteStyle = 'apa'): ExportRequest => ({
    project: project('open', { settings: { citeStyle: style } }),
    items: [item('a', 'page', 'Essay')],
    scope: { kind: 'project' },
    updates: [
      [
        'a',
        updateOf(
          paragraph([{ type: 'text', text: 'The crossing took a night ' }, cite('k0', '12'), cite('gone')]),
          'prose',
        ),
      ],
    ],
    format,
    people: [],
    shareSafe: false,
    sources,
  });

  test('the tree has the in-text citations, one list of the cited sources, and a notice for a lost source', () => {
    const { doc } = prepareExport(request('markdown'));
    const last = doc.sections.at(-1);
    expect(last?.title).toBe('References');
    // Only the cited source is in the list.
    expect(last?.blocks).toHaveLength(2);
    expect(last?.blocks[1]).toMatchObject({ type: 'paragraph', hanging: true });
    expect(doc.missingSources).toBe(1);
    expect(exportNotices(doc, 'markdown')[0]).toBe(
      'A citation names a source that this project does not have now. It shows “[missing source]”.',
    );
    expect(prepareExport(request('markdown', 'mla')).doc.sections.at(-1)?.title).toBe('Works Cited');
  });

  test('Markdown, web, Word, EPUB and PDF each hold the citations and the list', async () => {
    const text = async (format: ExportRequest['format']) =>
      new TextDecoder().decode(
        (await makeExport(prepareExport(request(format)), undefined, { loadFile: loadPublicFile })).bytes,
      );
    const markdown = await text('markdown');
    expect(markdown).toContain('night (Marlow & Quill, 2019, p. 12)\\[missing source\\]');
    expect(markdown).toContain('## References');
    expect(markdown).toContain(
      'Marlow, A., & Quill, J. (2019). *Night Ferry: A History of the North Sea Crossing*. Harbour Press.',
    );
    expect(await text('web')).toContain('(Marlow &amp; Quill, 2019, p. 12)');

    const zip = async (format: 'docx' | 'epub') =>
      JSZip.loadAsync(
        (await makeExport(prepareExport(request(format)), undefined, { loadFile: loadPublicFile })).bytes,
      );
    const word = (await (await zip('docx')).file('word/document.xml')?.async('string')) ?? '';
    expect(word).toContain('(Marlow &amp; Quill, 2019, p. 12)');
    expect(word).toContain('References');
    expect(word).toMatch(/w:hanging="720"/);
    const epub = await zip('epub');
    const pages = await Promise.all(
      Object.keys(epub.files)
        .filter((name) => name.endsWith('.xhtml'))
        .map((name) => epub.file(name)?.async('string') ?? Promise.resolve('')),
    );
    expect(pages.join('')).toContain('(Marlow &amp; Quill, 2019, p. 12)');
    expect(pages.join('')).toContain('<p class="hanging">');

    const pdf = await makeExport(prepareExport(request('pdf')), undefined, { loadFile: loadPublicFile });
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe('%PDF-');
  });
});
