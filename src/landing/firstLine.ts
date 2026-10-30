/**
 * The visitor's first line (ADR 0012). It lives in this page's memory only: it never goes to
 * storage or the network. The hero field writes it; the particle field and the still art read it.
 */
export const FIRST_LINE_MAX = 60;

let line = "";
const listeners = new Set<() => void>();

export function firstLine(): string {
  return line;
}

export function setFirstLine(next: string): void {
  const trimmed = next.slice(0, FIRST_LINE_MAX);
  if (trimmed === line) return;
  line = trimmed;
  for (const listener of listeners) listener();
}

export function subscribeFirstLine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
