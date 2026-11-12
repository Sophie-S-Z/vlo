/*
 * The crypto of share links and stored keys (spec sections 10 and 11, plan Task E2). Web Crypto only.
 * A share bundle is JSON, gzipped with the browser's CompressionStream, then sealed with AES-GCM 256 and
 * a new 12-byte IV. The key is 32 random bytes that stay on the writer's device and in the link fragment.
 * Any failure to open a sealed value is one error, `CryptoError('damaged')`, and never a partial text.
 * Each seal binds its purpose (a bundle, a comment or a sync blob) as AES-GCM additional data.
 */

export class CryptoError extends Error {
  constructor(readonly kind: 'damaged' | 'bad-key') {
    super(
      kind === 'bad-key'
        ? 'This link has a damaged key. Ask the writer for the whole link.'
        : 'This text is damaged, or it needs another key.',
    );
    this.name = 'CryptoError';
  }
}

export interface Sealed {
  /** Base64 of the cipher text with its GCM tag. */
  payload: string;
  /** Base64 of the 12-byte IV. */
  iv: string;
}

const KEY_BYTES = 32;
const IV_BYTES = 12;

export function toBase64(bytes: Uint8Array): string {
  let text = '';
  // Chunks keep the argument list of fromCharCode short for a large bundle.
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Throws a DOMException for text that is not base64. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const plain = text.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(plain + '='.repeat((4 - (plain.length % 4)) % 4));
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** A new share key, and its text for the link fragment. */
export async function newShareKey(): Promise<{ key: CryptoKey; text: string }> {
  const text = toBase64Url(randomBytes(KEY_BYTES));
  return { key: await importShareKey(text), text };
}

/** The 32 bytes of a key's text. Other text throws `CryptoError('bad-key')`. */
function keyBytes(text: string): Uint8Array<ArrayBuffer> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromBase64Url(text);
  } catch {
    throw new CryptoError('bad-key');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(text) || raw.length !== KEY_BYTES) throw new CryptoError('bad-key');
  return raw;
}

/** The key from the text of a link fragment. */
export async function importShareKey(text: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes(text), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** A new owner token: the writer's proof for revoke_share. The server keeps only its SHA-256. */
export function newOwnerToken(): string {
  return toBase64Url(randomBytes(KEY_BYTES));
}

/** What a sealed value is, bound into its seal, so a comment can never open as a bundle. */
export type SealPurpose = 'bundle' | 'comment' | 'sync' | 'image';

/** The most bytes that a sealed value may unpack to, so a crafted gzip bomb cannot crash the tab. */
export const MAX_OPEN_BYTES: Record<SealPurpose, number> = {
  bundle: 64 * 1024 * 1024,
  comment: 64 * 1024,
  sync: 64 * 1024 * 1024,
  // An image of a share link (Phase 16) is at most 1,600 pixels on its long side.
  image: 4 * 1024 * 1024,
};

/** The HMAC-SHA256 key that names sync blobs, from the text of the sync key (ADR 0008). */
export async function importNameKey(text: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes(text), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/** HMAC-SHA256 of `text` in base64url: 43 characters that only a holder of the key can make. */
export async function hmacName(key: CryptoKey, text: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))));
}

/** The additional data of a seal. A label, such as an image's number in a link, binds the seal to its place. */
const context = (purpose: SealPurpose, label = '') =>
  new TextEncoder().encode(label === '' ? `vlo:${purpose}:v1` : `vlo:${purpose}:v1:${label}`);

async function streamThrough(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
  limit = Infinity,
): Promise<Uint8Array<ArrayBuffer>> {
  const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = input.pipeThrough(stream).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new CryptoError('damaged');
    }
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** JSON, gzip, then AES-GCM with a new IV. The purpose goes in as additional data. */
export async function sealJson(value: unknown, key: CryptoKey, purpose: SealPurpose): Promise<Sealed> {
  const json = new TextEncoder().encode(JSON.stringify(value));
  const packed = await streamThrough(json, new CompressionStream('gzip'));
  const iv = randomBytes(IV_BYTES);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context(purpose) }, key, packed),
  );
  return { payload: toBase64(cipher), iv: toBase64(iv) };
}

/**
 * The value from `sealJson` with the same purpose. Any changed byte, wrong key, other purpose, damaged
 * text or text that unpacks past the limit throws `CryptoError('damaged')`.
 */
export async function openJson(sealed: Sealed, key: CryptoKey, purpose: SealPurpose): Promise<unknown> {
  try {
    const iv = fromBase64(sealed.iv);
    if (iv.length !== IV_BYTES) throw new CryptoError('damaged');
    const packed = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: context(purpose) },
        key,
        fromBase64(sealed.payload),
      ),
    );
    const json = await streamThrough(packed, new DecompressionStream('gzip'), MAX_OPEN_BYTES[purpose]);
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json)) as unknown;
  } catch {
    throw new CryptoError('damaged');
  }
}

/**
 * Bytes, such as an image, sealed with AES-GCM and a new IV, with no gzip, because an image is compressed
 * already. The purpose and the label go in as additional data, so a seal opens only in its own place.
 */
export async function sealBytes(
  bytes: Uint8Array,
  key: CryptoKey,
  purpose: SealPurpose,
  label = '',
): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES);
  const plain = new Uint8Array(bytes);
  const additionalData = context(purpose, label);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, plain),
  );
  return { payload: toBase64(cipher), iv: toBase64(iv) };
}

/** The bytes from `sealBytes` with the same purpose and label. Anything else throws `CryptoError('damaged')`. */
export async function openBytes(
  sealed: Sealed,
  key: CryptoKey,
  purpose: SealPurpose,
  label = '',
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const iv = fromBase64(sealed.iv);
    const cipher = fromBase64(sealed.payload);
    if (iv.length !== IV_BYTES || cipher.length > MAX_OPEN_BYTES[purpose] + 16)
      throw new CryptoError('damaged');
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: context(purpose, label) },
        key,
        cipher,
      ),
    );
  } catch {
    throw new CryptoError('damaged');
  }
}
