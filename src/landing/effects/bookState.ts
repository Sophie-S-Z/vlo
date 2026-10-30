/** The pinned book story's progress, from 0 to 1, shared with the particle field (ADR 0012). */
let open = 0;

export function bookOpen(): number {
  return open;
}

export function setBookOpen(next: number): void {
  open = Math.min(1, Math.max(0, next));
}
