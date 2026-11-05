/*
 * The data of the aiOrigin mark (spec section 5, F26), with no editor code, so the export worker can read
 * it too. Co-writer text that the writer inserts carries the provider, the model and the time.
 */

export const AI_ORIGIN = 'aiOrigin';

export interface AiOrigin {
  provider: string;
  model: string;
  /** Milliseconds since 1970. */
  createdAt: number;
}

/** The origin in a mark's attributes, or null when the attributes are damaged. */
export function aiOriginOf(attrs: Record<string, unknown>): AiOrigin | null {
  const { provider, model, createdAt } = attrs;
  if (typeof provider !== 'string' || typeof model !== 'string' || typeof createdAt !== 'number') return null;
  if (provider.trim() === '' || !Number.isFinite(createdAt)) return null;
  return { provider, model, createdAt };
}

/**
 * The provider and the model of a mark, such as "Groq, llama-3.3-70b-versatile". A mark with damaged
 * attributes still names AI text, as "Unknown AI".
 */
export function aiLabelOf(attrs: Record<string, unknown>): string {
  const origin = aiOriginOf(attrs);
  if (origin === null) return 'Unknown AI';
  return origin.model.trim() === '' ? origin.provider : `${origin.provider}, ${origin.model}`;
}
