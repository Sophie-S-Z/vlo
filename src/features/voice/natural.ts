import { cleanLanguage, DEFAULT_LANGUAGE } from '@/lib/language';
import { downloadHosted, hostedReady, type HostedModel } from './hosted';

/*
 * The natural voices of Read aloud: Supertonic 2 by Supertone (OpenRAIL-M), in the ONNX form of
 * onnx-community. Five female and five male voices that sound the same on every device. The model reads the
 * letters of the text, so it needs no pronouncing dictionary, and it says numbers, dates and prices. It
 * runs on this device, so no text leaves it, and it downloads only when the writer asks.
 */

export const VOICE_CACHE = 'vlo-voice-model';
/** The service worker's cache of the voice worker (vite.config.ts). */
export const VOICE_ENGINE_CACHE = 'vlo-voice-engine';

export const VOICE_IDS = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'] as const;
export type NaturalVoiceId = (typeof VOICE_IDS)[number];

export const NATURAL_VOICES: HostedModel = {
  id: 'onnx-community/Supertonic-TTS-2-ONNX',
  revision: '68d4d9420d0e0e51d14656e1ec5c9b091490b49e',
  cache: VOICE_CACHE,
  files: [
    ['config.json', 247],
    ['tokenizer.json', 5658],
    ['tokenizer_config.json', 119],
    ['onnx/text_encoder.onnx', 433_173],
    ['onnx/text_encoder.onnx_data', 28_530_432],
    ['onnx/latent_denoiser.onnx', 397_050],
    ['onnx/latent_denoiser.onnx_data', 132_098_880],
    ['onnx/voice_decoder.onnx', 59_730],
    ['onnx/voice_decoder.onnx_data', 101_353_472],
    ...VOICE_IDS.map((id) => [`voices/${id}.bin`, 51_712] as const),
  ],
};

/** The languages that the natural voices speak, as the model's tags. */
const SPOKEN = ['en', 'es', 'fr', 'pt', 'ko'];

/** The model's tag for the project's language, or null when the natural voices cannot speak it. */
export function naturalLanguage(language: string | undefined): string | null {
  const base = (cleanLanguage(language) ?? DEFAULT_LANGUAGE).split('-')[0] ?? DEFAULT_LANGUAGE;
  return SPOKEN.includes(base) ? base : null;
}

/* A natural voice has a URI of its own next to the device voices, so a table read can mix the two. */

const PREFIX = 'vlo-natural:';
export const NATURAL_DEFAULT = `${PREFIX}F1`;

export const naturalUri = (id: NaturalVoiceId) => `${PREFIX}${id}`;

/** The voice of a natural URI, or null for a device voice. */
export function naturalVoiceOf(uri: string | null | undefined): NaturalVoiceId | null {
  if (!uri?.startsWith(PREFIX)) return null;
  const id = uri.slice(PREFIX.length);
  return (VOICE_IDS as readonly string[]).includes(id) ? (id as NaturalVoiceId) : null;
}

/** The name in the voice list, such as "Female voice 1". */
export const voiceName = (id: NaturalVoiceId) =>
  `${id.startsWith('F') ? 'Female' : 'Male'} voice ${id.slice(1)}`;

/** The slowest and fastest speed that the natural voices say clearly. */
export const NATURAL_MIN_RATE = 0.7;
export const NATURAL_MAX_RATE = 1.4;

/** The model reads a long text badly, so a long sentence goes in parts at a comma, else at a space. */
export function speechParts(text: string, max = 300): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const head = rest.slice(0, max);
    let cut = Math.max(...[', ', '; ', ': ', ' - '].map((mark) => head.lastIndexOf(mark)));
    if (cut < max / 3) cut = head.lastIndexOf(' ');
    cut = cut <= 0 ? max : cut + 1;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest !== '') parts.push(rest);
  return parts;
}

export const voicesReady = () => hostedReady(NATURAL_VOICES);

export const downloadVoices = (onProgress: (share: number) => void, signal?: AbortSignal) =>
  downloadHosted(NATURAL_VOICES, onProgress, signal);
