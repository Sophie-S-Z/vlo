import { Dexie } from 'dexie';
import { copyProject } from '@/features/backup/backup';
import { ONBOARDED } from '@/features/onboarding/firstVisit';
import { rpc } from '@/features/share/rpc';
import { clock } from '@/lib/clock';
import { db, VloDb } from '@/lib/db';
import { deleteItemDoc } from '@/lib/itemDocName';
import { forgetAccount, knownAccounts, libraryName, openLibrary } from '@/lib/library';
import { inBatches } from '@/lib/ydocs';
import { clearAccountSyncPause } from './accountSync';
import { keepProfile, profileStep } from './profile';
import { fetchProfile } from './profileServer';
import { readSession, type AccountSession } from './session';

/*
 * The libraries on this device (one for each account, and one with no account) and the merge of their
 * works. A merge copies, so the other library keeps its works. Only a library with no account, or one
 * whose account is signed in on this device, can give its works: a signed-out account's works stay hidden.
 */

export interface OtherLibrary {
  /** The account, or null for the library with no account. */
  account: string | null;
  email: string;
  works: number;
  /** True when the account is signed in on this device, so Vlo can switch to it. */
  signedIn: boolean;
}

/** Runs `fn` on a library, opened for this call when it is not the open one. */
async function withLibrary<T>(name: string, fn: (library: VloDb) => Promise<T>): Promise<T> {
  if (name === db.name) return fn(db);
  const library = new VloDb(name);
  try {
    return await fn(library);
  } finally {
    library.close();
  }
}

/** The other libraries on this device that can give works, or that Vlo can switch to. */
export async function otherLibraries(): Promise<OtherLibrary[]> {
  // By database name, not by account: an upgrade can make the open library an account's mid-page.
  const candidates = [{ id: null, email: '' }, ...knownAccounts()].filter(
    ({ id }) => libraryName(id) !== db.name,
  );
  const found = await Promise.all(
    candidates.map(async ({ id, email }): Promise<OtherLibrary | null> => {
      const name = libraryName(id);
      if (!(await Dexie.exists(name))) return null;
      return withLibrary(name, async (library) => {
        const works = await library.projects.count();
        const signedIn = id !== null && (await readSession(library)) !== null;
        return id === null && works === 0 ? null : { account: id, email, works, signedIn };
      });
    }),
  );
  return found.filter((l): l is OtherLibrary => l !== null && (l.signedIn || l.account === null));
}

/** Copies every work of another library into the open one. Returns how many came in. */
export async function bringWorks(from: OtherLibrary): Promise<number> {
  if (from.account !== null && !from.signedIn) throw new Error('Sign in to that account first.');
  return withLibrary(libraryName(from.account), async (source) => {
    let copied = 0;
    for (const id of await source.projects.toCollection().primaryKeys())
      if (await copyProject(id, source)) copied += 1;
    return copied;
  });
}

/**
 * After a sign-in: opens the account's library. A returning account skips the welcome, since sync fills
 * its library. When works wait in the library with no account and the account has none, the Account page
 * opens, where the writer can bring them in. An account with no profile gives its name first.
 */
export async function enterAccount(session: AccountSession, next = '/'): Promise<void> {
  const [vaults, profile] = await Promise.all([
    rpc<unknown[]>('vault_get', {}, 'account', session.accessToken).catch(() => []),
    // Undefined when the server did not answer: the Library asks for the profile again as it opens.
    fetchProfile(session.accessToken).catch(() => undefined),
  ]);
  const empty = await withLibrary(libraryName(session.userId), async (library) => {
    await clearAccountSyncPause(library);
    if (profile) await keepProfile(profile, library);
    // The welcome is for a first visit: not for an account that syncs, nor for a writer who saw it here.
    const seen = vaults.length > 0 || (await db.appMeta.get(ONBOARDED)) !== undefined;
    if (seen && !(await library.appMeta.get(ONBOARDED)))
      await library.appMeta.put({ key: ONBOARDED, value: clock.now() });
    return (await library.projects.count()) === 0;
  });
  const waiting =
    empty &&
    (await Dexie.exists(libraryName(null))) &&
    (await withLibrary(libraryName(null), (library) => library.projects.count())) > 0;
  const to = waiting ? '/account' : next;
  openLibrary(session.userId, profile === null ? profileStep(to) : to);
}

/**
 * After the account's deletion on the server: its works move to the library with no account, as the
 * device kept them before, and its own library leaves this device. Then that library opens.
 */
export async function leaveDeletedAccount(account: string): Promise<void> {
  await withLibrary(libraryName(null), async (device) => {
    for (const id of await db.projects.toCollection().primaryKeys()) await copyProject(id, db, device);
  });
  const items = await db.items.toCollection().primaryKeys();
  await inBatches(items, (id) => deleteItemDoc(id));
  await db.delete();
  forgetAccount(account);
  openLibrary(null);
}
