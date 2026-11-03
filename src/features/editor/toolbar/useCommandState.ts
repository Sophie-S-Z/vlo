import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import type { EditorCommand } from '../commands/registry';

export interface CommandState {
  active: boolean;
  enabled: boolean;
}

/**
 * The pressed and enabled state of each command, read after each transaction. The result changes only
 * when a state changes, so typing does not re-render a tool surface.
 */
export function useCommandState(
  editor: Editor,
  commands: readonly EditorCommand[],
): Readonly<Record<string, CommandState>> {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const out: Record<string, CommandState> = {};
      for (const cmd of commands) {
        out[cmd.id] = {
          active: cmd.isActive?.(e) ?? false,
          enabled: e.isEditable && (cmd.isEnabled?.(e) ?? true),
        };
      }
      return out;
    },
  });
}

export const NO_STATE: CommandState = { active: false, enabled: true };
