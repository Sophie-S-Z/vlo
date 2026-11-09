/** The app record that holds the start of today's word count for a project (writing stats, E4). */
export const dayStartKey = (projectId: string) => `wordsToday:${projectId}`;

export interface DayStart {
  /** The local date, as YYYY-MM-DD. */
  day: string;
  /** The project's word total at the first look that day. */
  start: number;
}

export function cleanDayStart(value: unknown): DayStart | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<Record<string, unknown>>;
  if (typeof raw.day !== 'string' || typeof raw.start !== 'number' || !Number.isFinite(raw.start))
    return null;
  return { day: raw.day, start: Math.max(0, raw.start) };
}
