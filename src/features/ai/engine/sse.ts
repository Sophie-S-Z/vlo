/*
 * Server-sent events from a streaming answer (OpenAI-compatible chat and the Anthropic Messages API).
 * Each event is its name, if any, and its data lines joined with a line break.
 */

export interface SseEvent {
  event: string;
  data: string;
}

function parse(block: string): SseEvent | null {
  let event = '';
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return data.length === 0 && event === '' ? null : { event, data: data.join('\n') };
}

/** Reads the events of a response body until the stream ends. */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let end = buffer.search(/\r?\n\r?\n/);
      while (end !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '');
        const parsed = parse(block);
        if (parsed) yield parsed;
        end = buffer.search(/\r?\n\r?\n/);
      }
    }
    buffer += decoder.decode();
    const last = parse(buffer);
    if (last) yield last;
  } finally {
    // A reader that stops early, as on Stop, cancels the rest of the answer.
    if (finished) reader.releaseLock();
    else void reader.cancel().catch(() => undefined);
  }
}
