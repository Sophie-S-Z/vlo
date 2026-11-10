import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { ChevronDown, Ellipsis } from 'lucide-react';
import { Toolbar as ToolbarPrimitive } from 'radix-ui';
import { Fragment, useMemo, useRef, useState } from 'react';
import { cn } from '@/ui/cn';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { shortcutLabel } from '../commands/keys';
import { focusText, getPanelRequest, runCommand, type PanelAnchor } from '../commands/editorBus';
import type { Template } from '@/lib/db';
import { command, commandsFor, type EditorCommand, type EditorForm } from '../commands/registry';
import { MAX_HANGING_EM } from '../extensions/poem';
import { SCRIPT_ROLES } from '../scriptRoles';
import { setWritingPrefs, useWritingPrefs } from '../writingPrefs';
import { ToolButton, toolClass } from './ToolButton';
import { NO_STATE, useCommandState, type CommandState } from './useCommandState';

/*
 * The slim bar above the page. Arrow keys move inside it, so it is one Tab stop. Under 640 px, and at
 * every width at the Simple tool level (F36), the secondary tools move into the More menu. Focus mode
 * hides the bar (data-chrome).
 */

interface Segment {
  /** Tools shown as buttons. */
  tools: readonly string[];
  /** Under 640 px these buttons hide and show in the More menu instead. */
  wide?: boolean;
}

interface Layout {
  /** The block style menu (prose only). */
  blockMenu: readonly string[];
  /** The alignment menu (prose only). */
  alignMenu: readonly string[];
  segments: readonly Segment[];
  /** Always in the More menu. */
  more: readonly string[];
}

const LAYOUTS: Readonly<Record<EditorForm, Layout>> = {
  prose: {
    blockMenu: ['paragraph', 'heading-2', 'heading-3', 'quote', 'bullets', 'numbers'],
    alignMenu: ['align-left', 'align-center', 'align-right', 'align-justify'],
    segments: [
      { tools: ['undo', 'redo'] },
      { tools: ['bold', 'italic'] },
      { tools: ['underline', 'strike'], wide: true },
      { tools: ['font', 'color', 'highlight', 'gradient'], wide: true },
      { tools: ['characters', 'footnote'], wide: true },
    ],
    more: [
      'link',
      'comment',
      'track-changes',
      'superscript',
      'subscript',
      'size',
      'spacing',
      'first-line-indent',
      'drop-cap',
      'scene-break',
      'math',
      'math-block',
      'find',
      'replace',
      'read-aloud',
      'speak',
      'show-ai-text',
      'show-codex-names',
      'style-check',
      'clear',
      'shortcuts',
    ],
  },
  poem: {
    blockMenu: [],
    alignMenu: [],
    segments: [
      { tools: ['undo', 'redo'] },
      { tools: ['bold', 'italic'], wide: true },
      { tools: ['underline', 'strike'], wide: true },
      { tools: ['font', 'color', 'highlight', 'gradient'], wide: true },
      { tools: ['characters', 'footnote', 'math'], wide: true },
    ],
    more: [
      'comment',
      'track-changes',
      'superscript',
      'subscript',
      'size',
      'find',
      'replace',
      'read-aloud',
      'speak',
      'show-ai-text',
      'show-codex-names',
      'style-check',
      'clear',
      'shortcuts',
    ],
  },
  script: {
    blockMenu: SCRIPT_ROLES.map((role) => `role-${role}`),
    alignMenu: [],
    segments: [
      { tools: ['undo', 'redo'] },
      { tools: ['bold', 'italic'] },
      { tools: ['underline', 'characters'], wide: true },
    ],
    more: [
      'comment',
      'track-changes',
      'find',
      'replace',
      'read-aloud',
      'speak',
      'show-ai-text',
      'show-codex-names',
      'style-check',
      'clear',
      'shortcuts',
    ],
  },
};

/** Phones show no separators: the six phone tools then fit one row at 360 px. */
function Separator() {
  return <ToolbarPrimitive.Separator className="mx-0.5 h-6 w-px shrink-0 bg-rule max-sm:hidden" />;
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
  // The tools of this template only, such as the private-name tools of a memoir, end the More menu.
  const own = useMemo(
    () =>
      commandsFor(kind, templates)
        .filter((c) => c.templates !== undefined)
        .map((c) => c.id),
    [kind, templates],
  );
  const all = useMemo(() => {
    const ids = [
      ...layout.blockMenu,
      ...layout.alignMenu,
      ...layout.segments.flatMap((s) => s.tools),
      ...layout.more,
      ...own,
      ...(kind === 'poem' ? ['hang-less', 'hang-more'] : []),
    ];
    return ids.map(command);
  }, [layout, kind, own]);
  const state = useCommandState(editor, all);
  const at = (id: string) => state[id] ?? NO_STATE;
  const more = useRef<HTMLButtonElement>(null);
  // A tool chosen from a menu runs after the menu has closed and given focus back.
  const pending = useRef<EditorCommand | null>(null);

  const run = (cmd: EditorCommand, anchor: PanelAnchor) => {
    runCommand(editor, cmd, anchor);
  };
  const closeMenu = (event: Event, anchor: HTMLElement | null) => {
    const next = pending.current;
    pending.current = null;
    event.preventDefault();
    if (next) run(next, anchor ?? 'caret');
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
  const alignActive = layout.alignMenu.map(command).find((c) => at(c.id).active) ?? command('align-left');
  const AlignIcon = alignActive.icon;
  const narrowOnly = layout.segments.filter((s) => s.wide).flatMap((s) => s.tools);
  if (layout.alignMenu.length > 0) narrowOnly.push(...layout.alignMenu);
  const segments = simple ? layout.segments.filter((s) => !s.wide) : layout.segments;

  const menuItem = (id: string, narrow = false) => {
    const cmd = command(id);
    const s = at(id);
    const Icon = cmd.icon;
    const body = (
      <>
        <Icon aria-hidden="true" className="size-4 text-muted" />
        <span className="flex-1">{cmd.kind === 'panel' ? `${cmd.label}…` : cmd.label}</span>
        {cmd.keys && (
          <span aria-hidden="true" className="tabular-nums text-xs text-muted">
            {shortcutLabel(cmd.keys)}
          </span>
        )}
      </>
    );
    // Every tool waits until the menu has closed and given focus back. A tool that opens a panel, such as
    // Equation, would otherwise lose that panel when the closing menu takes focus.
    const select = () => {
      pending.current = cmd;
    };
    const className = cn(narrow && 'sm:hidden');
    // Toggles show a check, so the menu says which formats are on.
    return cmd.isActive && cmd.kind === 'run' ? (
      <DropdownMenuCheckboxItem
        key={id}
        checked={s.active}
        disabled={!s.enabled}
        onSelect={select}
        className={className}
      >
        {body}
      </DropdownMenuCheckboxItem>
    ) : (
      <DropdownMenuItem key={id} disabled={!s.enabled} onSelect={select} className={cn('pl-9', className)}>
        {body}
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <ToolbarPrimitive.Root
        aria-label="Formatting"
        data-chrome=""
        data-vlo-toolbar=""
        className="flex flex-wrap items-center gap-0.5 border-b border-rule bg-bg px-1 py-1"
      >
        {segments[0] && <SegmentButtons segment={segments[0]} at={at} onRun={run} />}

        {layout.blockMenu.length > 0 && (
          <>
            <Separator />
            <DropdownMenu modal={false}>
              <ToolbarPrimitive.Button asChild>
                <DropdownMenuTrigger
                  aria-label={`Text style: ${blockLabel}`}
                  title="Text style"
                  onMouseDown={(event) => {
                    // Radix opens the menu on pointer down; keep the editor selection.
                    if (event.button === 0) event.preventDefault();
                  }}
                  className={cn(toolClass, 'w-auto gap-1 px-2 text-sm text-text pointer-fine:w-auto')}
                >
                  <span className="max-w-24 truncate">{blockLabel}</span>
                  <ChevronDown aria-hidden="true" className="size-3.5 text-muted" />
                </DropdownMenuTrigger>
              </ToolbarPrimitive.Button>
              <DropdownMenuContent
                align="start"
                onCloseAutoFocus={(event) => {
                  closeMenu(event, null);
                }}
                onEscapeKeyDown={() => {
                  focusText(editor);
                }}
              >
                {layout.blockMenu.map((id) => menuItem(id))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        {segments.slice(1).map((segment) => (
          <Fragment key={segment.tools.join()}>
            <Separator />
            <SegmentButtons segment={segment} at={at} onRun={run} />
          </Fragment>
        ))}

        {layout.alignMenu.length > 0 && !simple && (
          <>
            <Separator />
            <DropdownMenu modal={false}>
              <ToolbarPrimitive.Button asChild>
                <DropdownMenuTrigger
                  aria-label={`Alignment: ${alignActive.label}`}
                  title="Alignment"
                  onMouseDown={(event) => {
                    if (event.button === 0) event.preventDefault();
                  }}
                  className={cn(toolClass, 'w-auto gap-0.5 px-1.5 max-sm:hidden pointer-fine:w-auto')}
                >
                  <AlignIcon aria-hidden="true" className="size-4" />
                  <ChevronDown aria-hidden="true" className="size-3 text-muted" />
                </DropdownMenuTrigger>
              </ToolbarPrimitive.Button>
              <DropdownMenuContent
                align="start"
                onCloseAutoFocus={(event) => {
                  closeMenu(event, null);
                }}
                onEscapeKeyDown={() => {
                  focusText(editor);
                }}
              >
                {layout.alignMenu.map((id) => menuItem(id))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

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

        <Separator />
        <DropdownMenu modal={false}>
          <ToolbarPrimitive.Button asChild>
            <DropdownMenuTrigger
              ref={more}
              aria-label="More tools"
              title="More tools"
              onMouseDown={(event) => {
                if (event.button === 0) event.preventDefault();
              }}
              className={toolClass}
            >
              <Ellipsis aria-hidden="true" className="size-4" />
            </DropdownMenuTrigger>
          </ToolbarPrimitive.Button>
          <DropdownMenuContent
            align="end"
            className="max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-60 overflow-y-auto"
            onCloseAutoFocus={(event) => {
              closeMenu(event, more.current);
            }}
            onEscapeKeyDown={() => {
              focusText(editor);
            }}
          >
            {narrowOnly.map((id) => menuItem(id, !simple))}
            {narrowOnly.length > 0 && <DropdownMenuSeparator className={cn(!simple && 'sm:hidden')} />}
            {layout.more.map((id) => menuItem(id))}
            {own.length > 0 && <DropdownMenuSeparator />}
            {own.map((id) => menuItem(id))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="pl-9"
              onSelect={() => {
                setWritingPrefs({ toolLevel: simple ? 'full' : 'simple' });
              }}
            >
              {simple ? 'Show all tools' : 'Show fewer tools'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarPrimitive.Root>
      {kind === 'poem' && (
        <p role="status" className="sr-only">
          {hangMessage}
        </p>
      )}
    </>
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
