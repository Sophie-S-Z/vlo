import { db, VloDb } from '@/lib/db';

/*
 * The writer's profile (ADR 0011): the full name, the name Vlo greets them by, a pen name, a short bio and a
 * photo. The account keeps it on the server (migration 0011), so it follows the writer to each device. A
 * copy stays in `appMeta` of the account's library, so the Library greets the writer with no wait and with
 * no connection. No backup or sync holds it. This module holds no network code, so the app shell can read
 * the copy; `profileServer.ts` talks to the server.
 */

const PROFILE_META = 'profile';

/** The step after a first sign-in where the writer gives a name, and the path to open after it. */
export const profileStep = (next: string) => `/profile/new?next=${encodeURIComponent(next)}`;

const LATER = 'vlo:profile-later';

/**
 * True when the server could not answer and the writer chose to go on in this browser tab. Blocked
 * storage counts as true, so the name step never traps the writer.
 */
export function profileLater(): boolean {
  try {
    return window.sessionStorage.getItem(LATER) === '1';
  } catch {
    return true;
  }
}

export function chooseProfileLater(): void {
  try {
    window.sessionStorage.setItem(LATER, '1');
  } catch {
    // Blocked storage: profileLater() is true then.
  }
}

export interface Profile {
  name: string;
  /** The name of the greeting. Empty: the first word of the name. */
  called: string;
  /** The byline of new projects. Empty: the name. */
  penName: string;
  bio: string;
  /** A data URL of a square JPEG or WebP, or null. */
  photo: string | null;
}

/** The longest text of each field. The server checks the same limits. */
export const LIMITS = { name: 80, called: 40, penName: 80, bio: 1000 } as const;

/** The largest photo data URL that the server takes. */
export const MAX_PHOTO = 60_000;

function isProfile(value: unknown): value is Profile {
  const p = value as Partial<Profile> | null;
  return (
    typeof p?.name === 'string' &&
    typeof p.called === 'string' &&
    typeof p.penName === 'string' &&
    typeof p.bio === 'string' &&
    (p.photo === null || typeof p.photo === 'string')
  );
}

/** One line of text with no control character, as the server keeps it. */
const line = (text: string) => text.replace(/\p{Cc}/gu, ' ').trim();

/** The profile as the server keeps it: trimmed, with no control character, and a bio with plain line ends. */
export function cleanProfile(profile: Profile): Profile {
  return {
    name: line(profile.name),
    called: line(profile.called),
    penName: line(profile.penName),
    bio: profile.bio
      .replace(/\r\n?/g, '\n')
      .replace(/[^\P{Cc}\n]/gu, ' ')
      .trim(),
    photo: profile.photo,
  };
}

/** The first problem of a profile, in words for the writer, or '' when the server takes it. */
export function profileProblem(profile: Profile): string {
  const p = cleanProfile(profile);
  if (p.name === '') return 'Type your name.';
  if (p.name.length > LIMITS.name) return `Keep your name to ${String(LIMITS.name)} characters.`;
  if (p.called.length > LIMITS.called) return `Keep this name to ${String(LIMITS.called)} characters.`;
  if (p.penName.length > LIMITS.penName) return `Keep your pen name to ${String(LIMITS.penName)} characters.`;
  if (p.bio.length > LIMITS.bio) return `Keep your bio to ${String(LIMITS.bio)} characters.`;
  if (p.photo !== null && p.photo.length > MAX_PHOTO) return 'This photo is too large. Pick another photo.';
  return '';
}

/** The name of the greeting: the name the writer picked, or the first word of the full name. */
export function greetingName(profile: Pick<Profile, 'name' | 'called'>): string {
  return profile.called.trim() || (profile.name.trim().split(/\s+/)[0] ?? '');
}

/** The byline of new projects: the pen name, or the full name. */
export function byline(profile: Pick<Profile, 'name' | 'penName'>): string {
  return profile.penName.trim() || profile.name.trim();
}

/** Up to two letters for a profile with no photo: the first and the last word of the name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const ends = words.length > 1 ? [words[0], words.at(-1)] : words;
  return ends.map((word) => Array.from(word ?? '')[0]?.toLocaleUpperCase() ?? '').join('');
}

/** The copy of the profile on this device, or null. */
export async function readProfile(database: VloDb = db): Promise<Profile | null> {
  const value = (await database.appMeta.get(PROFILE_META))?.value;
  return isProfile(value) ? value : null;
}

/** Keeps a copy of the profile in a library, the open one by default. */
export async function keepProfile(profile: Profile, database: VloDb = db): Promise<void> {
  await database.appMeta.put({ key: PROFILE_META, value: profile });
}
