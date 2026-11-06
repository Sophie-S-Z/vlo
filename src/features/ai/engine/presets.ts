/*
 * The provider presets (spec section 10, "Your own key" and "Local server"). The hosts here are the ones in
 * the network module's list for AI requests and in the CSP `connect-src`. Vlo has no proxy server, so a
 * provider that blocks browser requests shows as unavailable with a plain message.
 */

export type PresetId = 'openrouter' | 'groq' | 'gemini' | 'anthropic' | 'ollama' | 'lmstudio';

export interface Preset {
  id: PresetId;
  label: string;
  /** The request shape: OpenAI-compatible chat completions, or the Anthropic Messages API. */
  api: 'openai' | 'anthropic';
  /** The base of each path, with no slash at the end. */
  base: string;
  /** A server on this computer, which needs no key. */
  local: boolean;
  /** The model to offer when the provider's list is not there yet. Empty means "pick from the list". */
  defaultModel: string;
  /** Where the writer gets a key. */
  keyPage?: string;
  /** A key is needed to read the model list. */
  listNeedsKey: boolean;
}

export const PRESETS: Readonly<Record<PresetId, Preset>> = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    api: 'openai',
    base: 'https://openrouter.ai/api/v1',
    local: false,
    defaultModel: 'openrouter/auto',
    keyPage: 'https://openrouter.ai/settings/keys',
    listNeedsKey: false,
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    api: 'openai',
    base: 'https://api.groq.com/openai/v1',
    local: false,
    defaultModel: 'llama-3.3-70b-versatile',
    keyPage: 'https://console.groq.com/keys',
    listNeedsKey: true,
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    api: 'openai',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    local: false,
    defaultModel: 'gemini-2.5-flash',
    keyPage: 'https://aistudio.google.com/apikey',
    listNeedsKey: true,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    api: 'anthropic',
    base: 'https://api.anthropic.com/v1',
    local: false,
    defaultModel: 'claude-opus-5-5',
    keyPage: 'https://platform.claude.com/settings/keys',
    listNeedsKey: true,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    api: 'openai',
    base: 'http://localhost:11434/v1',
    local: true,
    defaultModel: '',
    listNeedsKey: false,
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio',
    api: 'openai',
    base: 'http://localhost:1234/v1',
    local: true,
    defaultModel: '',
    listNeedsKey: false,
  },
};

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

/** Setup help for a server on this computer that did not answer. */
export function localHelp(preset: Preset, origin: string): string {
  if (preset.id === 'ollama')
    return `Start Ollama, and let it answer this page: set OLLAMA_ORIGINS to ${origin} and start Ollama again. Then pull a model, such as "ollama pull llama3.2".`;
  return 'Open LM Studio, load a model, and start its server on port 1234 with CORS on (Developer tab, Settings).';
}
