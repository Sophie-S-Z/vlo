import { db, VloDb } from '@/lib/db';
import { ACTIVE_ACCOUNT, claimLegacy, libraryName } from '@/lib/library';

/*
 * This device's account session (Phase 18, decision A2). It stays in `appMeta` of the account's own
 * library, and no backup or export holds it. The app shell reads it, so this module holds no network code.
 */

const ACCOUNT_META = 'account';

export interface AccountSession {
  accessToken: string;
  refreshToken: string;
  /** This device's time, in ms, when the access token stops working. */
  expiresAt: number;
  userId: string;
  email: string;
  /** 'email' or 'google'. */
  provider: string;
  /** The name that the sign-in gave, such as Google's. The profile step starts with it. */
  name?: string;
}

function isSession(value: unknown): value is AccountSession {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<AccountSession>;
  return (
    typeof s.accessToken === 'string' &&
    typeof s.refreshToken === 'string' &&
    typeof s.expiresAt === 'number' &&
    typeof s.userId === 'string' &&
    typeof s.email === 'string'
  );
}

/** The session of the open library. A session from before Vlo kept a library for each account claims it. */
export async function readSession(database: VloDb = db): Promise<AccountSession | null> {
  const value = (await database.appMeta.get(ACCOUNT_META))?.value;
  if (!isSession(value)) return null;
  if (database !== db) return value;
  return value.userId === ACTIVE_ACCOUNT || claimLegacy(value.userId, value.email) ? value : null;
}

/** Keeps the session in its account's library, which may be another library than the open one. */
export async function saveSession(session: AccountSession): Promise<void> {
  const name = libraryName(session.userId);
  if (name === db.name) {
    await db.appMeta.put({ key: ACCOUNT_META, value: session });
    return;
  }
  const library = new VloDb(name);
  try {
    await library.appMeta.put({ key: ACCOUNT_META, value: session });
  } finally {
    library.close();
  }
}

export async function forgetSession(): Promise<void> {
  await db.appMeta.delete(ACCOUNT_META);
}
