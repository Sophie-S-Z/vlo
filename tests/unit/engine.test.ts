import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerEngine, providerModels } from '@/features/ai/engine/engine';
import { sseEvents } from '@/features/ai/engine/sse';
import { EngineError, estimateTokens, type GenerateRequest } from '@/features/ai/engine/types';
import { db } from '@/lib/db';

/* Plan Task D3 (F24): the engine layer and its adapters against a fake provider. */

beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await db.delete();
});

const encoder = new TextEncoder();

/** A streaming body that sends each piece as its own chunk, and can wait before the rest. */
function stream(pieces: readonly string[], hold?: Promise<void>): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i === 2 && hold) await hold;
      const piece = pieces[i];
      i += 1;
      if (piece === undefined) controller.close();
      else controller.enqueue(encoder.encode(piece));
    },
  });
}

const sse = (pieces: readonly string[], hold?: Promise<void>) =>
  new Response(stream(pieces, hold), { status: 200, headers: { 'content-type': 'text/event-stream' } });

const openaiChunk = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

type FetchFn = (input: URL | string, init?: RequestInit) => Promise<Response>;

function fakeFetch(answer: Response | (() => Response) | Error) {
  const fetch = vi.fn<FetchFn>(() => {
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve(typeof answer === 'function' ? answer() : answer);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const ask: GenerateRequest = {
  system: 'You are a careful reader.',
  messages: [{ role: 'user', content: 'What does Mira want?' }],
  maxTokens: 400,
};

async function collect(iterable: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const piece of iterable) text += piece;
  return text;
}

async function failure(work: Promise<unknown>): Promise<EngineError> {
  try {
    await work;
  } catch (problem) {
    if (problem instanceof EngineError) return problem;
    throw problem;
  }
  throw new Error('No error.');
}

describe('sseEvents', () => {
  it('reads events split across chunks, with CRLF lines, comments and named events', async () => {
    const body = stream([
      ': ping\n\nevent: delta\ndata: {"a":',
      '1}\r\n\r\ndata: one\ndata: two\n\n',
      'data: last',
    ]);
    const events = [];
    for await (const event of sseEvents(body)) events.push(event);
    expect(events).toEqual([
      { event: 'delta', data: '{"a":1}' },
      { event: '', data: 'one\ntwo' },
      { event: '', data: 'last' },
    ]);
  });
});

describe('OpenAI-compatible adapter', () => {
  it('streams the answer from a request with the system prompt first, and logs it with no key', async () => {
    const fetch = fakeFetch(
      sse([openaiChunk('Mira wants '), openaiChunk('the ledger.'), 'data: [DONE]\n\n']),
    );
    const engine = providerEngine('groq', 'llama-3.3-70b-versatile', 'gsk_secret');
    expect(engine.host).toBe('api.groq.com');
    expect(await collect(engine.generate(ask))).toBe('Mira wants the ledger.');

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init?.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer gsk_secret' });
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'llama-3.3-70b-versatile',
      stream: true,
      max_tokens: 400,
      messages: [
        { role: 'system', content: 'You are a careful reader.' },
        { role: 'user', content: 'What does Mira want?' },
      ],
    });
    const log = await db.networkLog.toArray();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      host: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      purpose: 'ai',
    });
    expect(JSON.stringify(log)).not.toContain('gsk_secret');
    expect(JSON.stringify(log)).not.toContain('Mira');
  });

  it('sends no key to a server on this computer', async () => {
    const fetch = fakeFetch(sse([openaiChunk('Yes.'), 'data: [DONE]\n\n']));
    expect(await collect(providerEngine('ollama', 'llama3.2').generate(ask))).toBe('Yes.');
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://localhost:11434/v1/chat/completions');
    expect(init?.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('says that the key is wrong on HTTP 401, with the provider words', async () => {
    fakeFetch(new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 }));
    const problem = await failure(collect(providerEngine('groq', 'm', 'bad').generate(ask)));
    expect(problem.kind).toBe('key');
    expect(problem.message).toBe('Groq did not accept the key. Groq says: "Invalid API Key"');
  });

  it('shows the limit message once on HTTP 429 and sends no second request', async () => {
    const fetch = fakeFetch(
      new Response(JSON.stringify({ error: { message: 'Rate limit reached for requests per day' } }), {
        status: 429,
      }),
    );
    const problem = await failure(
      collect(providerEngine('openrouter', 'openrouter/auto', 'k').generate(ask)),
    );
    expect(problem.kind).toBe('limit');
    expect(problem.message).toContain('OpenRouter says you reached its limit.');
    expect(problem.message).toContain('Rate limit reached for requests per day');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await db.networkLog.toArray()).toMatchObject([{ status: 429 }]);
  });

  it('marks a provider that the browser cannot reach as blocked, and a local server as off with help', async () => {
    fakeFetch(new TypeError('Failed to fetch'));
    const blocked = await failure(collect(providerEngine('gemini', 'gemini-2.5-flash', 'k').generate(ask)));
    expect(blocked.kind).toBe('blocked');
    expect(blocked.message).toContain('may block requests from a browser');
    const off = await failure(collect(providerEngine('ollama', 'llama3.2').generate(ask)));
    expect(off.kind).toBe('offline');
    expect(off.message).toContain('OLLAMA_ORIGINS');
    expect(await db.networkLog.toArray()).toMatchObject([{ status: 'error' }, { status: 'error' }]);
  });

  it('ends at once on Stop and keeps the words so far, with one log entry', async () => {
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stop = new AbortController();
    fakeFetch(() => {
      const body = stream([openaiChunk('First '), openaiChunk('words '), openaiChunk('never.')], hold);
      stop.signal.addEventListener('abort', () => {
        release();
      });
      return new Response(body, { status: 200 });
    });
    let text = '';
    for await (const piece of providerEngine('groq', 'm', 'k').generate({ ...ask, signal: stop.signal })) {
      text += piece;
      if (text === 'First words ') stop.abort();
    }
    expect(text).toBe('First words ');
    expect(await db.networkLog.count()).toBe(1);
  });

  it('lists the models, without the "models/" part that Gemini adds', async () => {
    fakeFetch(
      new Response(
        JSON.stringify({ data: [{ id: 'models/gemini-2.5-pro' }, { id: 'models/gemini-2.5-flash' }] }),
      ),
    );
    expect(await providerModels('gemini', 'k')).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
    expect(await providerModels('groq')).toEqual([]);
  });
});

describe('Anthropic adapter', () => {
  const event = (type: string, body: object) =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...body })}\n\n`;

  it('sends the browser header and the key, and streams only the text', async () => {
    const fetch = fakeFetch(
      sse([
        event('message_start', { message: {} }),
        event('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: '' } }),
        event('content_block_delta', { index: 1, delta: { type: 'text_delta', text: 'The ledger ' } }),
        event('content_block_delta', { index: 1, delta: { type: 'text_delta', text: 'matters.' } }),
        event('message_delta', { delta: { stop_reason: 'end_turn' } }),
        event('message_stop', {}),
      ]),
    );
    const engine = providerEngine('anthropic', 'claude-opus-5-5', 'sk-ant-secret');
    expect(await collect(engine.generate(ask))).toBe('The ledger matters.');
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    expect(init?.headers).toEqual({
      'content-type': 'application/json',
      'anthropic-version': '2026-10-21',
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-api-key': 'sk-ant-secret',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 400,
      stream: true,
      system: 'You are a careful reader.',
      messages: [{ role: 'user', content: 'What does Mira want?' }],
    });
    expect(JSON.stringify(await db.networkLog.toArray())).not.toContain('sk-ant-secret');
  });

  it('says when the model declined, and when Anthropic is busy', async () => {
    fakeFetch(sse([event('message_delta', { delta: { stop_reason: 'refusal' } })]));
    const refused = await failure(collect(providerEngine('anthropic', 'claude-opus-5-5', 'k').generate(ask)));
    expect(refused.kind).toBe('refused');
    fakeFetch(sse([event('error', { error: { type: 'overloaded_error', message: 'Overloaded' } })]));
    const busy = await failure(collect(providerEngine('anthropic', 'claude-opus-5-5', 'k').generate(ask)));
    expect(busy.kind).toBe('limit');
    fakeFetch(
      new Response('{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', {
        status: 529,
      }),
    );
    const http = await failure(collect(providerEngine('anthropic', 'claude-opus-5-5', 'k').generate(ask)));
    expect(http.kind).toBe('limit');
    expect(http.message).toBe('Anthropic is busy. Wait, then ask again. Anthropic says: "Overloaded"');
  });

  it('lists the models for the key', async () => {
    const fetch = fakeFetch(
      new Response(JSON.stringify({ data: [{ id: 'claude-opus-5-5' }, { id: 'claude-haiku-5-5' }] })),
    );
    expect(await providerModels('anthropic', 'k')).toEqual(['claude-opus-5-5', 'claude-haiku-5-5']);
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://api.anthropic.com/v1/models?limit=100');
    expect(await db.networkLog.toArray()).toMatchObject([{ path: '/v1/models' }]);
  });
});

describe('providerEngine', () => {
  it('needs a key for a provider on the internet, and a model for each', () => {
    expect(() => providerEngine('groq', 'm')).toThrow('Groq needs a key.');
    expect(() => providerEngine('ollama', '')).toThrow('Pick a model for Ollama.');
  });

  it('estimates about 4 characters a token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcdefghi')).toBe(3);
  });
});
