import { db, type DeviceKey } from '@/lib/db';
import { keyText, sha256Hex } from './verify';

/*
 * The signing key of this device (plan decision K1): ECDSA P-256, made here. The browser stores the
 * private key so that no script can read its bytes, and it never leaves this device: no backup, sync or
 * export holds it. Each device has its own key, so each device has its own chain.
 */

const KEY = 'authorshipKey';

export interface SigningKey {
  privateKey: CryptoKey;
  publicKey: DeviceKey;
  /** The SHA-256 of the public key's text, in hex. */
  device: string;
}

interface Stored {
  privateKey: CryptoKey;
  publicKey: DeviceKey;
}

let loading: Promise<SigningKey> | null = null;

async function loadOrMake(): Promise<SigningKey> {
  let stored = (await db.appMeta.get(KEY))?.value as Stored | undefined;
  if (!stored) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ]);
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const publicKey: DeviceKey = { crv: 'P-256', kty: 'EC', x: jwk.x ?? '', y: jwk.y ?? '' };
    // Two tabs can make a key at once. The first one stored wins, and the other tab uses it.
    stored = await db.transaction('rw', db.appMeta, async () => {
      const first = (await db.appMeta.get(KEY))?.value as Stored | undefined;
      if (first) return first;
      const mine: Stored = { privateKey: pair.privateKey, publicKey };
      await db.appMeta.put({ key: KEY, value: mine });
      return mine;
    });
  }
  return { ...stored, device: await sha256Hex(keyText(stored.publicKey)) };
}

/** This device's signing key, made on first use. */
export function signingKey(): Promise<SigningKey> {
  loading ??= loadOrMake().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** Forgets the loaded key, for tests that clear the database. */
export function resetSigningKey(): void {
  loading = null;
}
