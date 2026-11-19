import { clock } from './clock';
import { db } from './db';

export type PersistenceAnswer = 'granted' | 'denied' | 'unsupported';

/** The `appMeta` key of the browser's last answer. Settings shows it. */
export const PERSISTENCE_KEY = 'persistence';
/** The `appMeta` key of the time of the last request when Vlo started. */
const ASKED_AT_KEY = 'persistenceAskedAt';
/** The shortest time between two requests at start, so Firefox, which shows a prompt, asks once a week. */
export const ASK_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;

// Older browsers and some private windows have no StorageManager, whatever the DOM types say.
const storageManager = () => (navigator as { storage?: Partial<StorageManager> }).storage;

/** Asks the browser to keep Vlo's data when space runs low (VLO_SPEC section 9). */
async function requestPersistence(): Promise<PersistenceAnswer> {
  const storage = storageManager();
  if (typeof storage?.persist !== 'function') return 'unsupported';
  try {
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Asks for persistent storage and keeps the answer for Settings. It never throws. */
export async function recordPersistence(): Promise<void> {
  try {
    const answer = await requestPersistence();
    await db.appMeta.put({ key: PERSISTENCE_KEY, value: answer });
  } catch {
    // With no stored answer, Settings still shows what the browser reports now.
  }
}

/**
 * Asks again for persistent storage when Vlo starts, after the first project asked once. Chrome and Safari
 * answer with no prompt, from how much the writer uses Vlo and whether Vlo is installed, so a later request
 * can get "granted" after an early "denied". Protected data is safe from clean-up when space runs low, and
 * Firefox gives a protected site a much larger limit. Nothing happens when the data is already protected,
 * when the writer blocked the request, or within `ASK_AGAIN_MS` of the last request. It never throws.
 */
export async function renewPersistence(): Promise<void> {
  try {
    const storage = storageManager();
    if (typeof storage?.persisted !== 'function') return;
    const last = (await db.appMeta.get(PERSISTENCE_KEY))?.value;
    if (await storage.persisted()) {
      if (last !== 'granted') await db.appMeta.put({ key: PERSISTENCE_KEY, value: 'granted' });
      return;
    }
    if (last === undefined) return;
    if ((await permissionState()) === 'denied') return;
    const askedAt = (await db.appMeta.get(ASKED_AT_KEY))?.value;
    const now = clock.now();
    if (typeof askedAt === 'number' && now - askedAt < ASK_AGAIN_MS) return;
    await db.appMeta.put({ key: ASKED_AT_KEY, value: now });
    await recordPersistence();
  } catch {
    // The next start asks again.
  }
}

/** The browser's permission state for persistent storage, or null when it does not tell. */
async function permissionState(): Promise<PermissionState | null> {
  try {
    const status = await navigator.permissions.query({ name: 'persistent-storage' });
    return status.state;
  } catch {
    return null;
  }
}
