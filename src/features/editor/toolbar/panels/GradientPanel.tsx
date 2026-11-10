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
  type FillStop,
  type TextFill,
} from '../../format/fill';
import { currentTheme } from '../../format/palette';
import { removeLook, saveLook, savedLooks, type SavedLook } from '../../format/savedLooks';

function fillClass(fill: TextFill): string {
  return cn('vlo-fill', `vlo-fill-${fill.look}`, fill.shimmer && 'vlo-fill-shimmer');
}

/**
 * A stop as the panel edits it. The id stays the same while the stop moves, so a stop dragged past
 * another one keeps its focus and its place in the list. The mark gets the stops sorted by place.
 */
interface EditStop extends FillStop {
  id: number;
}

type FillRest = Omit<TextFill, 'stops'>;

let lastStopId = 0;
function tagStops(stops: readonly FillStop[]): EditStop[] {
  return stops.map((stop) => ({ ...stop, id: ++lastStopId }));
}

function restOf(fill: TextFill): FillRest {
  return { angle: fill.angle, look: fill.look, shimmer: fill.shimmer, speed: fill.speed };
}

/** The stops from left to right. Two stops at one place keep the order they were made in. */
function byPlace(stops: readonly EditStop[]): EditStop[] {
  return [...stops].sort((a, b) => a.at - b.at || a.id - b.id);
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
  stops,
  fill,
  selected,
  onSelect,
  onChange,
}: {
  stops: readonly EditStop[];
  /** The sorted fill, for the bar's gradient and the color of a new stop. */
  fill: TextFill;
  selected: number;
  onSelect: (id: number) => void;
  onChange: (stops: EditStop[], selected: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const placeOf = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.round(Math.min(Math.max(((clientX - rect.left) / rect.width) * 100, 0), 100));
  };
  const move = (id: number, at: number) => {
    onChange(
      stops.map((s) => (s.id === id ? { ...s, at } : s)),
      id,
    );
  };
  const remove = (id: number) => {
    if (stops.length <= MIN_STOPS) return;
    const ordered = byPlace(stops);
    const index = ordered.findIndex((s) => s.id === id);
    const rest = ordered.filter((s) => s.id !== id);
    const next = rest[Math.max(0, index - 1)] ?? rest[0];
    onChange(
      stops.filter((s) => s.id !== id),
      next?.id ?? 0,
    );
  };
  const order = byPlace(stops).map((s) => s.id);

  return (
    <div className="relative px-2.5">
      <div
        ref={bar}
        aria-hidden="true"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget || stops.length >= MAX_STOPS) return;
          const at = placeOf(event.clientX);
          const [added] = tagStops([{ color: colorAt(fill, at), at }]);
          if (added) onChange([...stops, added], added.id);
        }}
        className="h-8 cursor-copy rounded-md border border-rule"
        style={{ backgroundImage: gradientCss({ ...fill, angle: 90 }) }}
      />
      {stops.map((stop) => (
        <div
          key={stop.id}
          role="slider"
          tabIndex={0}
          aria-label={`Color stop ${String(order.indexOf(stop.id) + 1)}, ${stop.color}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={stop.at}
          aria-valuetext={`${String(stop.at)} percent`}
          onFocus={() => {
            onSelect(stop.id);
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 1;
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
              event.preventDefault();
              move(stop.id, Math.min(stop.at + step, 100));
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
              event.preventDefault();
              move(stop.id, Math.max(stop.at - step, 0));
            } else if (event.key === 'Delete' || event.key === 'Backspace') {
              event.preventDefault();
              remove(stop.id);
            }
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onSelect(stop.id);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) move(stop.id, placeOf(event.clientX));
          }}
          className={cn(
            'absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 shadow outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:size-7',
            stop.id === selected ? 'border-text' : 'border-surface',
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
  const [initial] = useState<TextFill>(() => currentFill(editor) ?? DEFAULT_FILL);
  const [stops, setStops] = useState<EditStop[]>(() => tagStops(initial.stops));
  const [rest, setRest] = useState<FillRest>(() => restOf(initial));
  const [hasFill, setHasFill] = useState(() => currentFill(editor) !== null);
  const [selected, setSelected] = useState(() => stops[0]?.id ?? 0);
  const [looks, setLooks] = useState<SavedLook[]>(savedLooks);
  const [lookName, setLookName] = useState('');
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const ids = { hex: useId(), speed: useId(), shimmer: useId(), name: useId(), color: useId() };

  // The sorted, checked fill: what the mark stores, the preview shows and the contrast check reads.
  const fill = parseFill({ ...rest, stops: byPlace(stops) }) ?? DEFAULT_FILL;
  const stop = stops.find((s) => s.id === selected) ?? stops[0];
  const write = (nextStops: EditStop[], nextRest: FillRest, nextSelected = selected) => {
    const clean = parseFill({ ...nextRest, stops: byPlace(nextStops) });
    if (!clean) return;
    setStops(nextStops);
    setRest(nextRest);
    setSelected(nextStops.some((s) => s.id === nextSelected) ? nextSelected : (nextStops[0]?.id ?? 0));
    setHexDraft(null);
    if (editor.chain().setTextFill(clean).run()) setHasFill(true);
  };
  /** Changes the angle, look, shimmer or speed. */
  const apply = (next: Partial<FillRest>) => {
    write(stops, { ...rest, ...next });
  };
  /** Starts from a preset or a saved look. */
  const start = (from: TextFill) => {
    const tagged = tagStops(from.stops);
    write(tagged, restOf(from), tagged[0]?.id ?? 0);
  };
  const setStopColor = (color: string) => {
    const rgb = parseColor(color);
    if (!rgb || !stop) return;
    write(
      stops.map((s) => (s.id === stop.id ? { ...s, color: toHex(rgb) } : s)),
      rest,
    );
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
                start(p.fill);
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
                      start(look.fill);
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
        <StopBar
          stops={stops}
          fill={fill}
          selected={selected}
          onSelect={setSelected}
          onChange={(next, id) => {
            write(next, rest, id);
          }}
        />
        <p className="text-xs text-muted">
          Press the bar to add a color. Drag a color, or use the arrow keys. Delete removes it.
        </p>
        {stop && (
          <div className="flex items-center gap-2">
            <label htmlFor={ids.color} className="sr-only">
              Color of the chosen stop
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
              Color code of the chosen stop
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
              disabled={stops.length <= MIN_STOPS}
              onClick={() => {
                const ordered = byPlace(stops);
                const index = ordered.findIndex((s) => s.id === stop.id);
                const left = ordered.filter((s) => s.id !== stop.id);
                write(
                  stops.filter((s) => s.id !== stop.id),
                  rest,
                  (left[Math.max(0, index - 1)] ?? left[0])?.id ?? 0,
                );
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
            apply({ angle });
          }}
        />
        <p className="text-sm">
          Angle <span className="tabular-nums text-muted">{fill.angle}°</span>
        </p>
      </section>

      <section className="grid gap-1.5">
        <h3 className="text-xs font-medium text-muted">Look</h3>
        <ToggleGroup.Root
          type="single"
          aria-label="Look"
          value={fill.look}
          onValueChange={(look) => {
            if (look) apply({ look: look as FillLook });
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
              apply({ shimmer });
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
              apply({ speed: MIN_SPEED + MAX_SPEED - Number(event.target.value) });
            }}
            className="accent-[var(--accent)] disabled:opacity-40"
          />
          <span className="tabular-nums text-xs text-muted">{fill.speed} s</span>
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
