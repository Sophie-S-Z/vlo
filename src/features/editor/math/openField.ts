/*
 * MathLive sends its input event a moment after each key. A panel that closes at once (Escape, a click
 * outside) first asks the open field to save what it holds, so the last key is never lost.
 */

let save: (() => void) | null = null;

/** The equation panel registers its field here while it is open. */
export function setOpenField(next: (() => void) | null): void {
  save = next;
}

/** Saves the open field's equation into the document now. */
export function saveOpenField(): void {
  save?.();
}
