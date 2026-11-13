import { db } from '@/lib/db';

/*
 * This device's account session (Phase 18, decision A2). It stays on this device in `appMeta`, and no
 * backup or export holds it. The app shell reads it, so this module holds no network code.
 */

export const ACCOUNT_META = 'account';

export interface AccountSession {
  accessToken: string;
  refreshToken: string;
  /** This device's time, in ms, when the access token stops working. */
  expiresAt: number;
  userId: string;
  email: string;
  /** 'email' or 'google'. */
  provider: string;
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

export async function readSession(): Promise<AccountSession | null> {
  const value = (await db.appMeta.get(ACCOUNT_META))?.value;
  return isSession(value) ? value : null;
}

export async function saveSession(session: AccountSession): Promise<void> {
  await db.appMeta.put({ key: ACCOUNT_META, value: session });
}

export async function forgetSession(): Promise<void> {
  await db.appMeta.delete(ACCOUNT_META);
}
