import { addNetLogEntry, type NetPurpose } from "./log";

export interface NetRequest {
  purpose: NetPurpose;
  url: string;
  init?: RequestInit;
}

function byteSize(body: BodyInit | null | undefined): number {
  if (body == null) return 0;
  if (typeof body === "string") return new TextEncoder().encode(body).length;
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  return 0;
}

/** The only way Vlo code may reach the network. Every call adds one entry to the network log. */
export async function netRequest({ purpose, url, init }: NetRequest): Promise<Response> {
  const entry = {
    time: Date.now(),
    host: new URL(url).host,
    purpose,
    bytesSent: byteSize(init?.body),
  };
  try {
    const response = await fetch(url, init);
    addNetLogEntry({ ...entry, status: response.status });
    return response;
  } catch (error) {
    // The body may have left the device before the failure, so keep its size in the log.
    addNetLogEntry({ ...entry, status: 0 });
    throw error;
  }
}
