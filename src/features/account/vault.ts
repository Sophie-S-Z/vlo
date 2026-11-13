import { CryptoError, fromBase64, fromBase64Url, toBase64, toBase64Url } from '@/lib/crypto';

/*
 * The sealed sync key of an account (Phase 18, decision A1, ADR 0009). The account keeps the sync key
 * wrapped with AES-GCM under a key that PBKDF2-SHA256 makes from the writer's sync passphrase. The
 * passphrase never leaves the device, so the server cannot open the key, and so it cannot read a word.
 */

/** OWASP's 2023 count for PBKDF2-HMAC-SHA256. A phone takes about half a second. */
export const ROUNDS = 600_000;
export const MIN_PASSPHRASE = 8;
const AAD = new TextEncoder().encode('vlo:vault:v1');

export interface Wrapped {
  /** Base64 of the 32-byte key and its 16-byte tag: 64 characters. */
  wrapped: string;
  /** Base64 of the 12-byte IV. */
  iv: string;
  /** Base64 of the 16-byte salt. */
  salt: string;
  rounds: number;
}

async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, rounds: number) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Wraps the sync key (its base64url text) with the passphrase, with a new salt and IV. */
export async function wrapSyncKey(keyText: string, passphrase: string, rounds = ROUNDS): Promise<Wrapped> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passphraseKey(passphrase, salt, rounds);
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD },
    key,
    fromBase64Url(keyText),
  );
  return { wrapped: toBase64(new Uint8Array(sealed)), iv: toBase64(iv), salt: toBase64(salt), rounds };
}

/** The sync key's base64url text. A wrong passphrase throws CryptoError('bad-key'). */
export async function unwrapSyncKey(vault: Wrapped, passphrase: string): Promise<string> {
  const key = await passphraseKey(passphrase, fromBase64(vault.salt), vault.rounds);
  try {
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(vault.iv), additionalData: AAD },
      key,
      fromBase64(vault.wrapped),
    );
    return toBase64Url(new Uint8Array(raw));
  } catch {
    throw new CryptoError('bad-key');
  }
}

/** The writer's text for a passphrase that cannot be used, or '' for a good one. */
export function passphraseProblem(passphrase: string, again: string): string {
  if (passphrase.trim().length < MIN_PASSPHRASE)
    return `Use at least ${String(MIN_PASSPHRASE)} characters. A short sentence is easy to keep in mind.`;
  if (passphrase !== again) return 'The two passphrases are not the same.';
  return '';
}
