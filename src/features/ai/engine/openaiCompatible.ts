import { send } from './http';
import type { Preset } from './presets';
import { sseEvents } from './sse';
import { EngineError, isAbort, type Engine, type GenerateRequest } from './types';

/*
 * OpenAI-compatible chat completions: OpenRouter, Groq, Gemini, Ollama and LM Studio (plan Task D3). One
 * streaming request. Each "data:" line holds a piece of the answer, and "[DONE]" ends it.
 */

function headers(key: string | undefined): Record<string, string> {
  return { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) };
}

export function openaiEngine(preset: Preset, model: string, key?: string): Engine {
  return {
    id: preset.id,
    label: preset.label,
    host: new URL(preset.base).host,
    model,
    async *generate(request: GenerateRequest) {
      const body = JSON.stringify({
        model,
        stream: true,
        max_tokens: request.maxTokens,
        messages: [{ role: 'system', content: request.system }, ...request.messages],
      });
      try {
        const response = await send(preset, '/chat/completions', {
          headers: headers(key),
          body,
          ...(request.signal ? { signal: request.signal } : {}),
        });
        if (!response.body) return;
        for await (const { data } of sseEvents(response.body)) {
          if (request.signal?.aborted) return;
          if (data === '[DONE]') return;
          let chunk: unknown;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }
          const parsed = chunk as {
            error?: { message?: string };
            choices?: { delta?: { content?: string | null } }[];
          };
          if (parsed.error)
            throw new EngineError(
              'server',
              `${preset.label} stopped: ${parsed.error.message ?? 'no reason given'}.`,
            );
          const piece = parsed.choices?.[0]?.delta?.content;
          if (piece) yield piece;
        }
      } catch (problem) {
        if (isAbort(problem)) return;
        throw problem;
      }
    },
  };
}

/** The provider's model ids, for the model picker. */
export async function openaiModels(preset: Preset, key?: string, signal?: AbortSignal): Promise<string[]> {
  const response = await send(preset, '/models', {
    method: 'GET',
    headers: headers(key),
    ...(signal ? { signal } : {}),
  });
  const list = (await response.json()) as { data?: { id?: unknown }[] };
  return (list.data ?? [])
    .map((m) => (typeof m.id === 'string' ? m.id.replace(/^models\//, '') : ''))
    .filter((id) => id !== '')
    .sort((a, b) => a.localeCompare(b));
}
