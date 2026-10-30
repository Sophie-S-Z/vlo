/** The writing app stays hidden until launch. Only the exact string "true" turns it on. */
export function isAppEnabled(value: string | undefined): boolean {
  return value === "true";
}
