import { readFileSync } from 'node:fs';
import type { JSONContent } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { backUpProject, readBackup } from '@/features/backup/backup';
import { parseBibtex } from '@/features/cite/sources';
import { prepareExport, type ExportRequest } from '@/features/export/run';
import { createProject } from '@/features/library/projects';
import { FIRST_STRUCTURE } from '@/features/library/firstStructure';
import { SECTION_LIBRARY, STRUCTURES, structureFor, structuresOf } from '@/features/library/structures';
import { projectDef, TEMPLATE_ORDER, TEMPLATES } from '@/features/library/templates';
import { rangeLabel, rangeState } from '@/features/modes/SectionGuide';
import { db, type Item, type Source, type Template } from '@/lib/db';
import { item, project, updateOf } from './export-fixtures';

/* Phase 17 Q-B: the Essay, Article and Research paper modes, their structures, guides and References page. */

const MODES: Template[] = ['essay', 'article', 'research'];

describe('the structures', () => {
  test('each new mode has structures, each with a unique id and a section to type in first', () => {
    const ids = new Set<string>();
    for (const mode of MODES) {
      const list = structuresOf(mode);
      expect(list.length).toBeGreaterThanOrEqual(5);
      for (const structure of list) {
        expect(ids.has(structure.id)).toBe(false);
        ids.add(structure.id);
        const flat = structure.items.flatMap((i) => [i, ...(i.children ?? [])]);
        // The first section that takes text is not the References page.
        expect(flat.find((i) => i.kind === 'page' && i.role === undefined)).toBeDefined();
        // Every kind fits the template's binder.
        for (const i of flat) expect(TEMPLATES[mode].kinds).toContain(i.kind);
        // A word range has a minimum under its maximum.
        for (const i of flat)
          if (i.words?.min !== undefined && i.words.max !== undefined)
            expect(i.words.min).toBeLessThan(i.words.max);
      }
    }
    expect(ids.size).toBe(STRUCTURES.length);
  });

  test('each mode with no choice starts from its first structure', () => {
    for (const mode of MODES) expect(FIRST_STRUCTURE[mode]).toBe(structuresOf(mode)[0]?.id);
    expect(Object.keys(FIRST_STRUCTURE).sort()).toEqual([...MODES].sort());
  });

  test('a structure belongs to its own template only', () => {
    expect(structureFor('research', 'imrad')?.label).toBe('Research paper (IMRaD)');
    expect(structureFor('essay', 'imrad')).toBeUndefined();
    expect(structureFor('research', undefined)).toBeUndefined();
  });

  test('the new templates go after the old ones, so stored projects keep their order', () => {
    expect(TEMPLATE_ORDER.slice(0, 5)).toEqual(['novel', 'memoir', 'poetry', 'open', 'script']);
    expect(projectDef(['research']).kindLabel.page).toBe('Section');
    expect(SECTION_LIBRARY.filter((s) => s.role === 'references').map((s) => s.title)).toEqual([
      'References',
      'Works Cited',
      'Bibliography',
    ]);
  });

  test('a word range reads as words, and the count is under, in or over it', () => {
    expect(rangeLabel({ min: 150, max: 250 })).toBe('150–250 words');
    expect(rangeLabel({ max: 650 })).toBe('at most 650 words');
    expect(rangeLabel({ min: 0, max: 250 })).toBe('at most 250 words');
    expect(rangeLabel({ min: 400 })).toBe('at least 400 words');
    expect(rangeState(100, { min: 150, max: 250 })).toBe('under');
    expect(rangeState(200, { min: 150, max: 250 })).toBe('in');
    expect(rangeState(300, { min: 150, max: 250 })).toBe('over');
    expect(rangeState(10, undefined)).toBeNull();
  });
});

describe('a new project from a structure', () => {
  beforeEach(async () => {
    await db.open();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: () => Promise.resolve(true) },
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'storage');
    await db.delete();
  });

  test('IMRaD makes each section with its guide and range, a References page, and APA', async () => {
    const { project: made, firstItemId } = await createProject({
      title: 'Tides',
      templates: ['research'],
      structures: { research: 'imrad' },
    });
    const items = await db.items.where('projectId').equals(made.id).sortBy('order');
    expect(items.map((i) => i.title)).toEqual([
      'Abstract',
      'Introduction',
      'Methods',
      'Results',
      'Discussion',
      'Conclusion',
      'References',
    ]);
    expect(items[0]?.id).toBe(firstItemId);
    expect(items[0]?.words).toEqual({ min: 150, max: 250 });
    expect(items[0]?.guide).toMatch(/^One paragraph/);
    expect(items.at(-1)?.role).toBe('references');
    expect(made.settings.citeStyle).toBe('apa');

    // A backup keeps the guide, the range and the role.
    const backup = await readBackup((await backUpProject(made.id, { music: false })).bytes);
    const abstract = backup.items.find((i) => i.title === 'Abstract');
    expect(abstract?.guide).toBe(items[0]?.guide);
    expect(abstract?.words).toEqual({ min: 150, max: 250 });
    expect(backup.items.find((i) => i.title === 'References')?.role).toBe('references');
  });

  test('a literature review nests its themes, and an essay with no choice uses its own starter', async () => {
    const review = await createProject({
      title: 'Review',
      templates: ['research'],
      structures: { research: 'literature-review' },
    });
    const rows = await db.items.where('projectId').equals(review.project.id).toArray();
    const themes = rows.find((i) => i.title === 'Themes');
    expect(themes?.kind).toBe('part');
    expect(
      rows
        .filter((i) => i.parentId === themes?.id)
        .sort((a, b) => a.order.localeCompare(b.order))
        .map((i) => i.title),
    ).toEqual(['Theme 1', 'Theme 2', 'Theme 3']);

    const essay = await createProject({ title: 'Essay', templates: ['essay'] });
    const essayRows = await db.items.where('projectId').equals(essay.project.id).sortBy('order');
    expect(essayRows.map((i) => i.title)).toEqual(['Introduction', 'Body', 'Conclusion']);
    expect(essay.project.settings.citeStyle).toBeUndefined();
    expect(essayRows.every((i) => i.workingTitle === true)).toBe(true);
  });

  test('essay and article sections have working titles, except the ones a reader sees as headings', async () => {
    const titles = (id: string, on: boolean) =>
      STRUCTURES.find((s) => s.id === id)
        ?.items.filter((i) => (i.workingTitle === true) === on)
        .map((i) => i.title);
    expect(titles('news', false)).toEqual([]);
    expect(titles('how-to', true)).toEqual(['Introduction']);
    expect(titles('listicle', true)).toEqual(['Introduction', 'Conclusion']);
    expect(titles('imrad', true)).toEqual([]);

    const made = await createProject({
      title: 'Ferry',
      templates: ['article'],
      structures: { article: 'news' },
    });
    const backup = await readBackup((await backUpProject(made.project.id, { music: false })).bytes);
    expect(backup.items.find((i) => i.title === 'Lede')?.workingTitle).toBe(true);
  });
});

describe('the References page in an export', () => {
  const sources: Source[] = parseBibtex(readFileSync('tests/fixtures/sources/zotero.bib', 'utf8')).map(
    (draft, i) => ({ ...draft, id: `s${String(i)}`, projectId: 'p1', key: `k${String(i)}` }),
  );
  const paragraph = (content: JSONContent[]): JSONContent => ({
    type: 'doc',
    content: [{ type: 'paragraph', content }],
  });
  const request = (cite: boolean): ExportRequest => ({
    project: project('research', { settings: { citeStyle: 'mla' } }),
    items: [
      item('a', 'page', 'Introduction'),
      { ...item('r', 'page', 'References'), role: 'references' } satisfies Item,
      item('z', 'page', 'Appendix'),
    ],
    scope: { kind: 'project' },
    updates: [
      [
        'a',
        updateOf(
          paragraph([
            { type: 'text', text: 'The crossing took a night ' },
            ...(cite ? [{ type: 'cite', attrs: { key: 'k0', page: '12' } }] : []),
          ]),
          'prose',
        ),
      ],
      ['z', updateOf(paragraph([{ type: 'text', text: 'Tables.' }]), 'prose')],
    ],
    format: 'markdown',
    people: [],
    shareSafe: false,
    sources,
  });

  test('the list of the cited sources goes where the page is, not at the end', () => {
    const { doc } = prepareExport(request(true));
    expect(doc.sections.map((s) => s.title)).toEqual(['Introduction', 'Works Cited', 'Appendix']);
    // One cited source: the heading and one entry.
    expect(doc.sections[1]?.blocks).toHaveLength(2);
  });

  test('with no citation, the page lists every source of the project', () => {
    const { doc } = prepareExport(request(false));
    expect(doc.sections.map((s) => s.title)).toEqual(['Introduction', 'Works Cited', 'Appendix']);
    expect(doc.sections[1]?.blocks).toHaveLength(1 + sources.length);
  });

  test('a section with a working title gives no heading, so the sections read as one piece', () => {
    const base = request(false);
    const { doc } = prepareExport({
      ...base,
      items: base.items.map((i) => (i.id === 'a' ? { ...i, workingTitle: true as const } : i)),
    });
    const headings = doc.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'heading'));
    expect(headings).toHaveLength(2);
    expect(doc.sections[0]?.blocks.map((b) => b.type)).toEqual(['paragraph']);
  });

  test('with no sources at all, the page leaves no empty heading', () => {
    const { doc } = prepareExport({ ...request(false), sources: [] });
    expect(doc.sections.map((s) => s.title)).toEqual(['Introduction', 'Appendix']);
  });
});
