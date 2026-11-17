/*
 * Each account has its own library on this device: its own database and its own item texts, so two
 * accounts in one browser never share a project. The library with no account belongs to the device. The
 * state stays in localStorage, so the database name is known before any code opens it. A switch to
 * another library loads the page again. This module holds no database or network code.
 */

const KEY = 'vlo:library';
const GUEST = 'vlo:guest';

interface LibraryState {
  /** The account whose library is open, or null for the library with no account. */
  account: string | null;
  /**
   * The account that was signed in before Vlo kept a library for each account. Its library keeps the
   * first database name, "vlo", so no word moves.
   */
  legacy?: string;
  /** The email of each account that signed in on this device, by account id. */
  emails: Record<string, string>;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readState(): LibraryState {
  try {
    const value = JSON.parse(storage()?.getItem(KEY) ?? 'null') as Partial<LibraryState> | null;
    return {
      account: typeof value?.account === 'string' ? value.account : null,
      ...(typeof value?.legacy === 'string' ? { legacy: value.legacy } : {}),
      emails: { ...value?.emails },
    };
  } catch {
    return { account: null, emails: {} };
  }
}

function writeState(state: LibraryState): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(state));
  } catch {
    // Blocked storage: the open library stays as it is for this page.
  }
}

/** The database name of an account's library, or of the library with no account (null). */
export function libraryName(account: string | null, state: LibraryState = readState()): string {
  if (account === null) return state.legacy === undefined ? 'vlo' : 'vlo-guest';
  return account === state.legacy ? 'vlo' : `vlo-${account}`;
}

const opened = readState();

/** The account of the library that this page opened, or null. */
export const ACTIVE_ACCOUNT = opened.account;

/** The database name of the library that this page opened. */
export const LIBRARY = libraryName(opened.account, opened);

/** The accounts that signed in on this device, with their emails. */
export function knownAccounts(): { id: string; email: string }[] {
  return Object.entries(readState().emails).map(([id, email]) => ({ id, email }));
}

export function rememberAccount(id: string, email: string): void {
  const state = readState();
  writeState({ ...state, emails: { ...state.emails, [id]: email } });
}

/** Forgets a deleted account. Its library name stays the same while the page is open. */
export function forgetAccount(id: string): void {
  const state = readState();
  writeState({
    ...state,
    emails: Object.fromEntries(Object.entries(state.emails).filter(([key]) => key !== id)),
  });
}

/**
 * Keeps the first database for the account that was signed in to it, so an upgrade moves no word. Only
 * the library with no account, before any claim, holds such a session. Returns true when the first
 * database is that account's library.
 */
export function claimLegacy(account: string, email: string): boolean {
  if (LIBRARY !== 'vlo') return false;
  const state = readState();
  if (state.legacy === account) return true;
  if (state.account !== null || state.legacy !== undefined) return false;
  writeState({ account, legacy: account, emails: { ...state.emails, [account]: email } });
  return true;
}

/** Opens the library of an account, or the one with no account (null), at `path`. */
export function openLibrary(account: string | null, path = '/'): void {
  writeState({ ...readState(), account });
  window.location.assign(path);
}

/** True when the writer chose to write with no account in this browser tab. */
export function guestChosen(): boolean {
  try {
    return window.sessionStorage.getItem(GUEST) === '1';
  } catch {
    return true;
  }
}

export function chooseGuest(): void {
  try {
    window.sessionStorage.setItem(GUEST, '1');
  } catch {
    // Blocked storage: guestChosen() is true then, so the sign-in screen never traps the writer.
  }
}
