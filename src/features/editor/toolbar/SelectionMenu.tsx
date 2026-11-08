import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { BubbleMenu } from '@tiptap/react/menus';
import { Toolbar as ToolbarPrimitive } from 'radix-ui';
import { Fragment, useMemo } from 'react';
import { useMediaQuery } from '@/app/useMediaQuery';
import { focusText, runCommand } from '../commands/editorBus';
import type { Template } from '@/lib/db';
import { commandsFor, type EditorForm } from '../commands/registry';
import { ToolButton } from './ToolButton';
import { NO_STATE, useCommandState } from './useCommandState';

type ShouldShow = NonNullable<Parameters<typeof BubbleMenu>[0]['shouldShow']>;

/** Shows over selected text only, never over a selected scene break or an empty selection. */
const shouldShow: ShouldShow = ({ editor, view, state, from, to, element }) => {
  if (!editor.isEditable || !(state.selection instanceof TextSelection) || state.selection.empty)
    return false;
  if (state.doc.textBetween(from, to, ' ').trim() === '') return false;
  return view.hasFocus() || element.contains(document.activeElement);
};

/** The menu over selected text, with the most used inline tools. Alt-F10 moves focus into it. */
export function SelectionMenu({
  editor,
  form,
  templates,
}: {
  editor: Editor;
  form: EditorForm;
  templates?: readonly Template[] | undefined;
}) {
  const commands = useMemo(() => commandsFor(form, templates).filter((c) => c.selection), [form, templates]);
  const state = useCommandState(editor, commands);
  // Phones show their own copy and paste bar above a selection, so Vlo's menu goes below it there.
  const touch = useMediaQuery('(pointer: coarse), (max-width: 639px)');
  const options = useMemo(
    () => ({
      placement: touch ? ('bottom' as const) : ('top' as const),
      offset: 8,
      // The text area is the boundary, so the menu flips below a first line instead of covering the toolbar.
      flip: { boundary: editor.view.dom, padding: 4 },
      shift: { padding: 8 },
    }),
    [touch, editor],
  );

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="vloSelectionMenu"
      shouldShow={shouldShow}
      options={options}
      data-vlo-selection-menu=""
      className="z-30"
    >
      <ToolbarPrimitive.Root
        aria-label="Selection formatting"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            focusText(editor);
          }
        }}
        // On a phone the tools wrap to a second row, so each one shows without a sideways scroll.
        className="flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-0.5 rounded-[var(--radius-card)] border border-rule bg-surface p-1 shadow-lg"
      >
        {commands.map((cmd, i) => (
          <Fragment key={cmd.id}>
            {i > 0 && commands[i - 1]?.group !== cmd.group && (
              <ToolbarPrimitive.Separator className="mx-0.5 h-6 w-px shrink-0 bg-rule max-sm:hidden" />
            )}
            <ToolButton
              cmd={cmd}
              state={state[cmd.id] ?? NO_STATE}
              onRun={(c) => {
                // The menu hides when focus leaves the text, so panels open at the selection.
                runCommand(editor, c, 'caret');
              }}
            />
          </Fragment>
        ))}
      </ToolbarPrimitive.Root>
    </BubbleMenu>
  );
}
