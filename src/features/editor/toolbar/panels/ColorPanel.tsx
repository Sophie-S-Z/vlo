import type { Editor } from '@tiptap/core';
import { Check, TriangleAlert } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import { useId, useState } from 'react';
import { AA_TEXT, contrastRatio, parseColor, toHex } from '@/lib/contrast';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Input } from '@/ui/input';
import {
  HIGHLIGHTS,
  PAGE_COLORS,
  TEXT_COLORS,
  currentTheme,
  resolveColor,
  swatchOf,
  swatchVar,
  type SwatchKind,
} from '../../format/palette';
import { recentColors, rememberColor } from '../../format/recentColors';

const COPY = {
  text: { title: 'Font color', none: 'Default color', palette: 'Text colors' },
  mark: { title: 'Highlight', none: 'No highlight', palette: 'Highlight colors' },
} as const;

function storedColor(editor: Editor, kind: SwatchKind): string | null {
  const value: unknown =
    kind === 'text' ? editor.getAttributes('textStyle').color : editor.getAttributes('highlight').color;
  return typeof value === 'string' && value !== '' ? value : null;
}

/** The contrast of text in this color (or on this highlight) against the page of the current theme. */
export function colorContrast(kind: SwatchKind, value: string): number | null {
  const theme = currentTheme();
  const page = PAGE_COLORS[theme];
  const color = parseColor(resolveColor(value, theme));
  const bg = parseColor(page.bg);
  const text = parseColor(page.text);
  if (!color || !bg || !text) return null;
  return kind === 'text' ? contrastRatio(color, bg) : contrastRatio(text, color);
}

export function ContrastReadout({ ratio }: { ratio: number | null }) {
  if (ratio === null) return null;
  const low = ratio < AA_TEXT;
  return (
    <p
      aria-live="polite"
      className={cn('flex items-start gap-1.5 text-xs', low ? 'text-text' : 'text-muted')}
    >
      {low ? (
        <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0 text-accent-text" />
      ) : (
        <Check aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      )}
      <span>
        Contrast {ratio.toFixed(1)}:1 on this page.
        {low && ' This is below 4.5:1, so some readers can find it hard to read.'}
      </span>
    </p>
  );
}

const swatchClass =
  'relative inline-flex size-11 items-center justify-center rounded-md border border-rule outline-none focus-visible:ring-2 focus-visible:ring-accent data-[state=on]:ring-2 data-[state=on]:ring-text pointer-fine:size-8';

/** Palette, custom color and recent colors for font color (`text`) or highlight (`mark`). */
export function ColorPanel({ editor, kind }: { editor: Editor; kind: SwatchKind }) {
  const copy = COPY[kind];
  const [value, setValue] = useState<string | null>(() => storedColor(editor, kind));
  const [recent, setRecent] = useState(() => recentColors(kind));
  const resolved = value ? parseColor(resolveColor(value, currentTheme())) : null;
  const [hex, setHex] = useState(() => (resolved ? toHex(resolved) : ''));
  const [hexError, setHexError] = useState('');
  const hexId = useId();
  const pickerId = useId();
  const swatches = kind === 'text' ? TEXT_COLORS : HIGHLIGHTS;

  const apply = (next: string | null) => {
    const chain = editor.chain();
    if (kind === 'text') (next ? chain.setColor(next) : chain.unsetColor()).run();
    else (next ? chain.setHighlight({ color: next }) : chain.unsetHighlight()).run();
    setValue(next);
    const rgb = next ? parseColor(resolveColor(next, currentTheme())) : null;
    setHex(rgb ? toHex(rgb) : '');
    setHexError('');
  };
  const applyCustom = (raw: string) => {
    const rgb = parseColor(raw.startsWith('#') ? raw : `#${raw}`);
    if (!rgb) {
      setHexError('Type a color code such as #3a7bd5.');
      return;
    }
    const code = toHex(rgb);
    apply(code);
    setRecent(rememberColor(kind, code));
  };

  const selected = value ? (swatchOf(value)?.swatch.id ?? '') : '';

  return (
    <div className="grid gap-3">
      <h2 className="text-sm font-medium">{copy.title}</h2>
      <ToggleGroup.Root
        type="single"
        aria-label={copy.palette}
        value={selected}
        onValueChange={(id) => {
          apply(id ? swatchVar(kind, id) : null);
        }}
        className="grid grid-cols-5 gap-1.5"
      >
        {swatches.map((s) => (
          <ToggleGroup.Item
            key={s.id}
            value={s.id}
            aria-label={s.label}
            title={s.label}
            className={swatchClass}
            style={
              kind === 'text'
                ? { color: swatchVar('text', s.id) }
                : { backgroundColor: swatchVar('mark', s.id), color: 'var(--text)' }
            }
          >
            <span aria-hidden="true" className="font-manuscript text-lg leading-none">
              A
            </span>
            {kind === 'text' && (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 bottom-1.5 h-1 rounded-full pointer-fine:bottom-1"
                style={{ backgroundColor: swatchVar('text', s.id) }}
              />
            )}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      <Button
        variant="outline"
        className="justify-start"
        disabled={value === null}
        onClick={() => {
          apply(null);
        }}
      >
        {copy.none}
      </Button>

      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-muted" id={`${pickerId}-label`}>
          Custom color
        </span>
        <div className="flex items-center gap-2">
          <input
            id={pickerId}
            type="color"
            aria-labelledby={`${pickerId}-label`}
            value={hex || (kind === 'text' ? '#3a7bd5' : '#f3e27e')}
            onChange={(event) => {
              // The text changes while the writer drags in the picker. Undo groups the steps.
              apply(event.target.value);
            }}
            onBlur={(event) => {
              if (value === event.target.value) setRecent(rememberColor(kind, event.target.value));
            }}
            className="size-11 shrink-0 cursor-pointer rounded-md border border-rule bg-bg p-1 pointer-fine:size-9"
          />
          <label htmlFor={hexId} className="sr-only">
            Color code
          </label>
          <Input
            id={hexId}
            value={hex}
            spellCheck={false}
            autoComplete="off"
            placeholder="#3a7bd5"
            aria-invalid={hexError !== '' || undefined}
            aria-describedby={hexError ? `${hexId}-error` : undefined}
            onChange={(event) => {
              setHex(event.target.value.trim());
              setHexError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyCustom(hex);
              }
            }}
            className="font-mono text-sm"
          />
          <Button
            variant="outline"
            className="px-3"
            onClick={() => {
              applyCustom(hex);
            }}
          >
            Apply
          </Button>
        </div>
        {hexError && (
          <p id={`${hexId}-error`} className="text-xs text-accent-text">
            {hexError}
          </p>
        )}
      </div>

      {recent.length > 0 && (
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted">Recent</span>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((code) => (
              <button
                key={code}
                type="button"
                aria-label={`Recent color ${code}`}
                title={code}
                aria-pressed={value === code}
                onClick={() => {
                  apply(code);
                }}
                className={cn(swatchClass, 'aria-pressed:ring-2 aria-pressed:ring-text')}
                style={{ backgroundColor: code }}
              />
            ))}
          </div>
        </div>
      )}

      {value && <ContrastReadout ratio={colorContrast(kind, value)} />}
    </div>
  );
}
