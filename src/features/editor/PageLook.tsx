import { BookType, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Input } from '@/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { Segmented } from '@/ui/segmented';
import { ICON_BUTTON } from '@/ui/tip';
import { FONT_GROUPS, fontLabel, fontStack, VLO_FONTS, type FontValue } from './format/fonts';
import {
  LINE_HEIGHTS,
  MAX_LOOK_NAME,
  MAX_LOOKS,
  PAGE_WIDTH_MAX,
  PAGE_WIDTH_MIN,
  PAGE_WIDTH_STEP,
  setWritingPrefs,
  useWritingPrefs,
  type PageLook,
  type ParagraphLook,
  type SavedLook,
} from './writingPrefs';

/*
 * Page look (Phase 19, Task A3): how the text looks on this screen. A look sets the text width, the
 * paragraphs, the line spacing and a screen font at once, and each part can change on its own. Nothing here
 * changes the project, the exports or another device.
 */

/** The looks that Vlo offers. The first is the look of a new writer. */
const PAGE_LOOKS: readonly SavedLook[] = [
  { name: 'Vlo', pageWidth: 100, paragraphs: 'spaced', screenFont: null, lineHeight: 1.7 },
  { name: 'Book', pageWidth: 64, paragraphs: 'indented', screenFont: null, lineHeight: 1.7 },
  { name: 'Manuscript', pageWidth: 68, paragraphs: 'indented', screenFont: 'courier-prime', lineHeight: 2.3 },
  { name: 'Modern', pageWidth: 72, paragraphs: 'airy', screenFont: 'inter', lineHeight: 1.7 },
  { name: 'Quiet', pageWidth: 60, paragraphs: 'spaced', screenFont: 'literata', lineHeight: 2 },
  { name: 'Wide', pageWidth: 160, paragraphs: 'spaced', screenFont: null, lineHeight: 1.7 },
];

const PARAGRAPH_OPTIONS: { value: ParagraphLook; label: string }[] = [
  { value: 'spaced', label: 'Spaced' },
  { value: 'indented', label: 'Indented' },
  { value: 'airy', label: 'Airy' },
];

const LINE_LABELS: Readonly<Record<number, string>> = { 1.7: 'Standard', 2: 'Relaxed', 2.3: 'Double' };
const LINE_OPTIONS = LINE_HEIGHTS.map((h) => ({ value: String(h), label: LINE_LABELS[h] ?? String(h) }));

const PROJECT_FONT = '';

/** True when the prefs show this look now. */
function sameLook(a: PageLook, b: PageLook): boolean {
  return (
    a.pageWidth === b.pageWidth &&
    a.paragraphs === b.paragraphs &&
    a.screenFont === b.screenFont &&
    a.lineHeight === b.lineHeight
  );
}

function lookOf(look: PageLook): PageLook {
  const { pageWidth, paragraphs, screenFont, lineHeight } = look;
  return { pageWidth, paragraphs, screenFont, lineHeight };
}

/** The Page look button and popover, on the item row next to Page. */
export function PageLookControl({ projectFont }: { projectFont: FontValue }) {
  const prefs = useWritingPrefs();
  const current = lookOf(prefs);
  const widthId = useId();
  const fontId = useId();
  const nameId = useId();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const nameField = useRef<HTMLInputElement>(null);
  // The name field takes the focus when it opens, so the writer can type the name at once.
  useEffect(() => {
    if (naming) nameField.current?.focus();
  }, [naming]);

  const apply = (look: PageLook, said: string) => {
    setWritingPrefs(lookOf(look));
    setMessage(said);
  };

  const save = (event: SyntheticEvent) => {
    event.preventDefault();
    const clean = name.trim().slice(0, MAX_LOOK_NAME);
    if (clean === '') return;
    // A look with the same name takes the new values. The newest look comes first.
    const rest = prefs.looks.filter((l) => l.name !== clean);
    setWritingPrefs({ looks: [{ name: clean, ...current }, ...rest].slice(0, MAX_LOOKS) });
    setNaming(false);
    setName('');
    setMessage(`Saved the look ${clean}.`);
  };

  const card = (look: SavedLook, own: boolean) => {
    const on = sameLook(look, current);
    const stack = fontStack(look.screenFont ?? projectFont);
    return (
      <div key={`${own ? 'own' : 'vlo'}-${look.name}`} className="relative">
        <button
          type="button"
          aria-pressed={on}
          onClick={() => {
            apply(look, `The page shows the look ${look.name}.`);
          }}
          className={cn(
            'grid min-h-16 w-full content-center justify-items-start gap-0.5 rounded-md border px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent',
            on ? 'border-accent bg-bg' : 'border-rule hover:border-muted',
          )}
        >
          <span aria-hidden="true" className="text-xl leading-none" style={{ fontFamily: stack }}>
            Aa
          </span>
          <span className="max-w-full truncate text-xs text-muted">{look.name}</span>
        </button>
        {own && (
          <button
            type="button"
            aria-label={`Remove the look ${look.name}`}
            onClick={() => {
              setWritingPrefs({ looks: prefs.looks.filter((l) => l.name !== look.name) });
              setMessage(`Removed the look ${look.name}.`);
            }}
            className="absolute top-0.5 right-0.5 inline-flex size-7 items-center justify-center rounded-md text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <Popover
      onOpenChange={() => {
        setNaming(false);
        setMessage('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={ICON_BUTTON}
          aria-label="Page look"
          data-tool="page-look"
          data-tip="Page look"
        >
          <BookType aria-hidden="true" className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Page look"
        className="grid w-[min(22rem,calc(100vw-1.5rem))] gap-4"
      >
        <div className="grid gap-1">
          <h2 className="text-sm font-medium">Page look</h2>
          <p className="text-xs text-muted">
            These change this screen only. The project, the exports and your other devices keep their look.
          </p>
        </div>

        <div role="group" aria-label="Looks" className="grid grid-cols-3 gap-2">
          {PAGE_LOOKS.map((look) => card(look, false))}
          {prefs.looks.map((look) => card(look, true))}
        </div>

        <div className="grid gap-2">
          <label htmlFor={widthId} className="text-sm font-medium">
            Text width: <span className="tabular-nums">{prefs.pageWidth} characters</span>
          </label>
          <input
            id={widthId}
            type="range"
            min={PAGE_WIDTH_MIN}
            max={PAGE_WIDTH_MAX}
            step={PAGE_WIDTH_STEP}
            value={prefs.pageWidth}
            aria-valuetext={`${String(prefs.pageWidth)} characters`}
            onChange={(event) => {
              setWritingPrefs({ pageWidth: Number(event.target.value) });
            }}
            className="accent-[var(--accent)]"
          />
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Paragraphs</span>
          <Segmented
            label="Paragraphs"
            options={PARAGRAPH_OPTIONS}
            value={prefs.paragraphs}
            onChange={(paragraphs) => {
              setWritingPrefs({ paragraphs });
            }}
          />
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Line spacing</span>
          <Segmented
            label="Line spacing"
            options={LINE_OPTIONS}
            value={String(prefs.lineHeight)}
            onChange={(value) => {
              setWritingPrefs({ lineHeight: Number(value) });
            }}
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor={fontId} className="text-sm font-medium">
            Screen font
          </label>
          <select
            id={fontId}
            value={prefs.screenFont ?? PROJECT_FONT}
            onChange={(event) => {
              const value = event.target.value;
              setWritingPrefs({ screenFont: value === PROJECT_FONT ? null : value });
            }}
            className="min-h-11 rounded-md border border-rule bg-bg px-2 text-sm text-text pointer-fine:min-h-9"
          >
            <option value={PROJECT_FONT}>Project font ({fontLabel(projectFont)})</option>
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
          {prefs.comfortFont && (
            <p className="text-xs text-muted">
              The reading comfort font in Settings is on, so the text shows in Atkinson Hyperlegible Next.
            </p>
          )}
        </div>

        {naming ? (
          <form onSubmit={save} className="grid gap-2">
            <label htmlFor={nameId} className="text-sm font-medium">
              Name of the look
            </label>
            <div className="flex gap-2">
              <Input
                id={nameId}
                value={name}
                maxLength={MAX_LOOK_NAME}
                ref={nameField}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                className="min-w-0 flex-1"
              />
              <Button type="submit" disabled={name.trim() === ''}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="ghost"
            className="justify-self-start px-2"
            onClick={() => {
              setNaming(true);
            }}
          >
            Save this look
          </Button>
        )}
        <p role="status" className="sr-only">
          {message}
        </p>
      </PopoverContent>
    </Popover>
  );
}
