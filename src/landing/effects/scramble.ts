const CHARS = "abcdefghijklmnopqrstuvwxyz";

/**
 * One frame of a text scramble from `from` to `to` at `progress` (0 to 1). The new text shows
 * from the left; the rest is random letters, with spaces kept so the words keep their shape.
 */
export function scrambleText(
  from: string,
  to: string,
  progress: number,
  random: () => number = Math.random,
): string {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  const length = Math.round(from.length + (to.length - from.length) * progress);
  const revealed = Math.floor(to.length * progress);
  let out = "";
  for (let i = 0; i < length; i++) {
    if (i < revealed) out += to[i];
    else if ((to[i] ?? from[i]) === " ") out += " ";
    else out += CHARS[Math.floor(random() * CHARS.length)];
  }
  return out;
}
