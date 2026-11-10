/** Escapes text for XML. Characters that XML 1.0 forbids are left out. */
export function xmlText(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- XML 1.0 has no place for these control characters.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}
