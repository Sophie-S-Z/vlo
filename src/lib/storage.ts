export type PersistenceAnswer = 'granted' | 'denied' | 'unsupported';

/** Asks the browser to keep Vlo's data when space runs low (VLO_SPEC section 9). */
export async function requestPersistence(): Promise<PersistenceAnswer> {
  // Older browsers and some private windows have no StorageManager, whatever the DOM types say.
  const storage = (navigator as { storage?: Partial<StorageManager> }).storage;
  if (typeof storage?.persist !== 'function') return 'unsupported';
  try {
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
