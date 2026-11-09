import type { CountUnit } from '@/lib/wordcount';

const numbers = new Intl.NumberFormat();

/** "1 word" or "1,204 words". Chinese and Japanese projects count characters (F38). */
export function formatWords(count: number, unit: CountUnit = 'words'): string {
  return `${numbers.format(count)} ${count === 1 ? unit.slice(0, -1) : unit}`;
}
