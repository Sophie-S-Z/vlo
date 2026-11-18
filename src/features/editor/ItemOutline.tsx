import type { Editor } from '@tiptap/core';
import { ListTree } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { formatWords } from '@/features/library/format';
import { countUnit } from '@/lib/wordcount';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { ICON_BUTTON } from '@/ui/tip';
import { activeEntry, goToBlock, outlineOf, type OutlineEntry } from './itemOutline';
import { setWritingPrefs, useWritingPrefs } from './writingPrefs';

/*
 * The item outline (Phase 19, Task B1). Where the window has room left of the page, the outline stays in
 * that margin, and the button turns it on and off. In a narrow window, the button opens it in a popover.
 */

/** The outline builds again after this pause in typing. */
const REBUILD_MS = 400;
/** The free margin left of the page that the rail needs: its 13rem, and a 2.5rem gap for the block handle. */
const RAIL_ROOM = 264;

/** The outline of the editor's document while `enabled`, and the index of the entry at the caret. */
function useItemOutline(editor: Editor | null, language: string | undefined, enabled: boolean) {
  const [entries, setEntries] = useState<readonly OutlineEntry[]>([]);
  const [head, setHead] = useState(0);
  useEffect(() => {
    if (!editor || !enabled) return;
    let timer: number | undefined;
    const build = () => {
      if (!editor.isDestroyed) setEntries(outlineOf(editor.state.doc, language));
    };
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(build, REBUILD_MS);
    };
    const track = () => {
      setHead(editor.state.selection.head);
    };
    build();
    track();
    editor.on('update', later);
    editor.on('selectionUpdate', track);
    return () => {
      window.clearTimeout(timer);
      editor.off('update', later);
      editor.off('selectionUpdate', track);
    };
  }, [editor, language, enabled]);
  return { entries, active: activeEntry(entries, head) };
}

/** True when the margin left of `page`, inside `stage`, has room for the rail. */
export function useRailRoom(
  stage: RefObject<HTMLElement | null>,
  page: RefObject<HTMLElement | null>,
  enabled: boolean,
): boolean {
  const [room, setRoom] = useState(false);
  useEffect(() => {
    const outer = stage.current;
    const inner = page.current;
    if (!enabled || !outer || !inner || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(() => {
      setRoom((outer.clientWidth - inner.offsetWidth) / 2 >= RAIL_ROOM);
    });
    observer.observe(outer);
    observer.observe(inner);
    return () => {
      observer.disconnect();
    };
  }, [stage, page, enabled]);
  return enabled && room;
}

interface OutlineProps {
  editor: Editor | null;
  language: string | undefined;
}

function OutlineList({
  entries,
  active,
  language,
  onChoose,
}: {
  entries: readonly OutlineEntry[];
  active: number;
  language: string | undefined;
  onChoose: (entry: OutlineEntry) => void;
}) {
  if (entries.length === 0)
    return <p className="px-2 text-sm text-muted">Headings and scene breaks show here.</p>;
  const unit = countUnit(language);
  return (
    <ol className="grid gap-0.5">
      {entries.map((entry, index) => (
        <li key={entry.pos}>
          <button
            type="button"
            aria-current={index === active ? 'location' : undefined}
            onClick={() => {
              onChoose(entry);
            }}
            className={cn(
              'flex min-h-9 w-full items-baseline justify-between gap-3 rounded-md py-1.5 pr-2 text-left text-sm outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent',
              index === active ? 'font-medium text-text' : 'text-muted',
            )}
            style={{ paddingInlineStart: `${String(0.5 + (entry.depth - 1) * 0.875)}rem` }}
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">{entry.label}</span>
            <span className="shrink-0 text-xs tabular-nums">{formatWords(entry.words, unit)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** The outline in the margin left of the page. The page must be its positioned parent. */
export function OutlineRail({ editor, language }: OutlineProps) {
  const { entries, active } = useItemOutline(editor, language, true);
  return (
    <nav
      aria-label="Item outline"
      data-typing-hide
      className="absolute top-0 right-full bottom-0 mr-10 w-52 print:hidden"
    >
      <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[var(--radius-card)] bg-bg p-1">
        <h2 className="px-2 pt-1 pb-2 text-xs font-medium text-muted">Outline</h2>
        <OutlineList
          entries={entries}
          active={active}
          language={language}
          onChoose={(entry) => {
            if (editor) goToBlock(editor, entry.pos);
          }}
        />
      </div>
    </nav>
  );
}

/** The Outline button on the item row. With `room`, it turns the rail on and off; without, it opens a popover. */
export function OutlineControl({ editor, language, room }: OutlineProps & { room: boolean }) {
  const { outline } = useWritingPrefs();
  const [open, setOpen] = useState(false);
  // After a go-to, the caret keeps the focus, and the closing popover gives none back to the button.
  const chose = useRef(false);
  const { entries, active } = useItemOutline(editor, language, open && !room);
  const button = (
    <Button
      variant="ghost"
      className={ICON_BUTTON}
      aria-label="Outline"
      data-tool="outline"
      data-tip="Outline"
      disabled={!editor}
      {...(room
        ? {
            'aria-pressed': outline,
            onClick: () => {
              setWritingPrefs({ outline: !outline });
            },
          }
        : {})}
    >
      <ListTree aria-hidden="true" className="size-4" />
    </Button>
  );
  if (room) return button;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Outline"
        className="p-1"
        onCloseAutoFocus={(event) => {
          if (!chose.current) return;
          chose.current = false;
          event.preventDefault();
        }}
      >
        <h2 className="px-2 pt-1 pb-2 text-xs font-medium text-muted">Outline</h2>
        <OutlineList
          entries={entries}
          active={active}
          language={language}
          onChoose={(entry) => {
            chose.current = true;
            setOpen(false);
            if (editor) goToBlock(editor, entry.pos);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
