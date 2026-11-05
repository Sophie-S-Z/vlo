/*
 * The name and the attribute of the private-name mark. The export worker reads them too, so this file
 * imports nothing from the editor.
 */

export const PRIVATE_NAME = 'privateName';

/** The person id of a mark's attributes, or null when it has none that Vlo can use. */
export function personIdOf(attrs: Record<string, unknown> | null | undefined): string | null {
  const value = attrs?.personId;
  return typeof value === 'string' && value !== '' ? value : null;
}
