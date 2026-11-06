import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  forgetSessionKey,
  hasStoredKey,
  ITERATIONS,
  keepKeyForSession,
  LOCK_MS,
  rememberKey,
  removeStoredKey,
  secondsLocked,
  sessionKey,
  unlockKey,
} from '@/features/ai/keys';
import { acceptTerms, TERMS, termsAccepted } from '@/features/ai/terms';
import { db } from '@/lib/db';

/* Plan Task D4 (F24, US11, Review Focus 6): keys in memory, the passphrase store and free-tier terms. */

beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  forgetSessionKey('groq');
  forgetSessionKey('anthropic');
  await db.delete();
});

describe('keys', () => {
  it('keeps a key in memory only, by default', async () => {
    keepKeyForSession('groq', '  gsk_live_123  ');
    expect(sessionKey('groq')).toBe('gsk_live_123');
    expect(await hasStoredKey('groq')).toBe(false);
    expect(JSON.stringify(await db.appMeta.toArray())).not.toContain('gsk_live_123');
    forgetSessionKey('groq');
    expect(sessionKey('groq')).toBeUndefined();
    expect(() => {
      keepKeyForSession('groq', '   ');
    }).toThrow('Paste a key first.');
  });

  it('stores no plain key, and the right passphrase unlocks it', { timeout: 30_000 }, async () => {
    await rememberKey('anthropic', 'sk-ant-api03-secret', 'tide and stone');
    const stored = await db.appMeta.toArray();
    expect(JSON.stringify(stored)).not.toContain('sk-ant-api03-secret');
    expect(JSON.stringify(stored)).not.toContain('tide and stone');
    expect(stored[0]?.value).toMatchObject({ version: 1, iterations: ITERATIONS });
    expect(ITERATIONS).toBe(600_000);

    forgetSessionKey('anthropic');
    expect(sessionKey('anthropic')).toBeUndefined();
    expect(await unlockKey('anthropic', 'tide and stone')).toBe('sk-ant-api03-secret');
    expect(sessionKey('anthropic')).toBe('sk-ant-api03-secret');
  });

  it('never decrypts with a wrong passphrase, and waits 30 s after three', { timeout: 60_000 }, async () => {
    await rememberKey('groq', 'gsk_secret', 'correct horse');
    forgetSessionKey('groq');
    const now = 1_000_000;
    await expect(unlockKey('groq', 'wrong one', now)).rejects.toThrow('That passphrase is wrong.');
    await expect(unlockKey('groq', 'wrong two', now)).rejects.toThrow('That passphrase is wrong.');
    await expect(unlockKey('groq', 'wrong three', now)).rejects.toThrow('Wait 30 seconds');
    expect(sessionKey('groq')).toBeUndefined();
    expect(secondsLocked('groq', now)).toBe(30);
    // Even the right passphrase waits.
    await expect(unlockKey('groq', 'correct horse', now + 1000)).rejects.toThrow('Wait 29 seconds');
    expect(await unlockKey('groq', 'correct horse', now + LOCK_MS)).toBe('gsk_secret');
  });

  it('refuses a short passphrase, and removes a stored key', { timeout: 30_000 }, async () => {
    await expect(rememberKey('groq', 'gsk', 'short')).rejects.toThrow('at least 8 characters');
    await rememberKey('groq', 'gsk_secret', 'long enough');
    expect(await hasStoredKey('groq')).toBe(true);
    await removeStoredKey('groq');
    expect(await hasStoredKey('groq')).toBe(false);
    expect(sessionKey('groq')).toBeUndefined();
  });
});

describe('free-tier terms', () => {
  it('asks once for each provider with a free tier, and never for Anthropic or a local server', async () => {
    expect(TERMS.gemini?.points.join(' ')).toContain('Google can use what you send');
    expect(TERMS.gemini?.points.join(' ')).toContain('Human reviewers');
    expect(await termsAccepted('gemini')).toBe(false);
    await acceptTerms('gemini');
    expect(await termsAccepted('gemini')).toBe(true);
    expect(await termsAccepted('groq')).toBe(false);
    expect(await termsAccepted('anthropic')).toBe(true);
    expect(await termsAccepted('ollama')).toBe(true);
  });
});
