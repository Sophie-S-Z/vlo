import type { Editor } from '@tiptap/core';
import { useId, useState, type CSSProperties } from 'react';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Switch } from '@/ui/switch';
import type { Align } from '@/features/export/model';
import { FONT_GROUPS, fontLabel, VLO_FONTS } from '../../format/fonts';
import {
  MAX_STYLE_NAME,
  MAX_STYLES,
  newStyleId,
  STYLE_LIMITS,
  styleDeclarations,
  type ParagraphStyle,
  type StyleLook,
} from '../../format/paragraphStyles';
import { saveParagraphStyles, useParagraphStyles } from '../../format/paragraphStyleStore';
import { absorbLook, lookAt, styleAt } from '../../paragraphStyleTools';

/*
 * "New style from this paragraph" and "Change this style" (Phase 19, Task E2): one form for the name and
 * the look of a paragraph style, with a sample line in that look.
 */

const NONE = '';
const ALIGN_NAMES: readonly [Align, string][] = [
  ['left', 'Left'],
  ['center', 'Center'],
  ['right', 'Right'],
  ['justify', 'Justify'],
];
const SELECT =
  'min-h-11 w-full rounded-md border border-rule bg-bg px-2 text-sm text-text pointer-fine:min-h-9';

/** The number fields: the style's key, the label, the unit, and the step. Size shows as a percent. */
const NUMBERS = [
  { key: 'size', label: 'Size', unit: '%', step: 5, scale: 100 },
  { key: 'indent', label: 'Indent', unit: 'em', step: 0.5, scale: 1 },
  { key: 'before', label: 'Space before', unit: 'em', step: 0.25, scale: 1 },
  { key: 'after', label: 'Space after', unit: 'em', step: 0.25, scale: 1 },
] as const;

type NumberKey = (typeof NUMBERS)[number]['key'];

/** The CSS of a look as React style, for the sample line. */
function sampleStyle(look: StyleLook): CSSProperties {
  return Object.fromEntries(
    styleDeclarations(look).map(([property, value]) => [
      property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
      value,
    ]),
  );
}

export function ParagraphStyleDialog({
  editor,
  mode,
  onDone,
}: {
  editor: Editor;
  mode: 'new' | 'edit';
  onDone: () => void;
}) {
  const styles = useParagraphStyles();
  const id = useId();
  // The formats that the paragraph has now. A new style takes them, and the paragraph then shows its style.
  const [captured] = useState(() => lookAt(editor));
  const [draft, setDraft] = useState<ParagraphStyle | null>(() =>
    mode === 'new' ? { id: newStyleId(), name: '', ...captured } : (styleAt(editor) ?? null),
  );
  const [numbers, setNumbers] = useState<Record<NumberKey, string>>(
    () =>
      Object.fromEntries(
        NUMBERS.map(({ key, scale }) => {
          const value = draft?.[key];
          return [key, value === undefined ? '' : String(Math.round(value * scale * 100) / 100)];
        }),
      ) as Record<NumberKey, string>,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!draft) return <p className="text-sm text-muted">The paragraph at the cursor has no style.</p>;

  const change = (next: Partial<ParagraphStyle>) => {
    setDraft({ ...draft, ...next });
    setError('');
  };
  const clear = (key: keyof StyleLook) => {
    setDraft(Object.fromEntries(Object.entries(draft).filter(([k]) => k !== key)) as ParagraphStyle);
  };
  const setNumber = (key: NumberKey, text: string, scale: number) => {
    setNumbers({ ...numbers, [key]: text });
    const value = Number(text) / scale;
    const [min, max] = STYLE_LIMITS[key];
    if (text.trim() === '') clear(key);
    else if (Number.isFinite(value) && value >= min && value <= max) change({ [key]: value });
  };

  const save = async (next: readonly ParagraphStyle[], after?: () => void) => {
    setSaving(true);
    try {
      await saveParagraphStyles(next);
      after?.();
      onDone();
    } catch {
      setError('Vlo could not save the style. Check the storage space on this device and try again.');
      setSaving(false);
    }
  };

  const submit = () => {
    const name = draft.name.trim();
    if (name === '') {
      setError('Give the style a name.');
      return;
    }
    const lower = name.toLowerCase();
    if (styles.some((s) => s.id !== draft.id && s.name.toLowerCase() === lower)) {
      setError('Another style has this name.');
      return;
    }
    const bad = NUMBERS.find(({ key, scale }) => {
      const text = numbers[key].trim();
      const [min, max] = STYLE_LIMITS[key];
      const value = Number(text) / scale;
      return text !== '' && !(Number.isFinite(value) && value >= min && value <= max);
    });
    if (bad) {
      const [min, max] = STYLE_LIMITS[bad.key];
      setError(
        `${bad.label} goes from ${String(min * bad.scale)} to ${String(max * bad.scale)} ${bad.unit}.`,
      );
      return;
    }
    const style = { ...draft, name };
    if (mode === 'edit') {
      void save(styles.map((s) => (s.id === style.id ? style : s)));
      return;
    }
    if (styles.length >= MAX_STYLES) {
      setError(`A project can have ${String(MAX_STYLES)} styles. Delete a style first.`);
      return;
    }
    void save([...styles, style], () => {
      absorbLook(editor, captured);
      editor.chain().focus().setParagraphStyle(style.id).run();
    });
  };

  const fontId = `${id}-font`;
  const alignId = `${id}-align`;
  const italicId = `${id}-italic`;
  const errorId = `${id}-error`;
  const ownFont = draft.font !== undefined && !VLO_FONTS.some((f) => f.id === draft.font);

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Name
        </label>
        <Input
          id={`${id}-name`}
          value={draft.name}
          maxLength={MAX_STYLE_NAME}
          autoComplete="off"
          aria-invalid={error !== '' && draft.name.trim() === ''}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            change({ name: event.target.value });
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <div className="grid gap-1.5">
          <label htmlFor={fontId} className="text-sm font-medium">
            Font
          </label>
          <select
            id={fontId}
            value={draft.font ?? NONE}
            onChange={(event) => {
              const value = event.target.value;
              if (value === NONE) clear('font');
              else change({ font: value });
            }}
            className={SELECT}
          >
            <option value={NONE}>Project font</option>
            {ownFont && draft.font && <option value={draft.font}>{fontLabel(draft.font)}</option>}
            {FONT_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {VLO_FONTS.filter((f) => f.group === group).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={alignId} className="text-sm font-medium">
            Alignment
          </label>
          <select
            id={alignId}
            value={draft.align ?? NONE}
            onChange={(event) => {
              const value = event.target.value as Align | typeof NONE;
              if (value === NONE) clear('align');
              else change({ align: value });
            }}
            className={SELECT}
          >
            <option value={NONE}>As the text</option>
            {ALIGN_NAMES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {NUMBERS.map(({ key, label, unit, step, scale }) => {
          const [min, max] = STYLE_LIMITS[key];
          return (
            <div key={key} className="grid gap-1.5">
              <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
                {label} ({unit})
              </label>
              <Input
                id={`${id}-${key}`}
                type="number"
                inputMode="decimal"
                min={min * scale}
                max={max * scale}
                step={step}
                placeholder={key === 'size' ? '100' : '0'}
                value={numbers[key]}
                onChange={(event) => {
                  setNumber(key, event.target.value, scale);
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id={italicId}
          checked={draft.italic === true}
          onCheckedChange={(on) => {
            if (on) change({ italic: true });
            else clear('italic');
          }}
        />
        <label htmlFor={italicId} className="text-sm font-medium">
          Italic
        </label>
      </div>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Sample</span>
        <div className="rounded-md border border-rule bg-bg px-3 py-2 font-manuscript">
          <p style={sampleStyle(draft)}>
            The rain stopped at the edge of town, and the sign still said open.
          </p>
        </div>
      </div>

      {error !== '' && (
        <p id={errorId} role="alert" className="text-sm text-accent-text">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {mode === 'edit' && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto"
            disabled={saving}
            onClick={() => {
              // A paragraph with a deleted style shows as body text.
              void save(styles.filter((s) => s.id !== draft.id));
            }}
          >
            Delete style
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {mode === 'new' ? 'Create style' : 'Save style'}
        </Button>
      </div>
    </form>
  );
}
