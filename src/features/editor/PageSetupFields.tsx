import { useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import type { PageLineKind, PageSetup } from '@/lib/db';
import { Input } from '@/ui/input';
import {
  MARGIN_LABELS,
  marginsOf,
  MAX_PAGE_LINE,
  shownMargin,
  typedMargin,
  type MarginPreset,
  type Margins,
} from './format/pageSetup';

/*
 * Page setup (Phase 19, Task F3) in the Page popover: the margins, the page numbers, and the header and
 * footer lines. The page view, the PDF, the Word file and the RTF file use the same values.
 */

const SELECT =
  'min-h-11 w-full rounded-md border border-rule bg-bg px-2 text-sm text-text pointer-fine:min-h-9';
const FIELD = 'min-h-11 px-2 text-sm pointer-fine:min-h-9';

const NUMBER_LABELS: Readonly<Record<PageSetup['numbers'], string>> = {
  none: 'None',
  'bottom-center': 'Bottom center',
  'top-right': 'Top right',
};

const LINE_LABELS: Readonly<Record<PageLineKind, string>> = {
  none: 'None',
  project: 'Project title',
  item: 'Item title',
  own: 'Own text',
};

const SIDES = ['top', 'bottom', 'left', 'right'] as const;
const SIDE_LABELS: Readonly<Record<keyof Margins, string>> = {
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left',
  right: 'Right',
};

const PRESET_HINTS: Readonly<Record<MarginPreset, string>> = {
  normal: '1 inch (25 mm) on each side.',
  narrow: '0.5 inch (13 mm) on each side.',
  wide: '1 inch at the top and the bottom, and 2 inches at the left and the right.',
  custom: 'Each side can be from 0.25 to 3 inches (6 to 76 mm).',
};

/** A field that keeps the writer's text while they type and gives the value when they leave it or press Enter. */
function CommitField({
  value,
  onCommit,
  ...props
}: { value: string; onCommit: (text: string) => void } & Omit<ComponentProps<'input'>, 'value'>) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <Input
      {...props}
      value={draft ?? value}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

function LineField({
  label,
  kind,
  text,
  onChange,
}: {
  label: string;
  kind: PageLineKind;
  text: string | undefined;
  onChange: (kind: PageLineKind, text: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <select
        id={id}
        value={kind}
        className={SELECT}
        onChange={(event) => {
          const next = (Object.keys(LINE_LABELS) as PageLineKind[]).find((k) => k === event.target.value);
          if (next) onChange(next, text ?? '');
        }}
      >
        {(Object.keys(LINE_LABELS) as PageLineKind[]).map((k) => (
          <option key={k} value={k}>
            {LINE_LABELS[k]}
          </option>
        ))}
      </select>
      {kind === 'own' && (
        <CommitField
          aria-label={`${label} text`}
          value={text ?? ''}
          maxLength={MAX_PAGE_LINE}
          className={FIELD}
          onCommit={(next) => {
            onChange('own', next.trim());
          }}
        />
      )}
    </div>
  );
}

export function PageSetupFields({
  value,
  onChange,
}: {
  value: PageSetup;
  onChange: (next: PageSetup) => void;
}) {
  const headingId = useId();
  const marginsId = useId();
  const numbersId = useId();
  const unit = value.unit ?? 'in';
  const margins = marginsOf(value);
  // A change can come before the stored setup of the change before it, so each change builds on the last.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const change = (patch: Partial<PageSetup>) => {
    latest.current = { ...latest.current, ...patch };
    onChange(latest.current);
  };

  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <h2 id={headingId} className="text-sm font-medium">
        Page setup
      </h2>
      <div className="grid gap-1">
        <label htmlFor={marginsId} className="text-sm">
          Margins
        </label>
        <select
          id={marginsId}
          value={value.margins}
          aria-describedby={`${marginsId}-hint`}
          className={SELECT}
          onChange={(event) => {
            const next = (Object.keys(MARGIN_LABELS) as MarginPreset[]).find((m) => m === event.target.value);
            // Custom margins start from the margins that the page has now.
            if (next)
              change({ margins: next, ...(next === 'custom' ? { custom: marginsOf(latest.current) } : {}) });
          }}
        >
          {(Object.keys(MARGIN_LABELS) as MarginPreset[]).map((m) => (
            <option key={m} value={m}>
              {MARGIN_LABELS[m]}
            </option>
          ))}
        </select>
        <p id={`${marginsId}-hint`} className="text-xs text-muted">
          {PRESET_HINTS[value.margins]}
        </p>
      </div>
      {value.margins === 'custom' && (
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Custom margins in {unit === 'mm' ? 'millimeters' : 'inches'}</legend>
          {SIDES.map((side) => (
            <label key={side} className="grid gap-1 text-xs">
              {SIDE_LABELS[side]} ({unit})
              <CommitField
                type="number"
                inputMode="decimal"
                step={unit === 'mm' ? 1 : 0.05}
                value={String(shownMargin(margins[side], unit))}
                className={FIELD}
                onCommit={(text) => {
                  const typed = Number(text);
                  if (text.trim() === '' || !Number.isFinite(typed)) return;
                  change({ custom: { ...marginsOf(latest.current), [side]: typedMargin(typed, unit) } });
                }}
              />
            </label>
          ))}
          <label className="col-span-2 grid gap-1 text-xs">
            Unit
            <select
              value={unit}
              className={SELECT}
              onChange={(event) => {
                change({ unit: event.target.value === 'mm' ? 'mm' : 'in' });
              }}
            >
              <option value="in">Inches</option>
              <option value="mm">Millimeters</option>
            </select>
          </label>
        </fieldset>
      )}
      <div className="grid gap-1">
        <label htmlFor={numbersId} className="text-sm">
          Page numbers
        </label>
        <select
          id={numbersId}
          value={value.numbers}
          className={SELECT}
          onChange={(event) => {
            const next = (Object.keys(NUMBER_LABELS) as PageSetup['numbers'][]).find(
              (n) => n === event.target.value,
            );
            if (next) change({ numbers: next });
          }}
        >
          {(Object.keys(NUMBER_LABELS) as PageSetup['numbers'][]).map((n) => (
            <option key={n} value={n}>
              {NUMBER_LABELS[n]}
            </option>
          ))}
        </select>
      </div>
      <LineField
        label="Header line"
        kind={value.header}
        text={value.headerText}
        onChange={(header, headerText) => {
          change({ header, headerText });
        }}
      />
      <LineField
        label="Footer line"
        kind={value.footer}
        text={value.footerText}
        onChange={(footer, footerText) => {
          change({ footer, footerText });
        }}
      />
      <p className="text-xs text-muted">
        The page view, the PDF, the Word file and the RTF file use these values. The item title is the title
        of the item or chapter on the page. A book layout, standard manuscript format and a script keep the
        pages of their own format.
      </p>
    </section>
  );
}
