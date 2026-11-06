/*
 * The engine layer (spec section 10, F24, plan Task D3). Every engine, in the browser or at a provider,
 * has one call: `generate`, which streams the answer as pieces of text. Stop is the abort signal.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateRequest {
  system: string;
  messages: readonly ChatMessage[];
  maxTokens: number;
  signal?: AbortSignal;
}

export interface Engine {
  /** The preset id, or "webllm". */
  id: string;
  /** The engine's name for the writer, such as "Groq". */
  label: string;
  /** Where a request goes, for the "What will be sent" drawer: a host, or "this browser". */
  host: string;
  /** The model that answers, as the provider names it. */
  model: string;
  /** Streams the answer. A stop through `signal` ends the stream quietly with the words so far. */
  generate: (request: GenerateRequest) => AsyncIterable<string>;
}

/**
 * Why an engine could not answer, so the panel can say what to do:
 * - key: the provider refused the key.
 * - limit: the provider's limit (HTTP 429). Vlo does not retry.
 * - blocked: the browser could not reach the provider. It blocks browser requests (CORS), or the device is
 *   offline.
 * - offline: a server on this computer did not answer.
 * - refused: the model declined the request.
 * - no-gpu: this browser has no WebGPU for the in-browser engine.
 * - server: any other answer that is not a success.
 */
export type EngineErrorKind =
  'key' | 'limit' | 'blocked' | 'offline' | 'refused' | 'no-gpu' | 'server' | 'cancelled';

export class EngineError extends Error {
  readonly kind: EngineErrorKind;
  constructor(kind: EngineErrorKind, message: string) {
    super(message);
    this.name = 'EngineError';
    this.kind = kind;
  }
}

/** True for the error that a stop through an abort signal gives. */
export function isAbort(problem: unknown): boolean {
  return problem instanceof DOMException && problem.name === 'AbortError';
}

/** A rough count of tokens for the drawer: about 4 characters a token in English. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
