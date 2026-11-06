import { db } from '@/lib/db';
import type { PresetId } from './engine/presets';

/*
 * Provider keys (spec section 10, plan decision P6). A key stays in memory for this tab by default, and it
 * goes away when the tab closes. "Remember on this device" stores it encrypted with a passphrase: PBKDF2
 * with SHA-256 and 600,000 iterations makes an AES-GCM 256 key, and the stored record holds only the salt,
 * the IV and the cipher text. Three wrong passphrases in a row make the next try wait 30 seconds.
 */

export const ITERATIONS = 600_000;
export const LOCK_AFTER = 3;
export const LOCK_MS = 30_000;
export const MIN_PASSPHRASE = 8;

interface StoredKey {
  version: 1;
  iterations: number;
  salt: string;
  iv: string;
  cipher: string;
}

const memory = new Map<PresetId, string>();
const failures = new Map<PresetId, { count: number; until: number }>();

const metaKey = (preset: PresetId) => `ai-key:${preset}`;

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function derive(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function isStored(value: unknown): value is StoredKey {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.iterations === 'number' &&
    typeof v.salt === 'string' &&
    typeof v.iv === 'string' &&
    typeof v.cipher === 'string'
  );
}

/** The key for this tab, if the writer gave or unlocked one. */
export function sessionKey(preset: PresetId): string | undefined {
  return memory.get(preset);
}

/** Keeps a key for this tab only. */
export function keepKeyForSession(preset: PresetId, key: string): void {
  const clean = key.trim();
  if (clean === '') throw new RangeError('Paste a key first.');
  memory.set(preset, clean);
}

/** Forgets the key in this tab. A stored copy stays until the writer removes it. */
export function forgetSessionKey(preset: PresetId): void {
  memory.delete(preset);
}

/** Stores the key encrypted with the passphrase, and keeps it for this tab too. */
export async function rememberKey(preset: PresetId, key: string, passphrase: string): Promise<void> {
  const clean = key.trim();
  if (clean === '') throw new RangeError('Paste a key first.');
  if (passphrase.length < MIN_PASSPHRASE)
    throw new RangeError(`Use a passphrase of at least ${String(MIN_PASSPHRASE)} characters.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await derive(passphrase, salt, ITERATIONS);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(clean)),
  );
  const record: StoredKey = {
    version: 1,
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    cipher: toBase64(cipher),
  };
  await db.appMeta.put({ key: metaKey(preset), value: record });
  memory.set(preset, clean);
  failures.delete(preset);
}

/** True when this device has a stored key for the provider. */
export async function hasStoredKey(preset: PresetId): Promise<boolean> {
  return isStored((await db.appMeta.get(metaKey(preset)))?.value);
}

/** The seconds left before another try, or 0. */
export function secondsLocked(preset: PresetId, now = Date.now()): number {
  const state = failures.get(preset);
  if (!state || state.until <= now) return 0;
  return Math.ceil((state.until - now) / 1000);
}

/**
 * Decrypts the stored key with the passphrase and keeps it for this tab. A wrong passphrase is a RangeError
 * that says so, and the third in a row starts a 30-second wait.
 */
export async function unlockKey(preset: PresetId, passphrase: string, now = Date.now()): Promise<string> {
  const wait = secondsLocked(preset, now);
  if (wait > 0) throw new RangeError(`Wait ${String(wait)} seconds, then try again.`);
  const record = (await db.appMeta.get(metaKey(preset)))?.value;
  if (!isStored(record)) throw new Error('This device has no stored key for this provider.');
  try {
    const aes = await derive(passphrase, fromBase64(record.salt), record.iterations);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(record.iv) },
      aes,
      fromBase64(record.cipher),
    );
    const key = new TextDecoder().decode(plain);
    memory.set(preset, key);
    failures.delete(preset);
    return key;
  } catch {
    const count = (failures.get(preset)?.count ?? 0) + 1;
    const locked = count >= LOCK_AFTER;
    failures.set(preset, { count: locked ? 0 : count, until: locked ? now + LOCK_MS : 0 });
    throw new RangeError(
      locked ? 'That passphrase is wrong. Wait 30 seconds, then try again.' : 'That passphrase is wrong.',
    );
  }
}

/** Removes the stored key from this device and from this tab. */
export async function removeStoredKey(preset: PresetId): Promise<void> {
  await db.appMeta.delete(metaKey(preset));
  memory.delete(preset);
  failures.delete(preset);
}
