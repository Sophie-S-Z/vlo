/*
 * The plain text of a citation (F64): its key in Pandoc's form, such as "[@marlow2019, 12]". Search, plain
 * text copies and readable backups use it. It has no editor code, so the export worker can import it.
 */

export const CITE = 'cite';

export function citeText(attrs: Record<string, unknown>): string {
  const key = typeof attrs.key === 'string' ? attrs.key : '';
  const page = typeof attrs.page === 'string' ? attrs.page.trim() : '';
  return page === '' ? `[@${key}]` : `[@${key}, ${page}]`;
}
