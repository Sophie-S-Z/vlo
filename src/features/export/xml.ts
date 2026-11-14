/** Takes out the control characters that XML 1.0 has no place for, such as a form feed from a paste. */
export function xmlChars(text: string): string {
  // eslint-disable-next-line no-control-regex -- these are the characters to take out.
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '');
}

/** Escapes text for XML. Characters that XML 1.0 forbids are left out. */
export function xmlText(text: string): string {
  return xmlChars(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
