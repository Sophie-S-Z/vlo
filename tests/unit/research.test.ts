import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { backUpProject, collectBackup, importBackup, readBackup } from '@/features/backup/backup';
import { walkawayZip } from '@/features/export/walkaway';
import { createProject, deleteProject } from '@/features/library/projects';
import {
  addClipping,
  addResearchFiles,
  MAX_RESEARCH_FILE,
  MB,
  researchView,
} from '@/features/research/research';
import { db } from '@/lib/db';

/* Plan Task H6 (roadmap F41): the research folder. */

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
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo-item-')) indexedDB.deleteDatabase(d.name);
});

/** A small file that says it has `size` bytes, so a test needs no large buffer. */
function sized(name: string, size: number, type = 'application/pdf'): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

async function novel() {
  return (await createProject({ title: 'Salt Year', templates: ['novel'] })).project;
}

test('each kind of file has its view', () => {
  expect(researchView({ type: 'image/png' })).toBe('image');
  expect(researchView({ type: 'application/pdf' })).toBe('pdf');
  expect(researchView({ type: 'audio/mpeg' })).toBe('audio');
  expect(researchView({ type: 'text/plain', clip: { text: 'x' } })).toBe('clip');
  expect(researchView({ type: 'application/zip' })).toBe('other');
});

describe('research files', () => {
  test('a file over 50 MB is refused, and a project over 100 MB gets the warning', async () => {
    const project = await novel();
    const first = await addResearchFiles(project.id, [
      sized('map.pdf', 40 * MB),
      sized('huge.pdf', MAX_RESEARCH_FILE + 1),
    ]);
    expect(first.added.map((f) => f.name)).toEqual(['map.pdf']);
    expect(first.tooLarge).toEqual(['huge.pdf']);
    expect(first.large).toBe(false);
    const second = await addResearchFiles(project.id, [sized('a.pdf', 40 * MB), sized('b.pdf', 40 * MB)]);
    expect(second.large).toBe(true);
  });

  test('a backup keeps each file byte for byte, and a clipping link stays text', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const project = await novel();
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    await addResearchFiles(project.id, [new File([bytes], 'scan.png', { type: 'image/png' })]);
    await addClipping(project.id, '', 'Tides turn twice a day.\nMore here.', 'https://example.com/tides');

    const backup = await backUpProject(project.id, { music: false });
    await deleteProject(project.id);
    expect(await db.research.count()).toBe(0);
    await importBackup(await readBackup(backup.bytes), 'same');

    const rows = await db.research.where('projectId').equals(project.id).sortBy('addedAt');
    expect(rows.map((r) => r.name)).toEqual(['scan.png', 'Tides turn twice a day.']);
    const data = rows[0]?.data;
    expect(data && new Uint8Array(await data.arrayBuffer())).toEqual(bytes);
    expect(rows[1]?.clip).toEqual({
      text: 'Tides turn twice a day.\nMore here.',
      url: 'https://example.com/tides',
    });
    expect(rows[1]?.data).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();

    const copyId = await importBackup(await readBackup(backup.bytes), 'copy');
    const copies = await db.research.where('projectId').equals(copyId).toArray();
    expect(copies).toHaveLength(2);
    expect(copies.some((c) => rows.some((r) => r.id === c.id))).toBe(false);
  });

  test('a backup with a missing research file is refused', async () => {
    const project = await novel();
    await addResearchFiles(project.id, [new File(['x'], 'scan.png', { type: 'image/png' })]);
    const { bytes } = await backUpProject(project.id, { music: false });
    const zip = await JSZip.loadAsync(bytes);
    const [path] = Object.keys(zip.files).filter((p) => p.startsWith('research/'));
    if (path) zip.remove(path);
    await expect(readBackup(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(
      'The research file “scan.png” is missing.',
    );
  });

  test('"Download all my writing" puts the files in a Research folder of the project', async () => {
    const project = await novel();
    await addResearchFiles(project.id, [new File(['abc'], 'scan.png', { type: 'image/png' })]);
    await addClipping(project.id, 'Tides', 'Twice a day.', 'https://example.com/tides');
    const zip = await JSZip.loadAsync(await walkawayZip([await collectBackup(project.id, { music: false })]));
    expect(await zip.file('Salt Year/Research/scan.png')?.async('string')).toBe('abc');
    expect(await zip.file('Salt Year/Research/Tides.txt')?.async('string')).toBe(
      'Twice a day.\n\nLink: https://example.com/tides\n',
    );
  });
});
