/*
 * Keys the writer presses in the text, for listeners outside the editor such as typewriter key sounds
 * (E8). The editor calls `keyPressed` from its key handler; with no listener it does nothing.
 */

type KeyListener = (key: string) => void;

let listener: KeyListener | null = null;

/** Sets the one key listener, or removes it with null. */
export function onEditorKey(next: KeyListener | null): void {
  listener = next;
}

/** Keys that type or change text: characters, Enter, Backspace, Delete and Tab. */
export function keyPressed(event: KeyboardEvent): void {
  if (!listener || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  const { key } = event;
  if (key.length === 1 || key === 'Enter' || key === 'Backspace' || key === 'Delete' || key === 'Tab') {
    listener(key);
  }
}
