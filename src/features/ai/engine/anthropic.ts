import { send } from './http';
import type { Preset } from './presets';
import { sseEvents } from './sse';
import { EngineError, isAbort, type Engine, type GenerateRequest } from './types';

/*
 * The Anthropic Messages API from the browser (plan Task D3). Raw HTTP through the network module, since
 * every request that leaves Vlo must go through it. The direct browser access header lets the browser call
 * the API with the writer's own key. The stream sends the text in content_block_delta events. A thinking
 * block can stream before the text; its deltas carry no text for the writer, so the adapter skips them.
 */

const VERSION = '2026-10-21';

function headers(key: string | undefined): Record<string, string> {
  return {
    'content-type': 'application/json',
    'anthropic-version': VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(key ? { 'x-api-key': key } : {}),
  };
}

interface StreamEvent {
  type?: string;
  delta?: { type?: string; text?: string; stop_reason?: string | null };
  error?: { type?: string; message?: string };
}

export function anthropicEngine(preset: Preset, model: string, key?: string): Engine {
  return {
    id: preset.id,
    label: preset.label,
    host: new URL(preset.base).host,
    model,
    async *generate(request: GenerateRequest) {
      const body = JSON.stringify({
        model,
        max_tokens: request.maxTokens,
        stream: true,
        system: request.system,
        messages: request.messages,
      });
      try {
        const response = await send(preset, '/messages', {
          headers: headers(key),
          body,
          ...(request.signal ? { signal: request.signal } : {}),
        });
        if (!response.body) return;
        for await (const { data } of sseEvents(response.body)) {
          if (request.signal?.aborted) return;
          let event: StreamEvent;
          try {
            event = JSON.parse(data) as StreamEvent;
          } catch {
            continue;
          }
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text)
            yield event.delta.text;
          else if (event.type === 'message_delta' && event.delta?.stop_reason === 'refusal')
            throw new EngineError('refused', `${model} declined this request.`);
          else if (event.type === 'error') {
            const busy = event.error?.type === 'overloaded_error';
            throw new EngineError(
              busy ? 'limit' : 'server',
              busy
                ? 'Anthropic is busy. Wait, then ask again.'
                : `Anthropic stopped: ${event.error?.message ?? 'no reason given'}.`,
            );
          } else if (event.type === 'message_stop') return;
        }
      } catch (problem) {
        if (isAbort(problem)) return;
        throw problem;
      }
    },
  };
}

/** The model ids that this key can use, newest first as the API lists them. */
export async function anthropicModels(preset: Preset, key: string, signal?: AbortSignal): Promise<string[]> {
  const response = await send(preset, '/models?limit=100', {
    method: 'GET',
    headers: headers(key),
    ...(signal ? { signal } : {}),
  });
  const list = (await response.json()) as { data?: { id?: unknown }[] };
  return (list.data ?? []).map((m) => (typeof m.id === 'string' ? m.id : '')).filter((id) => id !== '');
}
