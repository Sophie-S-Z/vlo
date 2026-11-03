import type { Editor } from '@tiptap/core';
import { Check, TriangleAlert, X } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AA_TEXT, parseColor, toHex } from '@/lib/contrast';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Input } from '@/ui/input';
import { Switch } from '@/ui/switch';
import {
  DEFAULT_FILL,
  FILL_PRESETS,
  LOOKS,
  LOOK_LABELS,
  MAX_SPEED,
  MAX_STOPS,
  MIN_SPEED,
  MIN_STOPS,
  colorAt,
  fillStyle,
  gradientCss,
  parseFill,
  weakestStop,
  type FillLook,
  type TextFill,
} from '../../format/fill';
import { currentTheme } from '../../format/palette';
import { removeLook, saveLook, savedLooks, type SavedLook } from '../../format/savedLooks';

function fillClass(fill: TextFill): string {
  return cn('vlo-fill', `vlo-fill-${fill.look}`, fill.shimmer && 'vlo-fill-shimmer');
}

/** The fill on the selection, or null when the selection has none. */
function currentFill(editor: Editor): TextFill | null {
  return parseFill(editor.getAttributes('textFill').fill);
}

/** A swatch that shows a fill as a short bar of its gradient, for presets and saved looks. */
function FillSwatch({ fill, label, onPick }: { fill: TextFill; label: string; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onPick}
      className="h-8 rounded-md border border-rule outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:h-11"
      style={{ backgroundImage: gradientCss({ ...fill, angle: 90 }) }}
    />
  );
}

/** The angle dial: drag round it, or use the arrow keys (Shift for steps of 15). */
function AngleDial({ angle, onChange }: { angle: number; onChange: (angle: number) => void }) {
  const dial = useRef<HTMLDivElement>(null);
  const fromPointer = (event: ReactPointerEvent) => {
    const rect = dial.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    // CSS angles start at the top and turn clockwise.
    onChange(Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360));
  };
  const onKey = (event: ReactKeyboardEvent) => {
    const step = event.shiftKey ? 15 : 1;
    const moves: Record<string, number> = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    onChange((angle + move + 360) % 360);
  };
  return (
    <div
      ref={dial}
      role="slider"
      tabIndex={0}
      aria-label="Angle"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={angle}
      aria-valuetext={`${String(angle)} degrees`}
      onKeyDown={onKey}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        fromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event);
      }}
      className="relative size-12 shrink-0 cursor-grab touch-none rounded-full border border-rule bg-bg outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span
        aria-hidden="true"
        className="absolute top-1 left-1/2 h-[calc(50%-0.25rem)] w-0.5 origin-bottom -translate-x-1/2 rounded-full bg-accent"
        style={{ transform: `translateX(-50%) rotate(${String(angle)}deg)` }}
      />
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full bg-text"
      />
    </div>
  );
}

/** The stop bar: drag a stop, press the bar to add one, arrow keys move the chosen stop. */
function StopBar({
  fill,
  selected,
  onSelect,
  onChange,
}: {
  fill: TextFill;
  selected: number;
  onSelect: (index: number) => void;
  onChange: (fill: TextFill, selected: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const placeOf = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.round(Math.min(Math.max(((clientX - rect.left) / rect.width) * 100, 0), 100));
  };
  const move = (index: number, at: number) => {
    const stops = fill.stops.map((s, i) => (i === index ? { ...s, at } : s));
    onChange({ ...fill, stops }, index);
  };
  const remove = (index: number) => {
    if (fill.stops.length <= MIN_STOPS) return;
    onChange({ ...fill, stops: fill.stops.filter((_, i) => i !== index) }, Math.max(0, index - 1));
  };

  return (
    <div className="relative px-2.5">
      <div
        ref={bar}
        aria-hidden="true"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget || fill.stops.length >= MAX_STOPS) return;
          const at = placeOf(event.clientX);
          const stops = [...fill.stops, { color: colorAt(fill, at), at }];
          onChange({ ...fill, stops }, stops.length - 1);
        }}
        className="h-8 cursor-copy rounded-md border border-rule"
        style={{ backgroundImage: gradientCss({ ...fill, angle: 90 }) }}
      />
      {fill.stops.map((stop, i) => (
        <div
          key={i}
          role="slider"
          tabIndex={0}
          aria-label={`Color stop ${String(i + 1)}, ${stop.color}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={stop.at}
          aria-valuetext={`${String(stop.at)} percent`}
          onFocus={() => {
            onSelect(i);
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 1;
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
              event.preventDefault();
              move(i, Math.min(stop.at + step, 100));
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
              event.preventDefault();
              move(i, Math.max(stop.at - step, 0));
            } else if (event.key === 'Delete' || event.key === 'Backspace') {
              event.preventDefault();
              remove(i);
            }
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onSelect(i);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) move(i, placeOf(event.clientX));
          }}
          className={cn(
            'absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 shadow outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:size-7',
            i === selected ? 'border-text' : 'border-surface',
          )}
          style={{
            left: `calc(0.625rem + (100% - 1.25rem) * ${String(stop.at / 100)})`,
            backgroundColor: stop.color,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The full gradient editor: presets, color stops, angle, look, shimmer and speed, a live preview on the
 * current theme, a contrast check of every stop, and named looks saved on this device.
 */
export function GradientPanel({ editor }: { editor: Editor }) {
  const [fill, setFill] = useState<TextFill>(() => currentFill(editor) ?? DEFAULT_FILL);
  const [hasFill, setHasFill] = useState(() => currentFill(editor) !== null);
  const [selected, setSelected] = useState(0);
  const [looks, setLooks] = useState<SavedLook[]>(savedLooks);
  const [lookName, setLookName] = useState('');
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const ids = { hex: useId(), speed: useId(), shimmer: useId(), name: useId(), color: useId() };

  const stop = fill.stops[Math.min(selected, fill.stops.length - 1)] ?? fill.stops[0];
  const apply = (next: TextFill, nextSelected = selected) => {
    const clean = parseFill(next);
    if (!clean) return;
    // Sorting by place can move the chosen stop, so find it again by its place and color.
    const chosen = clean.stops.length === next.stops.length ? next.stops[nextSelected] : undefined;
    const found = chosen
      ? clean.stops.findIndex((s) => s.at === Math.round(chosen.at) && s.color === chosen.color.toLowerCase())
      : -1;
    setFill(clean);
    setSelected(found >= 0 ? found : Math.min(nextSelected, clean.stops.length - 1));
    setHexDraft(null);
    if (editor.chain().setTextFill(clean).run()) setHasFill(true);
  };
  const setStopColor = (color: string) => {
    const rgb = parseColor(color);
    if (!rgb || !stop) return;
    apply({ ...fill, stops: fill.stops.map((s) => (s === stop ? { ...s, color: toHex(rgb) } : s)) });
  };

  const weakest = weakestStop(fill, currentTheme());
  const low = weakest !== null && weakest.ratio < AA_TEXT;

  return (
    <div className="grid gap-4">
      <h2 className="text-sm font-medium">Gradient and shimmer</h2>

      <div className="grid place-items-center rounded-md border border-rule bg-bg px-3 py-4">
        <span className={cn('font-manuscript text-3xl', fillClass(fill))} style={styleObject(fill)}>
          Your words shimmer
        </span>
      </div>

      <section className="grid gap-1.5">
        <h3 className="text-xs font-medium text-muted">Presets</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {FILL_PRESETS.map((p) => (
            <FillSwatch
              key={p.name}
              fill={p.fill}
              label={p.name}
              onPick={() => {
                apply(p.fill, 0);
              }}
            />
          ))}
        </div>
      </section>

      {looks.length > 0 && (
        <section className="grid gap-1.5">
          <h3 className="text-xs font-medium text-muted">Your looks</h3>
          <ul className="grid gap-1">
            {looks.map((look) => (
              <li key={look.name} className="grid grid-cols-[1fr_auto] items-center gap-1.5">
                <div className="grid grid-cols-[3rem_1fr] items-center gap-2">
                  <FillSwatch
                    fill={look.fill}
                    label={`Use ${look.name}`}
                    onPick={() => {
                      apply(look.fill, 0);
                    }}
                  />
                  <span className="truncate text-sm">{look.name}</span>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${look.name}`}
                  onClick={() => {
                    setLooks(removeLook(look.name));
                  }}
                  className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-text pointer-coarse:size-11"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="text-xs font-medium text-muted">Colors</h3>
        <StopBar fill={fill} selected={selected} onSelect={setSelected} onChange={apply} />
        <p className="text-xs text-muted">
          Press the bar to add a color. Drag a color, or use the arrow keys. Delete removes it.
        </p>
        {stop && (
          <div className="flex items-center gap-2">
            <label htmlFor={ids.color} className="sr-only">
              Color of stop {selected + 1}
            </label>
            <input
              id={ids.color}
              type="color"
              value={stop.color}
              onChange={(event) => {
                setStopColor(event.target.value);
              }}
              className="size-11 shrink-0 cursor-pointer rounded-md border border-rule bg-bg p-1 pointer-fine:size-9"
            />
            <label htmlFor={ids.hex} className="sr-only">
              Color code of stop {selected + 1}
            </label>
            <Input
              id={ids.hex}
              value={hexDraft ?? stop.color}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                setHexDraft(event.target.value.trim());
              }}
              onBlur={() => {
                if (hexDraft !== null) setStopColor(hexDraft.startsWith('#') ? hexDraft : `#${hexDraft}`);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && hexDraft !== null) {
                  event.preventDefault();
                  setStopColor(hexDraft.startsWith('#') ? hexDraft : `#${hexDraft}`);
                }
              }}
              className="font-mono text-sm"
            />
            <Button
              variant="outline"
              className="shrink-0 px-3"
              disabled={fill.stops.length <= MIN_STOPS}
              onClick={() => {
                apply({ ...fill, stops: fill.stops.filter((s) => s !== stop) }, Math.max(0, selected - 1));
              }}
            >
              Remove
            </Button>
          </div>
        )}
      </section>

      <section className="grid grid-cols-[auto_1fr] items-center gap-3">
        <AngleDial
          angle={fill.angle}
          onChange={(angle) => {
            apply({ ...fill, angle });
          }}
        />
        <p className="text-sm">
          Angle <span className="font-mono text-muted">{fill.angle}°</span>
        </p>
      </section>

      <section className="grid gap-1.5">
        <h3 className="text-xs font-medium text-muted">Look</h3>
        <ToggleGroup.Root
          type="single"
          aria-label="Look"
          value={fill.look}
          onValueChange={(look) => {
            if (look) apply({ ...fill, look: look as FillLook });
          }}
          className="grid grid-cols-2 gap-1"
        >
          {LOOKS.map((look) => (
            <ToggleGroup.Item
              key={look}
              value={look}
              className="min-h-11 rounded-md border border-rule px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent data-[state=on]:border-accent data-[state=on]:text-accent-text pointer-fine:min-h-9"
            >
              {LOOK_LABELS[look]}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </section>

      <section className="grid gap-2">
        <div className="flex items-center gap-3">
          <Switch
            id={ids.shimmer}
            checked={fill.shimmer}
            onCheckedChange={(shimmer) => {
              apply({ ...fill, shimmer });
            }}
          />
          <label htmlFor={ids.shimmer} className="text-sm">
            Shimmer when typing stops
          </label>
        </div>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <label htmlFor={ids.speed} className="text-sm">
            Speed
          </label>
          <input
            id={ids.speed}
            type="range"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={1}
            // A slow shimmer has the longer pass, so the slider reads slow to fast from left to right.
            value={MIN_SPEED + MAX_SPEED - fill.speed}
            aria-valuetext={`${String(fill.speed)} seconds for each pass`}
            disabled={!fill.shimmer}
            onChange={(event) => {
              apply({ ...fill, speed: MIN_SPEED + MAX_SPEED - Number(event.target.value) });
            }}
            className="accent-[var(--accent)] disabled:opacity-40"
          />
          <span className="font-mono text-xs text-muted">{fill.speed} s</span>
        </div>
      </section>

      {weakest && (
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
            Lowest contrast {weakest.ratio.toFixed(1)}:1 on this page, at {weakest.stop.color}.
            {low && ' This is below 4.5:1, so some readers can find parts of the text hard to read.'}
          </span>
        </p>
      )}

      <form
        className="grid grid-cols-[1fr_auto] items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (lookName.trim() === '') return;
          setLooks(saveLook(lookName, fill));
          setLookName('');
        }}
      >
        <div className="grid gap-1">
          <label htmlFor={ids.name} className="text-xs font-medium text-muted">
            Save this look as
          </label>
          <Input
            id={ids.name}
            value={lookName}
            maxLength={40}
            placeholder="Moonlit gold"
            onChange={(event) => {
              setLookName(event.target.value);
            }}
          />
        </div>
        <Button type="submit" variant="outline" disabled={lookName.trim() === ''}>
          Save
        </Button>
      </form>

      <Button
        variant="ghost"
        className="justify-start"
        disabled={!hasFill}
        onClick={() => {
          editor.chain().unsetTextFill().run();
          setHasFill(false);
        }}
      >
        Remove gradient
      </Button>
    </div>
  );
}

/** The fill's CSS variables as a React style object, for the preview. */
function styleObject(fill: TextFill): Record<string, string> {
  return Object.fromEntries(
    fillStyle(fill)
      .split('; ')
      .map((part) => {
        const at = part.indexOf(': ');
        return [part.slice(0, at), part.slice(at + 2)];
      }),
  );
}
