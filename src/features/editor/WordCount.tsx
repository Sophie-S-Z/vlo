import { formatWords } from '@/features/library/format';
import type { CountUnit } from '@/lib/wordcount';

/** The item's word count (and line count for poems). It changes only after a typing pause. */
export function WordCount({
  words,
  unit,
  lines,
}: {
  words: number;
  unit: CountUnit;
  lines?: number | undefined;
}) {
  return (
    <p className="overflow-hidden font-mono whitespace-nowrap text-sm text-muted">
      {/* The key restarts the roll each time the count changes. Calm mode makes it instant. */}
      <span key={words} className="vlo-roll inline-block">
        {formatWords(words, unit)}
      </span>
      {lines !== undefined && <span>{` · ${String(lines)} ${lines === 1 ? 'line' : 'lines'}`}</span>}
    </p>
  );
}
