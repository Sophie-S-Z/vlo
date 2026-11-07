import { describe, expect, test } from 'vitest';
import {
  CryptoError,
  fromBase64,
  fromBase64Url,
  importShareKey,
  newOwnerToken,
  newShareKey,
  openJson,
  sealJson,
  toBase64,
  toBase64Url,
} from '@/lib/crypto';
import { MEMOIR_TEXT } from './export-fixtures';

/* Plan Task E2 (spec section 11, Gate 5): the share crypto, with round trips and tamper tests. */

const bundle = {
  v: 1,
  title: 'Kitchen',
  sections: [{ id: 'm1', title: 'Kitchen', text: MEMOIR_TEXT, quote: 'Aunt “Maria” — 1979 ✓' }],
};

/** Changes one bit of the byte at `at` in a base64 text. */
function flip(text: string, at: number): string {
  const bytes = fromBase64(text);
  bytes[at] = (bytes[at] ?? 0) ^ 1;
  return toBase64(bytes);
}

describe('base64 helpers', () => {
  test('round-trip every byte value, and base64url has no +, / or =', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect([...fromBase64(toBase64(all))]).toEqual([...all]);
    const url = toBase64Url(all);
    expect(url).not.toMatch(/[+/=]/);
    expect([...fromBase64Url(url)]).toEqual([...all]);
  });
});

describe('share keys and owner tokens', () => {
  test('a share key is 32 random bytes as 43 base64url characters', async () => {
    const one = await newShareKey();
    const two = await newShareKey();
    expect(one.text).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(one.text).not.toBe(two.text);
    expect(fromBase64Url(one.text)).toHaveLength(32);
  });

  test('an owner token is 43 base64url characters, and two differ', () => {
    const token = newOwnerToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newOwnerToken()).not.toBe(token);
  });

  test('a key text that is not 32 bytes is refused', async () => {
    await expect(importShareKey(toBase64Url(new Uint8Array(16)))).rejects.toThrow(CryptoError);
    await expect(importShareKey('not a key!')).rejects.toThrow(CryptoError);
  });
});

describe('sealJson and openJson', () => {
  test('a bundle comes back the same after a seal and an open with the imported key', async () => {
    const { key, text } = await newShareKey();
    const sealed = await sealJson(bundle, key);
    expect(sealed.payload).not.toContain('Kitchen');
    expect(await openJson(sealed, await importShareKey(text))).toEqual(bundle);
  });

  test('each seal uses a new 12-byte IV', async () => {
    const { key } = await newShareKey();
    const one = await sealJson(bundle, key);
    const two = await sealJson(bundle, key);
    expect(fromBase64(one.iv)).toHaveLength(12);
    expect(one.iv).not.toBe(two.iv);
    expect(one.payload).not.toBe(two.payload);
  });

  test('the bundle is gzipped before encryption, so a long text gets smaller', async () => {
    const { key } = await newShareKey();
    const long = { text: 'The tide came in over the stones. '.repeat(2000) };
    const sealed = await sealJson(long, key);
    expect(sealed.payload.length).toBeLessThan(JSON.stringify(long).length / 10);
  });

  test('a changed byte in the payload, the IV or the key fails, and gives no text', async () => {
    const { key, text } = await newShareKey();
    const sealed = await sealJson(bundle, key);
    const bytes = fromBase64(sealed.payload).length;
    for (const at of [0, Math.floor(bytes / 2), bytes - 1])
      await expect(openJson({ ...sealed, payload: flip(sealed.payload, at) }, key)).rejects.toThrow(
        new CryptoError('damaged'),
      );
    await expect(openJson({ ...sealed, iv: flip(sealed.iv, 0) }, key)).rejects.toThrow(CryptoError);
    const otherKey = fromBase64Url(text);
    otherKey[0] = (otherKey[0] ?? 0) ^ 1;
    await expect(openJson(sealed, await importShareKey(toBase64Url(otherKey)))).rejects.toThrow(CryptoError);
    await expect(openJson({ payload: 'not base64 ***', iv: sealed.iv }, key)).rejects.toThrow(CryptoError);
  });
});
