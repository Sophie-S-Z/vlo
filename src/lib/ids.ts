/** FNV-1a, 32 bits: the same text always gives the same number. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function newId(): string {
  return crypto.randomUUID();
}
