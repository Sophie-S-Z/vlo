import { db } from '@/lib/db';
import { PRESETS, type PresetId } from './engine/presets';
import { WEBLLM_MODELS } from './engine/webllm';

/*
 * The writer's engine choice and the drawer setting, for this device (spec section 10). The in-browser
 * engine is the default. Keys are never part of this record (see keys.ts).
 */

export type EngineChoice =
  { kind: 'webllm'; model: string } | { kind: 'provider'; preset: PresetId; model: string };

const ENGINE_KEY = 'ai-engine';
const DRAWER_KEY = 'ai-drawer-off';

export const DEFAULT_ENGINE: EngineChoice = { kind: 'webllm', model: WEBLLM_MODELS[0]?.id ?? '' };

function clean(value: unknown): EngineChoice {
  if (typeof value !== 'object' || value === null) return DEFAULT_ENGINE;
  const v = value as Record<string, unknown>;
  if (v.kind === 'webllm' && WEBLLM_MODELS.some((m) => m.id === v.model))
    return { kind: 'webllm', model: String(v.model) };
  if (v.kind === 'provider' && typeof v.preset === 'string' && Object.hasOwn(PRESETS, v.preset))
    return {
      kind: 'provider',
      preset: v.preset as PresetId,
      model: typeof v.model === 'string' ? v.model : '',
    };
  return DEFAULT_ENGINE;
}

export async function loadEngineChoice(): Promise<EngineChoice> {
  return clean((await db.appMeta.get(ENGINE_KEY))?.value);
}

export async function saveEngineChoice(choice: EngineChoice): Promise<void> {
  await db.appMeta.put({ key: ENGINE_KEY, value: choice });
}

/** True when the writer turned the "What will be sent" drawer off. */
export async function drawerOff(): Promise<boolean> {
  return (await db.appMeta.get(DRAWER_KEY))?.value === true;
}

export async function setDrawerOff(off: boolean): Promise<void> {
  await db.appMeta.put({ key: DRAWER_KEY, value: off });
}
