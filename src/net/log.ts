// The visible network log (spec F25). Entries hold metadata only, never request content.

export type NetPurpose = "waitlist" | "waitlist-count";

export interface NetLogEntry {
  /** Epoch milliseconds when the request started. */
  time: number;
  host: string;
  purpose: NetPurpose;
  bytesSent: number;
  /** HTTP status, or 0 when the request failed before a response. */
  status: number;
}

let entries: readonly NetLogEntry[] = [];
const listeners = new Set<() => void>();

export function addNetLogEntry(entry: NetLogEntry): void {
  entries = [...entries, entry];
  for (const listener of listeners) listener();
}

export function getNetLog(): readonly NetLogEntry[] {
  return entries;
}

export function subscribeNetLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearNetLogForTests(): void {
  entries = [];
}
