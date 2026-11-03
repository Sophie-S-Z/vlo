import type { Editor } from '@tiptap/core';
import { HardDrive, Search } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import { useId, useMemo, useState } from 'react';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import {
  BASE_STACK,
  cleanFontValue,
  DEFAULT_FONT,
  FONT_GROUPS,
  fontLabel,
  fontStack,
  localFont,
  localFontName,
  VLO_FONTS,
  vloFont,
  type FontValue,
} from '../../format/fonts';
import {
  canListFonts,
  fontSeemsInstalled,
  listInstalledFonts,
  recentOwnFonts,
  rememberOwnFont,
} from '../../format/ownFonts';
import { useManuscript } from '../../manuscript';

/*
 * The font menu (plan Task A7). Font names show in the interface font, and the preview shows the font
 * under the pointer or focus, so a font loads only when the writer looks at it or picks it.
 */

/** In the selected-text list: no font of its own, so the text follows the project font. */
const PROJECT_FONT = 'project';
/** The most installed fonts the list shows at once. The search finds the rest. */
const MAX_DEVICE_FONTS = 300;

type Target = 'text' | 'project';

interface Option {
  value: string;
  label: string;
}

const optionClass =
  'flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-sm outline-none hover:bg-bg focus-visible:ring-2 focus-visible:ring-accent data-[state=on]:bg-bg data-[state=on]:font-medium data-[state=on]:text-accent-text pointer-fine:min-h-8';

function matches(label: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === '' || label.toLowerCase().includes(q);
}

/** The text's own font, or the project font marker when it has none. */
function textFont(editor: Editor): string {
  return cleanFontValue(editor.getAttributes('textStyle').font) ?? PROJECT_FONT;
}

export function FontPanel({ editor }: { editor: Editor }) {
  const manuscript = useManuscript();
  const projectFont = manuscript?.font ?? DEFAULT_FONT;
  const emptySelection = editor.state.selection.empty;
  // With no selected text, a choice most likely means the whole project.
  const [target, setTarget] = useState<Target>(manuscript && emptySelection ? 'project' : 'text');
  const [textValue, setTextValue] = useState(() => textFont(editor));
  const value = target === 'project' ? projectFont : textValue;
  const [query, setQuery] = useState('');
  const [looking, setLooking] = useState<string | null>(null);
  const [recent, setRecent] = useState(recentOwnFonts);
  const [device, setDevice] = useState<string[] | null>(null);
  const [message, setMessage] = useState('');
  const [typed, setTyped] = useState('');
  const [unknownName, setUnknownName] = useState<string | null>(null);
  const searchId = useId();
  const typedId = useId();

  const choose = (next: string) => {
    const name = localFontName(next);
    if (target === 'project') {
      if (next === PROJECT_FONT) return;
      manuscript?.setFont(next);
    } else {
      const chain = editor.chain();
      const done = next === PROJECT_FONT ? chain.unsetFont().run() : chain.setFont(next).run();
      if (!done) return;
      setTextValue(next);
    }
    if (name !== null) setRecent(rememberOwnFont(name));
    const label = next === PROJECT_FONT ? 'the project font' : fontLabel(next);
    setMessage(target === 'project' ? `The whole project now uses ${label}.` : `The text now uses ${label}.`);
  };

  const applyTyped = (force: boolean) => {
    const typedFont = localFont(typed);
    const name = typedFont === null ? null : localFontName(typedFont);
    if (typedFont === null || name === null) {
      setMessage('Type the name of a font on this device, such as Georgia.');
      return;
    }
    if (!force && fontSeemsInstalled(name) === false) {
      setUnknownName(name);
      setMessage('');
      return;
    }
    setUnknownName(null);
    setTyped('');
    choose(typedFont);
  };

  const showDeviceFonts = async () => {
    setMessage('Waiting for the browser to list the fonts on this device.');
    const result = await listInstalledFonts();
    if ('fonts' in result) {
      setDevice(result.fonts);
      setMessage(`${String(result.fonts.length)} fonts found on this device.`);
    } else {
      setMessage('The browser did not list the fonts. Type a font name below instead.');
    }
  };

  const groups = useMemo(() => {
    const vlo = FONT_GROUPS.map((group) => ({
      label: group,
      options: VLO_FONTS.filter((f) => f.group === group && matches(f.label, query)).map((f) => ({
        value: f.id,
        label: f.label,
      })),
    }));
    const own = new Set(recent.map((n) => n.toLowerCase()));
    const current = localFontName(value);
    const ownNames = [...(current !== null && !own.has(current.toLowerCase()) ? [current] : []), ...recent];
    const yours: Option[] = ownNames
      .filter((n) => matches(n, query))
      .map((n) => ({ value: `local:${n}`, label: n }));
    const installed: Option[] = (device ?? [])
      .filter((n) => !own.has(n.toLowerCase()) && n !== current && matches(n, query))
      .slice(0, MAX_DEVICE_FONTS)
      .map((n) => ({ value: `local:${n}`, label: n }));
    return [
      ...vlo,
      { label: 'Your fonts', options: yours },
      { label: 'On this device', options: installed },
    ].filter((g) => g.options.length > 0);
  }, [query, recent, device, value]);

  const shown = looking ?? value;
  const previewFont = shown === PROJECT_FONT ? projectFont : shown;
  const previewStack = fontStack(previewFont, BASE_STACK);
  const vlo = vloFont(previewFont);
  const noMatch = groups.length === 0;

  return (
    <div className="grid gap-3">
      <h2 className="text-sm font-medium">Font</h2>

      {manuscript && (
        <ToggleGroup.Root
          type="single"
          aria-label="Change the font for"
          value={target}
          onValueChange={(next) => {
            if (next === 'text' || next === 'project') setTarget(next);
          }}
          className="grid grid-cols-2 gap-1 rounded-md bg-bg p-1"
        >
          {(
            [
              ['text', emptySelection ? 'New text' : 'Selected text'],
              ['project', 'Whole project'],
            ] as const
          ).map(([id, label]) => (
            <ToggleGroup.Item
              key={id}
              value={id}
              className="min-h-11 rounded-sm px-2 text-sm text-muted outline-none focus-visible:ring-2 focus-visible:ring-accent data-[state=on]:bg-surface data-[state=on]:text-text data-[state=on]:shadow-sm pointer-fine:min-h-8"
            >
              {label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      )}

      <div className="relative">
        <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <label htmlFor={searchId} className="sr-only">
          Find a font
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          autoComplete="off"
          spellCheck={false}
          placeholder="Find a font"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="min-h-11 w-full rounded-md border border-rule bg-bg pr-3 pl-9 text-base text-text placeholder:text-muted focus-visible:border-accent pointer-fine:min-h-9 pointer-fine:text-sm"
        />
      </div>

      <ToggleGroup.Root
        type="single"
        orientation="vertical"
        aria-label="Fonts"
        value={value}
        onValueChange={(next) => {
          // A press on the chosen font keeps it chosen.
          choose(next || value);
        }}
        className="-mx-1 grid max-h-64 gap-0.5 overflow-y-auto px-1"
        onPointerLeave={() => {
          setLooking(null);
        }}
        onBlur={() => {
          setLooking(null);
        }}
      >
        {target === 'text' && matches('Project font', query) && (
          <FontOption
            option={{ value: PROJECT_FONT, label: 'Project font' }}
            detail={fontLabel(projectFont)}
            onLook={setLooking}
          />
        )}
        {groups.map((group) => (
          <div key={group.label} role="presentation" className="grid gap-0.5">
            <h3 className="px-3 pt-2 pb-0.5 text-xs text-muted">{group.label}</h3>
            {group.options.map((option) => (
              <FontOption
                key={option.value}
                option={option}
                detail={target === 'project' && option.value === DEFAULT_FONT ? 'Vlo default' : null}
                onLook={setLooking}
              />
            ))}
          </div>
        ))}
      </ToggleGroup.Root>
      {noMatch && (
        <p className="text-sm text-muted">
          No font has that name. Type it below to use a font on this device.
        </p>
      )}

      <figure className="grid gap-1 rounded-md border border-rule bg-bg px-3 py-2">
        <figcaption className="text-xs text-muted">
          Preview: {shown === PROJECT_FONT ? `Project font, ${fontLabel(projectFont)}` : fontLabel(shown)}
        </figcaption>
        <p className="text-xl leading-snug text-text" style={{ fontFamily: previewStack }}>
          The rain kept time on the glass while she wrote.
        </p>
        <p className="text-base leading-snug text-text italic" style={{ fontFamily: previewStack }}>
          And the words came easily, 1234567890.
        </p>
        {vlo && !vlo.italic && (
          <p className="text-xs text-muted">
            This font has no italic, so the browser slants its upright letters.
          </p>
        )}
      </figure>

      <div className="grid gap-2 border-t border-rule pt-3">
        <h3 className="text-xs text-muted">Your own fonts</h3>
        {canListFonts() && device === null && (
          <Button
            variant="outline"
            className="justify-start pointer-fine:min-h-9"
            onClick={() => {
              void showDeviceFonts();
            }}
          >
            <HardDrive aria-hidden="true" className="size-4" />
            Show fonts on this device
          </Button>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            applyTyped(false);
          }}
        >
          <label htmlFor={typedId} className="sr-only">
            Type a font name
          </label>
          <input
            id={typedId}
            value={typed}
            autoComplete="off"
            spellCheck={false}
            placeholder="Type a font name"
            maxLength={100}
            onChange={(event) => {
              setTyped(event.target.value);
              setUnknownName(null);
            }}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-rule bg-bg px-3 text-base text-text placeholder:text-muted focus-visible:border-accent pointer-fine:min-h-9 pointer-fine:text-sm"
          />
          <Button type="submit" variant="outline" className="pointer-fine:min-h-9">
            Use
          </Button>
        </form>
        {unknownName !== null && (
          <div role="alert" className="grid gap-2 rounded-md border border-accent bg-bg px-3 py-2 text-sm">
            <p>
              Vlo cannot find a font named “{unknownName}” on this device. Check the name, or install the font
              first. Until then, this text shows in the project font.
            </p>
            <Button
              variant="ghost"
              className="justify-self-start px-2 pointer-fine:min-h-8"
              onClick={() => {
                applyTyped(true);
              }}
            >
              Use the name anyway
            </Button>
          </div>
        )}
        <p className="text-xs text-muted">
          Your own fonts show only on devices that have them. Exports warn you before they swap a font.
        </p>
      </div>

      <p role="status" className={cn(message ? 'text-sm text-muted' : 'sr-only')}>
        {message}
      </p>
    </div>
  );
}

function FontOption({
  option,
  detail,
  onLook,
}: {
  option: Option;
  detail: string | null;
  onLook: (value: FontValue) => void;
}) {
  return (
    <ToggleGroup.Item
      value={option.value}
      className={optionClass}
      onPointerEnter={() => {
        onLook(option.value);
      }}
      onFocus={() => {
        onLook(option.value);
      }}
    >
      <span className="truncate">{option.label}</span>
      {detail && <span className="shrink-0 text-xs text-muted">{detail}</span>}
    </ToggleGroup.Item>
  );
}
