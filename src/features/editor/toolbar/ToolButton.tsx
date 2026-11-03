import { Toolbar as ToolbarPrimitive } from 'radix-ui';
import { forwardRef, type ComponentProps, type MouseEvent } from 'react';
import { cn } from '@/ui/cn';
import { ariaShortcut, shortcutLabel } from '../commands/keys';
import type { EditorCommand } from '../commands/registry';
import type { CommandState } from './useCommandState';

/** 44 px targets on touch screens, 36 px with a mouse, so the bar fits a 65-character column. */
export const toolClass =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted outline-none hover:bg-bg hover:text-text focus-visible:ring-2 focus-visible:ring-accent aria-pressed:bg-bg aria-pressed:text-accent-text disabled:pointer-events-none disabled:opacity-40 pointer-fine:size-9';

/** The tooltip text: the name, then the shortcut, such as "Bold (Ctrl+B)". */
export function toolTitle(cmd: EditorCommand): string {
  return cmd.keys ? `${cmd.label} (${shortcutLabel(cmd.keys)})` : cmd.label;
}

/** Only toggles say pressed or not pressed. Actions such as Undo have no pressed state. */
function pressedOf(cmd: EditorCommand, state: CommandState): boolean | undefined {
  return cmd.isActive ? state.active : undefined;
}

interface ToolButtonProps extends Omit<ComponentProps<'button'>, 'onClick'> {
  cmd: EditorCommand;
  state: CommandState;
  onRun: (cmd: EditorCommand, button: HTMLButtonElement) => void;
  /** Inside a Radix toolbar, so arrow keys move between tools. */
  inToolbar?: boolean;
}

/** One tool, drawn from its registry entry. */
export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { cmd, state, onRun, inToolbar = true, className, ...rest },
  ref,
) {
  const Icon = cmd.icon;
  const props = {
    ...rest,
    ref,
    type: 'button' as const,
    'aria-label': cmd.label,
    'aria-pressed': pressedOf(cmd, state),
    'aria-keyshortcuts': cmd.keys ? ariaShortcut(cmd.keys) : undefined,
    'aria-haspopup': cmd.kind === 'panel' ? ('dialog' as const) : undefined,
    title: toolTitle(cmd),
    disabled: !state.enabled,
    className: cn(toolClass, className),
    // The editor keeps its selection and focus when a mouse presses a tool.
    onMouseDown: (event: MouseEvent) => {
      event.preventDefault();
    },
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      onRun(cmd, event.currentTarget);
    },
    children: <Icon aria-hidden="true" className="size-4" />,
  };
  return inToolbar ? <ToolbarPrimitive.Button {...props} /> : <button {...props} />;
});
