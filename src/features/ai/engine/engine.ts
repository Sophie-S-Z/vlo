import { anthropicEngine, anthropicModels } from './anthropic';
import { openaiEngine, openaiModels } from './openaiCompatible';
import { PRESETS, type PresetId } from './presets';
import type { Engine } from './types';

/*
 * The engine for the writer's choice of provider (plan Task D3). The in-browser engine loads through
 * `loadWebLlm`, since it needs a download first.
 */

export function providerEngine(presetId: PresetId, model: string, key?: string): Engine {
  const preset = PRESETS[presetId];
  if (!preset.local && !key) throw new RangeError(`${preset.label} needs a key.`);
  if (model.trim() === '') throw new RangeError(`Pick a model for ${preset.label}.`);
  return preset.api === 'anthropic' ? anthropicEngine(preset, model, key) : openaiEngine(preset, model, key);
}

/** The models that the provider offers to this key, for the model picker. */
export function providerModels(presetId: PresetId, key?: string, signal?: AbortSignal): Promise<string[]> {
  const preset = PRESETS[presetId];
  if (preset.api === 'anthropic') {
    if (!key) return Promise.resolve([]);
    return anthropicModels(preset, key, signal);
  }
  if (preset.listNeedsKey && !key) return Promise.resolve([]);
  return openaiModels(preset, key, signal);
}
