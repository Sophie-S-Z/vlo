import { Compass } from 'lucide-react';
import type { WordRange } from '@/lib/db';
import { cn } from '@/ui/cn';

/*
 * The guide of a section (Phase 17 decision M2): one quiet line that says what the section is for, and the
 * word range that its structure suggests, beside the words written. It never goes in the text or an export.
 * An empty section shows the guide in full; a section with words keeps it to one line.
 */

/** Where the count is against the range: under it, in it or over it. */
export function rangeState(words: number, range: WordRange | undefined): 'under' | 'in' | 'over' | null {
  if (!range || (range.min === undefined && range.max === undefined)) return null;
  if (range.min !== undefined && words < range.min) return 'under';
  if (range.max !== undefined && words > range.max) return 'over';
  return 'in';
}

/** "150–250 words", "at least 400 words" or "at most 650 words". */
export function rangeLabel(range: WordRange): string {
  const { min, max } = range;
  if (min !== undefined && max !== undefined && min > 0)
    return `${min.toLocaleString()}–${max.toLocaleString()} words`;
  if (max !== undefined) return `at most ${max.toLocaleString()} words`;
  if (min !== undefined) return `at least ${min.toLocaleString()} words`;
  return '';
}

const STATE_TEXT = { under: 'Under the range', in: 'In the range', over: 'Over the range' } as const;

export function SectionGuide({
  guide,
  words,
  range,
}: {
  guide: string | undefined;
  words: number;
  range: WordRange | undefined;
}) {
  const state = rangeState(words, range);
  if (!guide && state === null) return null;
  return (
    <div
      data-testid="section-guide"
      className="mb-3 flex items-start gap-2 text-sm text-muted [overflow-wrap:anywhere]"
    >
      <Compass aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className={cn('min-w-0 flex-1', words > 0 && 'line-clamp-1 hover:line-clamp-none')}>
        {guide && <span className="sr-only">Guide: </span>}
        {guide}
      </p>
      {range && state !== null && (
        <p
          className={cn(
            'shrink-0 tabular-nums',
            state === 'in' && 'text-accent-text',
            state === 'over' && 'font-medium text-text',
          )}
        >
          <span className="sr-only">{STATE_TEXT[state]}: </span>
          {rangeLabel(range)}
        </p>
      )}
    </div>
  );
}
