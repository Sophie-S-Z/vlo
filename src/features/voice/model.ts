import { downloadHosted, hostedReady, sizeOf, type HostedModel } from './hosted';

/*
 * The speech-to-text models (roadmap F57, plan Task K9, decision K4): Whisper, 8-bit, in many languages.
 * "Most accurate" is Whisper small and "Fast" is Whisper base. A model downloads only when the writer asks.
 */

export type SpeechModelId = 'small' | 'base';

export const MODEL_CACHE = 'vlo-speech-model';
/** The service worker's cache of the speech worker (vite.config.ts). */
export const SPEECH_ENGINE_CACHE = 'vlo-speech-engine';

/** The files that Transformers.js reads for an 8-bit Whisper model. */
function whisper(
  id: string,
  revision: string,
  sizes: readonly [
    config: number,
    generation: number,
    tokenizerConfig: number,
    encoder: number,
    decoder: number,
  ],
): HostedModel {
  const [config, generation, tokenizerConfig, encoder, decoder] = sizes;
  return {
    id,
    revision,
    cache: MODEL_CACHE,
    files: [
      ['config.json', config],
      ['generation_config.json', generation],
      ['preprocessor_config.json', 339],
      ['tokenizer_config.json', tokenizerConfig],
      ['tokenizer.json', 2_480_466],
      ['onnx/encoder_model_quantized.onnx', encoder],
      ['onnx/decoder_model_merged_quantized.onnx', decoder],
    ],
  };
}

export const SPEECH_MODELS: Readonly<Record<SpeechModelId, HostedModel & { name: string }>> = {
  small: {
    name: 'Whisper small',
    ...whisper(
      'onnx-community/whisper-small',
      '36050c46d777d46dc4b5f43f6d90574fc38f8732',
      [2227, 3893, 282_683, 92_326_160, 156_750_845],
    ),
  },
  base: {
    name: 'Whisper base',
    ...whisper(
      'onnx-community/whisper-base',
      '27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c',
      [2243, 3832, 282_682, 23_201_314, 53_693_315],
    ),
  },
};

export const modelSize = (id: SpeechModelId) => sizeOf(SPEECH_MODELS[id]);

const CHOICE_KEY = 'vlo:speechModel';

/** The writer's model on this device. With no choice, the most accurate one. */
export function getSpeechModel(): SpeechModelId {
  try {
    return localStorage.getItem(CHOICE_KEY) === 'base' ? 'base' : 'small';
  } catch {
    return 'small';
  }
}

export function setSpeechModel(id: SpeechModelId): void {
  try {
    localStorage.setItem(CHOICE_KEY, id);
  } catch {
    // A full or blocked storage keeps the choice for this visit only.
  }
}

/** True when every file of the model is on this device. */
export const modelReady = (id: SpeechModelId) => hostedReady(SPEECH_MODELS[id]);

/** Downloads the files of the model that are not on this device yet. */
export const downloadModel = (
  id: SpeechModelId,
  onProgress: (share: number) => void,
  signal?: AbortSignal,
): Promise<void> => downloadHosted(SPEECH_MODELS[id], onProgress, signal);
