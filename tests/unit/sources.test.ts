import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { backUpProject, importBackup, readBackup } from '@/features/backup/backup';
import {
  addSources,
  deleteSource,
  namesFromText,
  namesToText,
  parseBibtex,
  parseCslJson,
  readSourceFile,
  restoreSource,
  sourcesFor,
  updateSource,
  type SourceDraft,
} from '@/features/cite/sources';
import { createProject, deleteProject } from '@/features/library/projects';
import { db, VloDb } from '@/lib/db';

/* Roadmap 2 F64, plan Task M5: sources from Zotero, keys, and the sources in storage and backups. */

const BIB = readFileSync('tests/fixtures/sources/zotero.bib', 'utf8');
const CSL = readFileSync('tests/fixtures/sources/zotero.json', 'utf8');

const withoutKey = (draft: SourceDraft) => ({ ...draft, key: undefined });

beforeEach(async () => {
  await db.open();
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: () => Promise.resolve(true) },
  });
});
afterEach(async () => {
  Reflect.deleteProperty(navigator, 'storage');
  await db.delete();
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
});

describe('Sources from Zotero', () => {
  test('a BibTeX file gives each type with its authors, title, container, year, pages and DOI', () => {
    const [book, chapter, article, web] = parseBibtex(BIB);
    expect(book).toEqual({
      key: 'marlow_night_2019',
      type: 'book',
      authors: [
        { family: 'Marlow', given: 'Ada' },
        { family: 'Quill', given: 'Jonah' },
      ],
      title: 'Night Ferry: A History of the North Sea Crossing',
      publisher: 'Harbour Press',
      year: '2019',
    });
    expect(chapter).toEqual({
      key: 'bjork_lights_2020',
      type: 'chapter',
      // LaTeX accents become letters.
      authors: [{ family: 'Björk', given: 'Søren' }],
      editors: [{ family: 'Hale', given: 'Mina' }],
      title: 'Lights on the Water',
      container: 'Harbours of the North',
      publisher: 'Fjord Books',
      year: '2020',
      pages: '45–67',
    });
    expect(article).toEqual({
      key: 'osei_tides_2021',
      type: 'article',
      authors: [{ family: 'Osei', given: 'Kwame' }],
      title: 'Tides and Timetables',
      container: 'Journal of Maritime Studies',
      year: '2021',
      volume: '12',
      issue: '3',
      pages: '201–219',
      doi: '10.1000/tides.2021.3',
      // A URL keeps its "~".
      url: 'https://example.org/~osei/tides',
    });
    // A name in double braces is a group.
    expect(web?.authors).toEqual([{ family: 'North Sea Ferry Board' }]);
    expect(web?.type).toBe('web');
    expect(web?.container).toBe('North Sea Ferries');
  });

  test('a CSL-JSON file of the same sources gives the same sources', () => {
    const csl = parseCslJson(CSL);
    expect(csl.map(withoutKey)).toEqual(parseBibtex(BIB).map(withoutKey));
    // An id that is a Zotero link is no key, so Vlo makes one.
    expect(csl.map((s) => s.key)).toEqual([undefined, 'bjork2020', 'osei2021', 'board2022']);
  });

  test('a file that Vlo cannot read, or with no title, gives a message', () => {
    expect(() => readSourceFile('refs.json', '[{')).toThrow('Vlo could not read this file.');
    expect(() => readSourceFile('refs.bib', '@book{x, year = {2019}}')).toThrow('no source with a title');
    expect(readSourceFile('refs.bib', BIB)).toHaveLength(4);
    expect(readSourceFile('refs.json', CSL)).toHaveLength(4);
  });

  test('the form reads one name on each line, as "Family, Given" or "Given Family"', () => {
    const names = namesFromText('Marlow, Ada\nJonah Quill\n\nNorth Sea Ferry Board,');
    expect(names).toEqual([
      { family: 'Marlow', given: 'Ada' },
      { family: 'Quill', given: 'Jonah' },
      { family: 'North Sea Ferry Board' },
    ]);
    expect(namesToText(names)).toBe('Marlow, Ada\nQuill, Jonah\nNorth Sea Ferry Board');
  });
});

describe('Sources in a project', () => {
  test('a key that the project has, or that the file has twice, gets a suffix', async () => {
    const { project } = await createProject({ title: 'Essays', templates: ['open'] });
    const [first] = await addSources(project.id, parseCslJson(CSL).slice(0, 1));
    expect(first?.key).toBe('marlow2019');
    const again = await addSources(project.id, [...parseCslJson(CSL).slice(0, 1), ...parseCslJson(CSL)]);
    expect(again.map((s) => s.key)).toEqual([
      'marlow2019-2',
      'marlow2019-3',
      'bjork2020',
      'osei2021',
      'board2022',
    ]);
  });

  test('an edit keeps the key, and Undo of a delete gives the same source', async () => {
    const { project } = await createProject({ title: 'Essays', templates: ['open'] });
    const [source] = await addSources(project.id, parseBibtex(BIB).slice(0, 1));
    if (!source) throw new Error('No source.');
    await updateSource(source.id, { ...source, key: 'other', title: '  Night Ferry  ', year: '' });
    const edited = await db.sources.get(source.id);
    expect(edited?.key).toBe('marlow_night_2019');
    expect(edited?.title).toBe('Night Ferry');
    expect(edited?.year).toBeUndefined();
    await expect(updateSource(source.id, { ...source, title: ' ' })).rejects.toThrow('Type a title.');
    const deleted = await deleteSource(source.id);
    expect(await sourcesFor(project.id)).toEqual([]);
    if (deleted) await restoreSource(deleted);
    expect(await sourcesFor(project.id)).toEqual([edited]);
  });

  test('sources survive a reload, a backup and an import, and a copy keeps each key', async () => {
    const { project } = await createProject({ title: 'Essays', templates: ['open'] });
    await addSources(project.id, parseBibtex(BIB));
    const before = await sourcesFor(project.id);
    expect(before).toHaveLength(4);

    const reopened = new VloDb('vlo');
    await reopened.open();
    expect(await reopened.sources.where('projectId').equals(project.id).count()).toBe(4);
    reopened.close();

    const { bytes } = await backUpProject(project.id, { music: false });
    await deleteProject(project.id);
    expect(await db.sources.count()).toBe(0);
    await importBackup(await readBackup(bytes), 'same');
    expect(await sourcesFor(project.id)).toEqual(before);

    const copyId = await importBackup(await readBackup(bytes), 'copy');
    const copy = await sourcesFor(copyId);
    expect(copy.map((s) => s.key)).toEqual(before.map((s) => s.key));
    expect(copy.some((s) => before.some((b) => b.id === s.id))).toBe(false);
  });
});
