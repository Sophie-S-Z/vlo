import { hostedReady, RUNTIME_CACHE, type HostedModel } from './hosted';
import { MODEL_CACHE, SPEECH_ENGINE_CACHE, SPEECH_MODELS } from './model';
import { NATURAL_VOICES, VOICE_CACHE, VOICE_ENGINE_CACHE } from './natural';

/*
 * "Delete" in Settings frees the files of a model and the code that runs it. Both workers run the same ONNX
 * Runtime file, so it goes only when no other model needs it.
 */

async function drop(names: readonly string[], others: readonly HostedModel[]): Promise<void> {
  await Promise.all(names.map((name) => caches.delete(name)));
  for (const model of others) if (await hostedReady(model)) return;
  await caches.delete(RUNTIME_CACHE);
}

/** Removes both speech-to-text models from this device. */
export const deleteSpeechModels = () => drop([MODEL_CACHE, SPEECH_ENGINE_CACHE], [NATURAL_VOICES]);

/** Removes the natural voices from this device. */
export const deleteNaturalVoices = () =>
  drop([VOICE_CACHE, VOICE_ENGINE_CACHE], [SPEECH_MODELS.small, SPEECH_MODELS.base]);
