import { db } from '@/lib/db';
import type { PresetId } from './engine/presets';

/*
 * The data terms of each provider with a free tier (spec section 10, US11). Before a key for one of them
 * works, the writer reads the terms in plain words and ticks a box. A new version of the words asks again.
 */

export interface Terms {
  version: number;
  /** Plain words, one point a line. */
  points: readonly string[];
  /** The provider's own terms. */
  link: string;
}

export const TERMS: Partial<Record<PresetId, Terms>> = {
  gemini: {
    version: 1,
    points: [
      'On the free tier, Google can use what you send, and its answers, to improve its products.',
      'Human reviewers at Google can read what you send.',
      'Do not send text that you want to keep private. A paid key has other terms.',
    ],
    link: 'https://ai.google.dev/gemini-api/terms',
  },
  openrouter: {
    version: 1,
    points: [
      'OpenRouter sends your text on to the company that runs the model you pick.',
      'Free models come from companies that can keep what you send and use it to train their models.',
      'Each company has its own terms. OpenRouter lists them, and its privacy settings can block the ones that train.',
    ],
    link: 'https://openrouter.ai/terms',
  },
  groq: {
    version: 1,
    points: [
      'The free tier has limits on requests and tokens for each minute and each day.',
      "Groq's terms decide how long Groq keeps what you send and who can read it.",
      'Read them before you send text that you want to keep private.',
    ],
    link: 'https://groq.com/terms-of-use',
  },
};

const metaKey = (preset: PresetId) => `ai-terms:${preset}`;

/** True when the provider has no free-tier terms, or the writer accepted the current ones. */
export async function termsAccepted(preset: PresetId): Promise<boolean> {
  const terms = TERMS[preset];
  if (!terms) return true;
  return (await db.appMeta.get(metaKey(preset)))?.value === terms.version;
}

export async function acceptTerms(preset: PresetId): Promise<void> {
  const terms = TERMS[preset];
  if (!terms) return;
  await db.appMeta.put({ key: metaKey(preset), value: terms.version });
}
