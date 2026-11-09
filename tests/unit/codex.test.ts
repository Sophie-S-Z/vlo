import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { backUpProject, importBackup, readBackup } from '@/features/backup/backup';
import { addEntry, cleanAliases, codexMatcher, mentionMatrix, updateEntry } from '@/features/codex/codex';
import { createProject } from '@/features/library/projects';
import { db, type CodexEntry } from '@/lib/db';

/* Plan Task H5 (roadmap F42): the Codex. The view-row backup tests in views-data.test.ts hold an entry. */

const entry = (id: string, name: string, aliases: string[] = []): CodexEntry => ({
  id,
  projectId: 'p',
  kind: 'character',
  name,
  aliases,
  order: 'a0',
});

const found = (entries: CodexEntry[], text: string) =>
  codexMatcher(entries)(text).map((m) => `${m.entryId}:${text.slice(m.from, m.to)}`);

describe('codexMatcher', () => {
  test('"Mira" and "Mira\'s" match, "Miranda" and "mira" do not', () => {
    expect(found([entry('m', 'Mira')], "Mira's boat. Miranda and mira wait. Mira.")).toEqual([
      'm:Mira',
      'm:Mira',
    ]);
  });

  test('an other name finds its entry, and the longest name wins', () => {
    const entries = [entry('m', 'Mira', ['Mi']), entry('h', 'Mira Hale')];
    expect(found(entries, 'Mira Hale met Mi.')).toEqual(['h:Mira Hale', 'm:Mi']);
  });

  test('a name with signs in it matches as typed', () => {
    expect(found([entry('s', 'St. Ives (old)')], 'Back to St. Ives (old) by noon.')).toEqual([
      's:St. Ives (old)',
    ]);
    expect(codexMatcher([])('Mira')).toEqual([]);
  });
});

test('the matrix counts each entry in each item', () => {
  const entries = [entry('m', 'Mira', ['Mi']), entry('h', 'Harbour')];
  const matrix = mentionMatrix(entries, [
    { itemId: 'one', text: 'Mira saw Mi in the Harbour.' },
    { itemId: 'two', text: 'Nobody came.' },
  ]);
  expect(matrix.get('m')?.get('one')).toBe(2);
  expect(matrix.get('h')?.get('one')).toBe(1);
  expect(matrix.get('m')?.has('two')).toBe(false);
});

test('other names come from a list with commas, once each, and never the name itself', () => {
  expect(cleanAliases(' Mi, the girl ,Mi,, Mira', 'Mira')).toEqual(['Mi', 'the girl']);
});

describe('Codex rows', () => {
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

  test('an entry saves its fields, and a blank name is refused', async () => {
    const { project } = await createProject({ title: 'Salt Year', templates: ['novel'] });
    const mira = await addEntry(project.id, 'character', ' Mira ');
    await updateEntry(mira.id, { aliases: 'Mi', note: ' Owes money. ', kind: 'lore' });
    expect(await db.codex.get(mira.id)).toMatchObject({
      name: 'Mira',
      aliases: ['Mi'],
      note: 'Owes money.',
      kind: 'lore',
    });
    await expect(updateEntry(mira.id, { name: '  ' })).rejects.toThrow('Type a name.');
    await updateEntry(mira.id, { note: '' });
    expect((await db.codex.get(mira.id))?.note).toBeUndefined();
  });

  test('a version 3 backup with no Codex still imports, and a damaged entry is refused', async () => {
    const { project } = await createProject({ title: 'Salt Year', templates: ['novel'] });
    await addEntry(project.id, 'place', 'Harbour');
    const { bytes } = await backUpProject(project.id, { music: false });

    const rewrite = async (change: (m: Record<string, unknown>) => void) => {
      const zip = await JSZip.loadAsync(bytes);
      const manifest = JSON.parse((await zip.file('project.json')?.async('string')) ?? '{}') as Record<
        string,
        unknown
      >;
      change(manifest);
      zip.file('project.json', JSON.stringify(manifest));
      return zip.generateAsync({ type: 'uint8array' });
    };

    const old = await readBackup(
      await rewrite((m) => {
        m.version = 3;
        delete m.codex;
      }),
    );
    const copyId = await importBackup(old, 'copy');
    expect(await db.codex.where('projectId').equals(copyId).count()).toBe(0);

    await expect(
      readBackup(
        await rewrite((m) => {
          const [first] = m.codex as Record<string, unknown>[];
          if (first) first.kind = 'planet';
        }),
      ),
    ).rejects.toThrow('A Codex entry has a wrong kind.');
  });
});
