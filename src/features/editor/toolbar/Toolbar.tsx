import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  ChevronDown,
  Ellipsis,
  Eye,
  FilePenLine,
  KeyboardOff,
  PenLine,
  Plus,
  ScanSearch,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { Toolbar as ToolbarPrimitive } from 'radix-ui';
import { Fragment, lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/ui/cn';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { focusText, getPanelRequest, runCommand, type PanelAnchor } from '../commands/editorBus';
import type { Template } from '@/lib/db';
import { command, commandsFor, keysOf, type EditorCommand, type EditorForm } from '../commands/registry';
import { MAX_HANGING_EM } from '../extensions/poem';
import { modeOf, setMode, useTracking, type EditMode } from '../trackingStore';
import { setWritingPrefs, useWritingPrefs } from '../writingPrefs';
import { useWriterTools } from '../writerTools';
import {
  LAYOUTS,
  MENU_IDS,
  MENU_LABELS,
  pinnableTools,
  pinnedSegments,
  withOwnTools,
  type MenuId,
  type Section,
  type Segment,
} from './toolbarLayout';
import { KeyHint, ToolButton, toolClass } from './ToolButton';
import { NO_STATE, useCommandState, type CommandState } from './useCommandState';

/*
 * The slim bar above the page (Phase 19, Task A1). Arrow keys move inside it, so it is one Tab stop.
 *
 * From 640 px at the Full tool level, the daily tools are buttons and every other tool is in one of three
 * menus with the names that writers use: Insert, Format and Review. The Mode menu switches between
 * Editing, Suggesting and Viewing, as in Google Docs. Under 640 px, and at every width at the Simple tool
 * level (F36), the bar keeps a few buttons and the More menu holds every other tool in the same groups.
 * Focus mode hides the bar (data-chrome).
 */

const MODES: readonly { value: EditMode; label: string; icon: LucideIcon; hint: string }[] = [
  { value: 'editing', label: 'Editing', icon: PenLine, hint: 'Change the text directly' },
  { value: 'suggesting', label: 'Suggesting', icon: FilePenLine, hint: 'Each change waits for Accept' },
  { value: 'viewing', label: 'Viewing', icon: Eye, hint: 'Read the text with no changes' },
];

const CustomizeToolbar = lazy(async () => ({
  default: (await import('./CustomizeToolbar')).CustomizeToolbar,
}));

/** Phones show no separators: the phone tools then fit one row at 360 px. */
function Separator({ className }: { className?: string }) {
  return (
    <ToolbarPrimitive.Separator className={cn('mx-0.5 h-6 w-px shrink-0 bg-rule max-sm:hidden', className)} />
  );
}

/** The formatting toolbar. */
export function Toolbar({
  editor,
  kind,
  templates,
}: {
  editor: Editor;
  kind: EditorForm;
  templates?: readonly Template[] | undefined;
}) {
  const layout = LAYOUTS[kind];
  const simple = useWritingPrefs().toolLevel === 'simple';
  const tracking = useTracking();
  const mode = modeOf(tracking);
  const menus = useMemo(
    () =>
      withOwnTools(
        layout.menus,
        commandsFor(kind, templates).filter((c) => c.templates !== undefined),
      ),
    [layout, kind, templates],
  );
  const own = useWriterTools();
  const pinnable = useMemo(() => pinnableTools(kind, menus), [kind, menus]);
  const all = useMemo(
    () => [...pinnable, ...(kind === 'poem' ? ['hang-less', 'hang-more'] : [])].map(command),
    [pinnable, kind],
  );
  const shown = useMemo(
    () => (own.toolbar ? pinnedSegments(own.toolbar, new Set(pinnable)) : layout.segments),
    [own.toolbar, pinnable, layout],
  );
  const [customizing, setCustomizing] = useState(false);
  const state = useCommandState(editor, all);
  const at = (id: string) => state[id] ?? NO_STATE;
  // A tool chosen from a menu runs after the menu has closed and given focus back.
  const pending = useRef<EditorCommand | 'customize' | null>(null);

  const run = (cmd: EditorCommand, anchor: PanelAnchor) => {
    runCommand(editor, cmd, anchor);
  };
  const closeMenu = (event: Event, anchor: HTMLElement | null) => {
    const next = pending.current;
    pending.current = null;
    event.preventDefault();
    if (next === 'customize') {
      // The dialog gives focus back to the menu button when it closes.
      anchor?.focus();
      setCustomizing(true);
    } else if (next) run(next, anchor ?? 'caret');
    // A menu closed with no choice gives focus back to the text, unless a panel is open.
    else if (getPanelRequest()?.editor !== editor) focusText(editor);
  };

  // Said only after a hanging indent press. A caret move changes the readout but says nothing.
  const [hangMessage, setHangMessage] = useState('');
  const hanging = useHanging(editor, kind);
  const runHang = (cmd: EditorCommand) => {
    if (runCommand(editor, cmd)) {
      const next = cmd.id === 'hang-more' ? hanging + 1 : hanging - 1;
      setHangMessage(`Hanging indent ${String(Math.min(Math.max(next, 0), MAX_HANGING_EM))} em.`);
    }
  };

  const blockLabel =
    layout.blockMenu.map(command).find((c) => at(c.id).active)?.label ?? command('paragraph').label;
  const wideTools = shown.filter((s) => s.wide).flatMap((s) => s.tools);
  const segments = simple ? shown.filter((s) => !s.wide) : shown;

  const menuItem = (id: string) => {
    const cmd = command(id);
    const s = at(id);
    const Icon = cmd.icon;
    const body = (
      <>
        <Icon aria-hidden="true" className="size-4 text-muted" />
        <span className="flex-1">{cmd.kind === 'panel' ? `${cmd.label}…` : cmd.label}</span>
        <KeyHint keys={keysOf(cmd, own.keys)} />
      </>
    );
    // Every tool waits until the menu has closed and given focus back. A tool that opens a panel, such as
    // Equation, would otherwise lose that panel when the closing menu takes focus.
    const select = () => {
      pending.current = cmd;
    };
    // Toggles show a check, so the menu says which formats are on.
    return cmd.isActive && cmd.kind === 'run' ? (
      <DropdownMenuCheckboxItem key={id} checked={s.active} disabled={!s.enabled} onSelect={select}>
        {body}
      </DropdownMenuCheckboxItem>
    ) : (
      <DropdownMenuItem key={id} disabled={!s.enabled} onSelect={select} className="pl-9">
        {body}
      </DropdownMenuItem>
    );
  };

  const sections = (list: readonly Section[]) =>
    list.map((section, i) => (
      <Fragment key={section.label}>
        {i > 0 && <DropdownMenuSeparator />}
        <DropdownMenuGroup aria-label={section.label}>
          <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
          {section.tools.map((id) => menuItem(id))}
        </DropdownMenuGroup>
      </Fragment>
    ));

  const modeChoices =
    tracking.projectId === null ? null : (
      <DropdownMenuRadioGroup
        value={mode}
        onValueChange={(value) => {
          void setMode(value as EditMode).catch(() => undefined);
        }}
      >
        {MODES.map((m) => (
          <DropdownMenuRadioItem key={m.value} value={m.value}>
            <m.icon aria-hidden="true" className="size-4 text-muted" />
            <span className="grid flex-1">
              <span>{m.label}</span>
              <span className="text-xs text-muted">{m.hint}</span>
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    );
  const ModeIcon = MODES.find((m) => m.value === mode)?.icon ?? PenLine;
  const modeLabel = MODES.find((m) => m.value === mode)?.label ?? 'Editing';

  const customizeItem = (
    <DropdownMenuItem
      className="pl-9"
      onSelect={() => {
        pending.current = 'customize';
      }}
    >
      Customize toolbar…
    </DropdownMenuItem>
  );

  const levelSwitch = (
    <DropdownMenuItem
      className="pl-9"
      onSelect={() => {
        setWritingPrefs({ toolLevel: simple ? 'full' : 'simple' });
      }}
    >
      {simple ? 'Show all tools' : 'Show fewer tools'}
    </DropdownMenuItem>
  );

  return (
    <>
      <ToolbarPrimitive.Root
        aria-label="Formatting"
        data-chrome=""
        data-vlo-toolbar=""
        className="@container flex flex-wrap items-center gap-0.5 border-b border-rule bg-bg px-1 py-1"
      >
        {segments[0] && <SegmentButtons segment={segments[0]} at={at} onRun={run} />}

        {layout.blockMenu.length > 0 && (
          <>
            <Separator />
            <ToolMenu
              trigger={
                <>
                  <span className="max-w-24 truncate">{blockLabel}</span>
                  <ChevronDown aria-hidden="true" className="size-3.5 text-muted" />
                </>
              }
              label={`Text style: ${blockLabel}`}
              title="Text style"
              triggerClass="w-auto gap-1 px-2 text-sm text-text pointer-fine:w-auto"
              onClose={(event) => {
                closeMenu(event, null);
              }}
              editor={editor}
            >
              {layout.blockMenu.map((id) => menuItem(id))}
            </ToolMenu>
          </>
        )}

        {segments.slice(1).map((segment) => (
          <Fragment key={segment.tools.join()}>
            <Separator className={cn(segment.wide && 'max-sm:hidden')} />
            <SegmentButtons segment={segment} at={at} onRun={run} />
          </Fragment>
        ))}

        {kind === 'poem' && (
          <>
            <Separator />
            <ToolButton
              cmd={command('hang-less')}
              state={at('hang-less')}
              onRun={(cmd) => {
                runHang(cmd);
              }}
            />
            <span className="min-w-16 text-center tabular-nums text-xs text-muted">Hang {hanging} em</span>
            <ToolButton
              cmd={command('hang-more')}
              state={at('hang-more')}
              onRun={(cmd) => {
                runHang(cmd);
              }}
            />
          </>
        )}

        {/* From 640 px at the Full level: the three named menus and the Mode menu. */}
        {!simple && (
          <>
            <Separator />
            {MENU_IDS.map((id) => (
              <ToolMenu
                key={id}
                trigger={
                  <>
                    <span className="@max-[40rem]:sr-only">{MENU_LABELS[id]}</span>
                    <MenuIcon id={id} />
                    <ChevronDown aria-hidden="true" className="size-3.5 text-muted" />
                  </>
                }
                label={MENU_LABELS[id]}
                triggerClass="w-auto gap-0.5 px-1.5 text-sm text-text max-sm:hidden pointer-fine:w-auto"
                contentClass="max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-64 overflow-y-auto"
                onClose={closeMenu}
                editor={editor}
              >
                {sections(menus[id])}
                <DropdownMenuSeparator />
                {id === 'review' && levelSwitch}
                {customizeItem}
              </ToolMenu>
            ))}
            {modeChoices && (
              <>
                <Separator />
                <ToolMenu
                  trigger={
                    <>
                      <ModeIcon aria-hidden="true" className="size-4" />
                      <span className="@max-[44rem]:sr-only">{modeLabel}</span>
                      <ChevronDown aria-hidden="true" className="size-3.5 text-muted" />
                    </>
                  }
                  label={`Mode: ${modeLabel}`}
                  title="Mode"
                  align="end"
                  triggerClass={cn(
                    'ml-auto w-auto gap-0.5 px-1.5 text-sm max-sm:hidden pointer-fine:w-auto',
                    mode === 'editing' ? 'text-text' : 'text-accent-text',
                  )}
                  contentClass="min-w-64"
                  onClose={(event) => {
                    closeMenu(event, null);
                  }}
                  editor={editor}
                >
                  {modeChoices}
                </ToolMenu>
              </>
            )}
          </>
        )}

        {/* Under 640 px, and at the Simple level: one More menu with the same groups. */}
        <Separator className={cn(!simple && 'sm:hidden')} />
        <ToolMenu
          trigger={<Ellipsis aria-hidden="true" className="size-4" />}
          label="More tools"
          title="More tools"
          align="end"
          triggerClass={cn(!simple && 'sm:hidden')}
          contentClass="max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-64 overflow-y-auto"
          onClose={closeMenu}
          editor={editor}
        >
          {wideTools.length > 0 && (
            <>
              <DropdownMenuGroup aria-label="Quick tools">
                {wideTools.map((id) => menuItem(id))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          {MENU_IDS.map((id) => (
            <Fragment key={id}>
              <DropdownMenuLabel className="pt-3 text-sm text-text">{MENU_LABELS[id]}</DropdownMenuLabel>
              {sections(menus[id])}
              <DropdownMenuSeparator />
            </Fragment>
          ))}
          {modeChoices && (
            <>
              <DropdownMenuLabel className="pt-3 text-sm text-text">Mode</DropdownMenuLabel>
              {modeChoices}
              <DropdownMenuSeparator />
            </>
          )}
          {levelSwitch}
          {customizeItem}
        </ToolMenu>
        {/* Only while a phone keyboard is open (phoneTyping.ts): the bar sits on the keyboard. */}
        <ToolbarPrimitive.Button
          type="button"
          aria-label="Hide keyboard"
          title="Hide keyboard"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            editor.commands.blur();
          }}
          className={cn(toolClass, 'hidden [html[data-vlo-typing]_&]:inline-flex')}
        >
          <KeyboardOff aria-hidden="true" className="size-4" />
        </ToolbarPrimitive.Button>
      </ToolbarPrimitive.Root>
      {customizing && (
        <Suspense fallback={null}>
          <CustomizeToolbar open onOpenChange={setCustomizing} tools={pinnable} />
        </Suspense>
      )}
      {kind === 'poem' && (
        <p role="status" className="sr-only">
          {hangMessage}
        </p>
      )}
    </>
  );
}

/** The small icon after a menu name, shown only when the name hides in a narrow column. */
const MENU_ICONS: Readonly<Record<MenuId, LucideIcon>> = { insert: Plus, format: Type, review: ScanSearch };

function MenuIcon({ id }: { id: MenuId }) {
  const Icon = MENU_ICONS[id];
  return <Icon aria-hidden="true" className="hidden size-4 @max-[40rem]:block" />;
}

/** A toolbar button that opens a menu. Pressing it keeps the editor's selection. */
function ToolMenu({
  trigger,
  label,
  title,
  triggerClass,
  contentClass,
  align = 'start',
  onClose,
  editor,
  children,
}: {
  trigger: ReactNode;
  label: string;
  title?: string;
  triggerClass?: string;
  contentClass?: string;
  align?: 'start' | 'end';
  onClose: (event: Event, trigger: HTMLButtonElement | null) => void;
  editor: Editor;
  children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu modal={false}>
      <ToolbarPrimitive.Button asChild>
        <DropdownMenuTrigger
          ref={ref}
          aria-label={label}
          title={title ?? label}
          onMouseDown={(event) => {
            // Radix opens the menu on pointer down; keep the editor selection.
            if (event.button === 0) event.preventDefault();
          }}
          className={cn(toolClass, triggerClass)}
        >
          {trigger}
        </DropdownMenuTrigger>
      </ToolbarPrimitive.Button>
      <DropdownMenuContent
        align={align}
        className={contentClass}
        onCloseAutoFocus={(event) => {
          onClose(event, ref.current);
        }}
        onEscapeKeyDown={() => {
          focusText(editor);
        }}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SegmentButtons({
  segment,
  at,
  onRun,
}: {
  segment: Segment;
  at: (id: string) => CommandState;
  onRun: (cmd: EditorCommand, button: HTMLButtonElement) => void;
}) {
  return (
    <>
      {segment.tools.map((id) => (
        <ToolButton
          key={id}
          cmd={command(id)}
          state={at(id)}
          onRun={onRun}
          className={cn(segment.wide && 'max-sm:hidden')}
        />
      ))}
    </>
  );
}

/** The hanging indent of the line at the cursor, for the readout. */
function useHanging(editor: Editor, kind: EditorForm): number {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => (kind === 'poem' ? Number(e.getAttributes('poemLine').hanging) || 0 : 0),
  });
}
