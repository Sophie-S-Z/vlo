import { FileText, Minus, Plus } from 'lucide-react';
import { useId } from 'react';
import { SCRIPT_STYLES, type PageFormat, type ScriptStyle } from '@/lib/db';
import { Button } from '@/ui/button';
import { ICON_BUTTON } from '@/ui/tip';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/ui/radio-group';
import { DEFAULT_LANGUAGE, LANGUAGES, languageLabel } from '@/lib/language';
import { cleanZoom, PAGE_FORMATS, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './format/page';

interface PageControlProps {
  page: PageFormat;
  onPage: (page: PageFormat) => void;
  /** Page zoom in percent, on this device. */
  zoom: number;
  onZoom: (zoom: number) => void;
  /** The page count in Letter or A4, or null in pageless or a narrow window. */
  pages: number | null;
  /** The project's language, as stored (F38). */
  language: string | undefined;
  onLanguage: (language: string) => void;
  /** The layout of a Script project (F63), only for a script item. */
  script?: { style: ScriptStyle; onStyle: (style: ScriptStyle) => void } | undefined;
}

const SCRIPT_STYLE_LABELS: Readonly<Record<ScriptStyle, string>> = {
  screenplay: 'Screenplay',
  stage: 'Stage play',
};

/** The page format and page zoom (plan Task A7, E7), in the header above the manuscript. */
export function PageControl({
  page,
  onPage,
  zoom,
  onZoom,
  pages,
  language,
  onLanguage,
  script,
}: PageControlProps) {
  const groupId = useId();
  const scriptId = useId();
  const zoomId = useId();
  const languageId = useId();
  const shownLanguage = language ?? DEFAULT_LANGUAGE;
  // A language from an import or a backup that the list does not name still shows.
  const languages = (LANGUAGES as readonly string[]).includes(shownLanguage)
    ? LANGUAGES
    : [shownLanguage, ...LANGUAGES];
  const current = PAGE_FORMATS.find((f) => f.value === page) ?? PAGE_FORMATS[0];
  const label = current?.label ?? 'Pageless';
  const step = (delta: number) => {
    onZoom(cleanZoom(zoom + delta));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={ICON_BUTTON}
          aria-label={`Page: ${label}, zoom ${String(zoom)} percent`}
          data-tool="page"
          data-tip={zoom === 100 ? `Page: ${label}` : `Page: ${label}, ${String(zoom)}%`}
        >
          <FileText aria-hidden="true" className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Page" className="grid w-[min(20rem,calc(100vw-1.5rem))] gap-4">
        <div className="grid gap-2">
          <h2 id={groupId} className="text-sm font-medium">
            Page format
          </h2>
          <RadioGroup
            aria-labelledby={groupId}
            value={page}
            onValueChange={(next) => {
              if (next === 'pageless' || next === 'letter' || next === 'a4') onPage(next);
            }}
          >
            {PAGE_FORMATS.map((format) => {
              const id = `${groupId}-${format.value}`;
              return (
                <div key={format.value} className="flex items-start gap-3">
                  <RadioGroupItem
                    id={id}
                    value={format.value}
                    className="mt-0.5"
                    aria-describedby={`${id}-hint`}
                  />
                  <label htmlFor={id} className="grid gap-0.5 text-sm">
                    <span>{format.label}</span>
                    <span id={`${id}-hint`} className="text-xs text-muted">
                      {format.hint}
                    </span>
                  </label>
                </div>
              );
            })}
          </RadioGroup>
          <p className="text-xs text-muted">
            {pages !== null
              ? `This item fills about ${String(pages)} ${pages === 1 ? 'page' : 'pages'}. `
              : ''}
            Page ends come close to the PDF export, which has the exact layout. The page format is the same
            for every item in the project.
          </p>
        </div>

        {script && (
          <div className="grid gap-2">
            <label htmlFor={scriptId} className="text-sm font-medium">
              Script layout
            </label>
            <select
              id={scriptId}
              value={script.style}
              aria-describedby={`${scriptId}-hint`}
              onChange={(event) => {
                const next = SCRIPT_STYLES.find((style) => style === event.target.value);
                if (next) script.onStyle(next);
              }}
              className="min-h-11 rounded-md border border-rule bg-bg px-2 text-sm text-text pointer-fine:min-h-9"
            >
              {SCRIPT_STYLES.map((style) => (
                <option key={style} value={style}>
                  {SCRIPT_STYLE_LABELS[style]}
                </option>
              ))}
            </select>
            <p id={`${scriptId}-hint`} className="text-xs text-muted">
              A stage play puts the names in the center and the stage directions to the right. The layout is
              the same for every scene in the project.
            </p>
          </div>
        )}

        <div className="grid gap-2">
          <label htmlFor={languageId} className="text-sm font-medium">
            Language of the writing
          </label>
          <select
            id={languageId}
            value={shownLanguage}
            aria-describedby={`${languageId}-hint`}
            onChange={(event) => {
              onLanguage(event.target.value);
            }}
            className="min-h-11 rounded-md border border-rule bg-bg px-2 text-sm text-text pointer-fine:min-h-9"
          >
            {languages.map((code) => (
              <option key={code} value={code}>
                {languageLabel(code)}
              </option>
            ))}
          </select>
          <p id={`${languageId}-hint`} className="text-xs text-muted">
            The browser checks the spelling in this language, and the exports name it. Hebrew, Arabic,
            Persian, Urdu and Yiddish read from right to left. The language is the same for every item in the
            project.
          </p>
        </div>

        <div className="grid gap-2">
          <label htmlFor={zoomId} className="text-sm font-medium">
            Zoom: <span className="tabular-nums">{zoom}%</span>
          </label>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              aria-label="Zoom out"
              disabled={zoom <= ZOOM_MIN}
              className="px-3 pointer-fine:min-h-8"
              onClick={() => {
                step(-ZOOM_STEP);
              }}
            >
              <Minus aria-hidden="true" className="size-4" />
            </Button>
            <input
              id={zoomId}
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={ZOOM_STEP}
              value={zoom}
              aria-valuetext={`${String(zoom)} percent`}
              onChange={(event) => {
                onZoom(cleanZoom(Number(event.target.value)));
              }}
              className="min-w-0 flex-1 accent-[var(--accent)]"
            />
            <Button
              variant="ghost"
              aria-label="Zoom in"
              disabled={zoom >= ZOOM_MAX}
              className="px-3 pointer-fine:min-h-8"
              onClick={() => {
                step(ZOOM_STEP);
              }}
            >
              <Plus aria-hidden="true" className="size-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">Zoom changes this device only, not the exports.</p>
            {zoom !== 100 && (
              <Button
                variant="ghost"
                className="px-2 pointer-fine:min-h-8"
                onClick={() => {
                  onZoom(100);
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
