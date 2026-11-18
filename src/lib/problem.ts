/*
 * A check that fails with words for the writer throws a RangeError, and the page shows its message. Any
 * other error, such as a full disk, shows the page's own message.
 */

/** The message of a failed change to this device's data. */
export const SAVE_FAILED = 'Vlo could not save that change on this device.';

/** The message of a RangeError, or `fallback` for any other problem. */
export function problemText(problem: unknown, fallback: string = SAVE_FAILED): string {
  return problem instanceof RangeError ? problem.message : fallback;
}

/** The text without spaces at its ends. Empty text throws a RangeError with `empty` as its message. */
export function requiredText(text: string, empty: string): string {
  const clean = text.trim();
  if (clean === '') throw new RangeError(empty);
  return clean;
}
