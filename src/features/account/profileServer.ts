import { rpc, ShareError } from '@/features/share/rpc';
import { accountRpc, AuthError } from './auth';
import { cleanProfile, keepProfile, type Profile } from './profile';

/* The calls of migration 0011 for the writer's profile (ADR 0011). */

interface Row {
  name: string;
  called: string;
  pen_name: string;
  bio: string;
  photo: string | null;
}

const fromRow = (row: Row): Profile => ({
  name: row.name,
  called: row.called,
  penName: row.pen_name,
  bio: row.bio,
  photo: row.photo,
});

/** The profile of the account of an access token on the server, or null when it has none yet. */
export async function fetchProfile(accessToken: string): Promise<Profile | null> {
  const [row] = await rpc<Row[]>('profile_get', {}, 'account', accessToken);
  return row ? fromRow(row) : null;
}

/** Reads the open account's profile from the server, and keeps the copy on this device up to date. */
export async function refreshProfile(): Promise<Profile | null> {
  const [row] = await accountRpc<Row[]>('profile_get');
  if (!row) return null;
  const profile = fromRow(row);
  await keepProfile(profile);
  return profile;
}

/** Saves the open account's profile on the server, then on this device. */
export async function saveProfile(profile: Profile): Promise<Profile> {
  const clean = cleanProfile(profile);
  await accountRpc('profile_put', {
    p_name: clean.name,
    p_called: clean.called,
    p_pen_name: clean.penName,
    p_bio: clean.bio,
    p_photo: clean.photo,
  });
  await keepProfile(clean);
  return clean;
}

/** The writer's text for a failed call of this module. */
export function profileErrorText(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  if (error instanceof ShareError && error.kind === 'offline')
    return 'Vlo could not reach the account server. Check the connection, then try again.';
  return 'The account server did not save your profile. Try again later.';
}
