import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import * as Y from 'yjs';
import { afterAll, describe, expect, test } from 'vitest';
import { runExport, type ExportRequest } from '@/features/export/run';
import { markNames } from '@/features/people/markAll';
import type { PrivatePerson } from '@/lib/privacy';
import { docFromUpdate } from '@/lib/ydocs';
import { item, loadPublicFile, MEMOIR_TEXT, project, proseUpdate, updateOf } from './export-fixtures';

/*
 * The private-name leak test (spec US06, plan Task C5, Gate 3). The memoir fixture goes out in each
 * format with share-safe export on, and each file is read back as text: "Rosa" and "Teo" appear 0 times.
 * One memory has its names marked, one has none, and a third holds a name in a footnote, in a comment and
 * in its title (Review Focus 4 of Phase 8: exports leave comments out). The Codex is in no export request.
 */

const hasPoppler = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).status === 0;
if (process.env.VLO_REQUIRE_POPPLER === '1' && !hasPoppler) {
  throw new Error('This run needs Poppler (pdftotext), and it is not installed.');
}

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

const REAL = /Rosa|Teo/g;
const MEMOIR = MEMOIR_TEXT.trim().split('\n');

const dir = mkdtempSync(join(tmpdir(), 'vlo-leak-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

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
          {
            type: 'text',
            text: 'The letter',
            marks: [{ type: 'comment', attrs: { id: 'c1', text: 'Ask Rosa about Uncle Teo.', at: 1 } }],
          },
          { type: 'text', text: ' from Teo' },
          { type: 'footnote', attrs: { content: [{ type: 'text', text: 'Aunt Rosa kept it.' }] } },
        ],
      },
    ],
  },
  'prose',
);

function request(format: ExportRequest['format'], manuscript = false): ExportRequest {
  // Standard manuscript format is for novels, so that run puts the same memories in a novel.
  const kind = manuscript ? 'scene' : 'memory';
  return {
    project: { ...project(manuscript ? 'novel' : 'memoir'), title: 'Summers with Rosa' },
    items: [
      item('m1', kind, 'Rosa at the coast'),
      item('m2', kind, 'Uncle Teo stays'),
      item('m3', kind, 'Letters'),
    ],
    scope: { kind: 'project' },
    updates: [
      ['m1', marked()],
      ['m2', proseUpdate(MEMOIR)],
      ['m3', withNote],
    ],
    format,
    people: PEOPLE,
    shareSafe: true,
    ...(manuscript ? { manuscript: { name: 'Ada Marlow', contact: '', typewriter: false } } : {}),
  };
}

async function zipText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const parts = await Promise.all(
    Object.values(zip.files)
      .filter((f) => !f.dir)
      .map((f) => f.async('string')),
  );
  return parts.join('\n');
}

let count = 0;
async function pdfText(bytes: Uint8Array): Promise<string> {
  count += 1;
  const path = join(dir, `leak-${String(count)}.pdf`);
  writeFileSync(path, bytes);
  const pdf = await PDFDocument.load(bytes);
  return [execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' }), pdf.getTitle() ?? ''].join('\n');
}

async function exported(format: ExportRequest['format'], manuscript = false): Promise<string> {
  const file = await runExport(request(format, manuscript), new Map(), { loadFile: loadPublicFile });
  expect(file.name).not.toMatch(REAL);
  if (format === 'markdown') return new TextDecoder().decode(file.bytes);
  if (format === 'pdf') return pdfText(file.bytes);
  return zipText(file.bytes);
}

describe('no real name leaves in a share-safe export (US06)', () => {
  test('Markdown', async () => {
    const text = await exported('markdown');
    expect(text.match(REAL)).toBeNull();
    expect(text).toContain('Aunt Maria drove us to the coast');
    expect(text).toContain('Uncle Sam stayed behind');
  });

  test('Word', async () => {
    const text = await exported('docx');
    expect(text.match(REAL)).toBeNull();
    expect(text).toContain('Maria never said why');
  });

  test('EPUB', async () => {
    const text = await exported('epub');
    expect(text.match(REAL)).toBeNull();
    expect(text).toContain('Summers with Maria');
  });

  test.skipIf(!hasPoppler)('PDF', async () => {
    const text = await exported('pdf');
    expect(text.match(REAL)).toBeNull();
    expect(text).toContain('Maria never said why');
  });

  test('standard manuscript format in Word', async () => {
    const text = await exported('docx', true);
    expect(text.match(REAL)).toBeNull();
    expect(text).toContain('Aunt Maria kept it.');
  });

  test.skipIf(!hasPoppler)('standard manuscript format in PDF', async () => {
    const text = await exported('pdf', true);
    expect(text.match(REAL)).toBeNull();
    expect(text).toContain('Uncle Sam');
  });
});
