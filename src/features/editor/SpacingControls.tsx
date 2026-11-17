import { useId } from 'react';
import { Button } from '@/ui/button';
import { cleanSpacing, setWritingPrefs, SPACING, useWritingPrefs, type SpacingKey } from './writingPrefs';

/*
 * The space between letters, words and lines on the screen of this device, in every kind of writing. The
 * editor's Spacing panel and Settings show the same controls. A slider moves in steps, and the number field
 * takes any value in the range. The project and its exports keep their own spacing.
 */

const ROWS: readonly { key: SpacingKey; label: string; unit: string }[] = [
  { key: 'letterSpacing', label: 'Space between letters', unit: 'em' },
  { key: 'wordSpacing', label: 'Space between words', unit: 'em' },
  { key: 'lineHeight', label: 'Space between lines', unit: '×' },
];

const NORMAL = Object.fromEntries(ROWS.map(({ key }) => [key, SPACING[key].normal])) as Record<
  SpacingKey,
  number
>;

export function SpacingControls() {
  const writing = useWritingPrefs();
  const id = useId();
  const changed = ROWS.some(({ key }) => writing[key] !== NORMAL[key]);
  return (
    <div className="grid gap-4">
      {ROWS.map(({ key, label, unit }) => {
        const { min, max, step } = SPACING[key];
        const set = (raw: string) => {
          const value = Number(raw);
          if (raw.trim() === '' || !Number.isFinite(value)) return;
          setWritingPrefs({ [key]: cleanSpacing(key, Math.min(max, Math.max(min, value))) });
        };
        return (
          <div key={key} className="grid gap-1">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`${id}-${key}`} className="text-sm">
                {label}
              </label>
              <span className="flex items-center gap-1 text-xs text-muted">
                <input
                  type="number"
                  aria-label={label}
                  min={min}
                  max={max}
                  step={step}
                  value={writing[key]}
                  onChange={(event) => {
                    set(event.target.value);
                  }}
                  className="w-16 rounded-md border border-rule bg-bg px-1.5 py-0.5 text-right text-sm text-text tabular-nums"
                />
                <span aria-hidden="true" className="w-5">
                  {unit}
                </span>
              </span>
            </div>
            <input
              id={`${id}-${key}`}
              type="range"
              min={min}
              max={max}
              step={step}
              value={writing[key]}
              aria-valuetext={`${String(writing[key])} ${unit === '×' ? 'times the font size' : 'em'}`}
              onChange={(event) => {
                set(event.target.value);
              }}
              className="min-h-8 w-full accent-[var(--accent)]"
            />
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={!changed}
        onClick={() => {
          setWritingPrefs(NORMAL);
        }}
      >
        Reset spacing
      </Button>
    </div>
  );
}
