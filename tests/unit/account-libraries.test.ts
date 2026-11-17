import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSession, saveSession, type AccountSession } from '@/features/account/session';
import { copyProject } from '@/features/backup/backup';
import { createProject } from '@/features/library/projects';
import { db, VloDb } from '@/lib/db';
import { itemDocName } from '@/lib/itemDocName';
import { claimLegacy, knownAccounts, libraryName, rememberAccount } from '@/lib/library';
import { docFromUpdate, readItemUpdate, writeItemUpdate } from '@/lib/ydocs';
import { proseUpdate } from './export-fixtures';

/* Each account has its own library on the device, and a merge copies works between two of them. */

const session = (userId: string, email: string): AccountSession => ({
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: Date.now() + 3_600_000,
  userId,
  email,
  provider: 'email',
});

async function deleteAll() {
  for (const d of await indexedDB.databases())
    if (d.name?.startsWith('vlo')) indexedDB.deleteDatabase(d.name);
}

beforeEach(async () => {
  localStorage.clear();
  await db.open();
});
afterEach(async () => {
  await db.delete();
  await deleteAll();
});

describe('a library for each account', () => {
  it('names a database and item texts for each account, apart from the library with no account', () => {
    expect(libraryName(null, { account: null, emails: {} })).toBe('vlo');
    expect(libraryName('u1', { account: null, emails: {} })).toBe('vlo-u1');
    // The account that was signed in before the upgrade keeps the first database.
    const upgraded = { account: 'u1', legacy: 'u1', emails: {} };
    expect(libraryName('u1', upgraded)).toBe('vlo');
    expect(libraryName(null, upgraded)).toBe('vlo-guest');
    expect(itemDocName('i1')).toBe('vlo-item-i1');
    expect(itemDocName('i1', 'vlo-u1')).toBe('vlo-u1-item-i1');
  });

  it('keeps the first database for the account signed in to it before the upgrade', async () => {
    await db.appMeta.put({ key: 'account', value: session('u1', 'mira@example.com') });
    expect((await readSession())?.userId).toBe('u1');
    expect((await readSession())?.userId).toBe('u1');
    expect(libraryName('u1')).toBe('vlo');
    expect(libraryName(null)).toBe('vlo-guest');
    expect(knownAccounts()).toEqual([{ id: 'u1', email: 'mira@example.com' }]);
    // A second account cannot take the first database.
    expect(claimLegacy('u2', 'other@example.com')).toBe(false);
  });

  it("keeps each sign-in in that account's own library", async () => {
    await saveSession(session('u2', 'ada@example.com'));
    expect(await readSession()).toBeNull();
    const library = new VloDb(libraryName('u2'));
    try {
      expect((await readSession(library))?.email).toBe('ada@example.com');
    } finally {
      library.close();
    }
    rememberAccount('u2', 'ada@example.com');
    expect(knownAccounts()).toEqual([{ id: 'u2', email: 'ada@example.com' }]);
  });
});

describe('a merge of two libraries', () => {
  async function poemIn(title: string) {
    const { project, firstItemId } = await createProject({ title, templates: ['poetry'] });
    await writeItemUpdate(firstItemId, proseUpdate(['The gulls slept.']), 1);
    return { project, itemId: firstItemId };
  }
  const text = async (itemId: string, library?: string) =>
    docFromUpdate(await readItemUpdate(itemId, library))
      .getXmlFragment('default')
      .toJSON();

  it('copies a project with its text, keeps the other library as it is, and copies a version once', async () => {
    const { project, itemId } = await poemIn('Tide');
    const other = new VloDb('vlo-u3');
    try {
      expect(await copyProject(project.id, db, other)).toBe(true);
      expect((await other.projects.get(project.id))?.title).toBe('Tide');
      expect(await text(itemId, 'vlo-u3')).toContain('The gulls slept.');
      expect(await db.projects.count()).toBe(1);
      // The same version again changes nothing.
      expect(await copyProject(project.id, db, other)).toBe(false);
      expect(await other.projects.count()).toBe(1);
    } finally {
      other.close();
    }
  });

  it('brings a changed version in as a copy, so neither version loses a word', async () => {
    const { project, itemId } = await poemIn('Tide');
    const other = new VloDb('vlo-u4');
    try {
      await copyProject(project.id, db, other);
      // The other account writes on in its own library.
      const doc = docFromUpdate(await readItemUpdate(itemId, 'vlo-u4'));
      doc.getXmlFragment('default').insert(0, [new Y.XmlElement('paragraph')]);
      await writeItemUpdate(itemId, Y.encodeStateAsUpdate(doc), 2, 'vlo-u4');
      await other.projects.update(project.id, { updatedAt: project.updatedAt + 1 });

      expect(await copyProject(project.id, other)).toBe(true);
      const titles = (await db.projects.toArray()).map((p) => p.title).sort();
      expect(titles).toEqual(['Tide', 'Tide (copy)']);
      // This library's own text did not take the other account's edit.
      expect(await text(itemId)).not.toBe(await text(itemId, 'vlo-u4'));
      expect(await copyProject(project.id, other)).toBe(false);
      expect(await db.projects.count()).toBe(2);
    } finally {
      other.close();
    }
  });
});
