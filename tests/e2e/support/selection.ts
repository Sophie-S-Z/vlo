import type { Locator } from '@playwright/test';

/**
 * The selection as the editor holds it. Chrome sends `selectionchange` as a task, so a key that a test sends
 * at once can reach the editor before it reads a caret move. A person never types that fast, so a test
 * waits for this value before the next key.
 */
export function editorSelection(text: Locator): Promise<{ from: number; to: number; text: string }> {
  return text.evaluate((element) => {
    const { state } = (
      element as unknown as {
        editor: {
          state: {
            selection: { from: number; to: number };
            doc: { textBetween: (from: number, to: number, separator: string) => string };
          };
        };
      }
    ).editor;
    const { from, to } = state.selection;
    return { from, to, text: state.doc.textBetween(from, to, ' ') };
  });
}
