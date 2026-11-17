import type { Editor } from '@tiptap/core';
import { ToggleGroup } from 'radix-ui';
import { useId, useState } from 'react';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import {
  cleanFontValue,
  DEFAULT_FONT,
  fontLabel,
  fontStack,
  vloFont,
  type FontAxis,
} from '../../format/fonts';
import {
  EFFECT_LABELS,
  EFFECTS,
  MAX_TRACKING,
  MIN_TRACKING,
  MOTION_LABELS,
  MOTIONS,
  parsePlay,
  playClass,
  playStyle,
  type TypePlay,
} from '../../format/typePlay';
import { useManuscript } from '../../manuscript';

/*
 * Type play (format/typePlay.ts). Each control changes the selected text at once, so the page itself is the
 * preview. The weight and the design axes follow the font of the text: a variable font gets sliders, and a
 * font with fixed weights says so. A second press on a chosen effect or motion turns it off.
 */

const toggleClass =
  'flex min-h-11 items-center justify-center rounded-md border border-rule px-2 text-sm outline-none hover:bg-bg focus-visible:ring-2 focus-visible:ring-accent data-[state=on]:border-accent data-[state=on]:bg-bg data-[state=on]:text-accent-text pointer-fine:min-h-9';

/** The selected text's Type play, or none. */
function currentPlay(editor: Editor): TypePlay {
  return parsePlay(editor.getAttributes('typePlay').play) ?? {};
}

/** A style object for the samples, from the same checked CSS that the mark writes. */
function styleObject(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of css.split(';')) {
    const [name, ...value] = part.split(':');
    if (!name || value.length === 0) continue;
    const camel = name.trim().replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out[camel] = value.join(':').trim();
  }
  return out;
}

function trackingText(value: number): string {
  if (value === 0) return 'Normal';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} em`;
}

function Slider({
  label,
  hint,
  min,
  max,
  step,
  value,
  valueText,
  onChange,
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueText: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-3">
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
        <span className="text-xs text-muted tabular-nums">{valueText}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
        className="accent-[var(--accent)]"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TypePlayPanel({ editor }: { editor: Editor }) {
  const ids = { effects: useId(), motion: useId() };
  const manuscript = useManuscript();
  const motionAllowed = useMotionAllowed();
  const [play, setPlay] = useState<TypePlay>(() => currentPlay(editor));
  const [message, setMessage] = useState('');
  const fontValue =
    cleanFontValue(editor.getAttributes('textStyle').font) ?? manuscript?.font ?? DEFAULT_FONT;
  const font = vloFont(fontValue);
  const fontName = fontLabel(fontValue);

  const write = (next: unknown) => {
    const clean = parsePlay(next) ?? {};
    setPlay(clean);
    editor.chain().setTypePlay(clean).run();
  };
  // An undefined value turns that part off. parsePlay drops it.
  const change = (patch: { [K in keyof TypePlay]?: TypePlay[K] | undefined }) => {
    write({ ...play, ...patch });
  };
  const setAxis = (axis: FontAxis, value: number) => {
    change({ axes: { ...play.axes, [axis.tag]: value } });
  };

  const sampleStyle = { fontFamily: fontStack(fontValue), ...styleObject(playStyle(play)) };

  return (
    <div className="grid gap-4">
      <h2 className="text-sm font-medium">Type play</h2>

      <div
        aria-hidden="true"
        className="grid min-h-20 place-items-center overflow-hidden rounded-md border border-rule bg-bg px-3 py-4"
      >
        <span className={cn('text-3xl', playClass(play))} style={sampleStyle}>
          Once upon a time
        </span>
      </div>

      <section className="grid gap-3">
        <h3 className="text-xs font-medium text-muted">Shape of {fontName}</h3>
        {font?.weights ? (
          <Slider
            label="Weight"
            min={font.weights[0]}
            max={font.weights[1]}
            step={10}
            value={play.weight ?? 400}
            valueText={play.weight === undefined ? 'Default' : String(play.weight)}
            onChange={(weight) => {
              change({ weight });
            }}
          />
        ) : (
          <p className="text-xs text-muted">
            {fontName} comes in fixed weights. Bold makes it heavier, and a variable font such as Fraunces or
            Recursive gives every weight between.
          </p>
        )}
        <Slider
          label="Letter spacing"
          min={MIN_TRACKING}
          max={MAX_TRACKING}
          step={0.01}
          value={play.tracking ?? 0}
          valueText={trackingText(play.tracking ?? 0)}
          onChange={(tracking) => {
            change({ tracking });
          }}
        />
        {(font?.axes ?? []).map((axis) => (
          <Slider
            key={axis.tag}
            label={axis.label}
            hint={axis.hint}
            min={axis.min}
            max={axis.max}
            step={axis.step}
            value={play.axes?.[axis.tag] ?? axis.start}
            valueText={play.axes?.[axis.tag] === undefined ? 'Default' : String(play.axes[axis.tag])}
            onChange={(value) => {
              setAxis(axis, value);
            }}
          />
        ))}
      </section>

      <section className="grid gap-1.5">
        <h3 id={ids.effects} className="text-xs font-medium text-muted">
          Effect
        </h3>
        <ToggleGroup.Root
          type="single"
          aria-labelledby={ids.effects}
          value={play.effect ?? ''}
          onValueChange={(next) => {
            const effect = EFFECTS.find((e) => e === next);
            change({ effect });
            setMessage(effect ? `Effect: ${EFFECT_LABELS[effect]}.` : 'Effect off.');
          }}
          className="grid grid-cols-4 gap-1.5"
        >
          {EFFECTS.map((effect) => (
            <ToggleGroup.Item key={effect} value={effect} className={toggleClass}>
              <span className={cn('font-display text-base', `vlo-play-${effect}`)}>
                {EFFECT_LABELS[effect]}
              </span>
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </section>

      <section className="grid gap-1.5">
        <h3 id={ids.motion} className="text-xs font-medium text-muted">
          Motion
        </h3>
        <ToggleGroup.Root
          type="single"
          aria-labelledby={ids.motion}
          value={play.motion ?? ''}
          onValueChange={(next) => {
            const motion = MOTIONS.find((m) => m === next);
            change({ motion });
            setMessage(motion ? `Motion: ${MOTION_LABELS[motion]}.` : 'Motion off.');
          }}
          className="grid grid-cols-2 gap-1.5"
        >
          {MOTIONS.map((motion) => (
            <ToggleGroup.Item key={motion} value={motion} className={toggleClass}>
              {MOTION_LABELS[motion]}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        <p className="text-xs text-muted">
          {motionAllowed
            ? 'The words move slowly, and rest while you type. Press a chosen effect or motion again to turn it off.'
            : 'Calm mode or reduced motion is on, so the words stay still. Press a chosen effect or motion again to turn it off.'}
        </p>
      </section>

      <div className="flex items-center justify-between gap-3">
        <p role="status" className="text-xs text-muted">
          {message}
        </p>
        <Button
          variant="ghost"
          className="px-2 pointer-fine:min-h-8"
          disabled={parsePlay(play) === null}
          onClick={() => {
            setPlay({});
            editor.chain().unsetTypePlay().run();
            setMessage('Type play removed from the text.');
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
