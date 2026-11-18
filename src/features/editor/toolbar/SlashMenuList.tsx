import type { Editor } from '@tiptap/core';
import { runCommand } from '../commands/editorBus';
import { GROUP_LABELS, keysOf } from '../commands/registry';
import { slashKey } from '../extensions/slashMenu';
import { MenuList } from './MenuList';
import { KeyHint } from './ToolButton';

/** The list the / menu shows. The editor keeps focus; the extension handles the keys. */
export function SlashMenuList({ editor, listId }: { editor: Editor; listId: string }) {
  return (
    <MenuList
      editor={editor}
      listId={listId}
      menuKey={slashKey}
      label="Tools"
      empty="No tools match. Press Escape to keep the slash."
      itemKey={(cmd) => cmd.id}
      onChoose={(cmd) => {
        runCommand(editor, cmd, 'caret');
      }}
      before={(cmd, i, menu) =>
        menu.query === '' &&
        (i === 0 || menu.matches[i - 1]?.group !== cmd.group) && (
          <div aria-hidden="true" className="px-3 pt-2 pb-1 text-xs font-medium text-muted">
            {GROUP_LABELS[cmd.group]}
          </div>
        )
      }
      option={(cmd) => {
        const Icon = cmd.icon;
        return (
          <>
            {cmd.glyph ? (
              <span
                aria-hidden="true"
                className="w-4 shrink-0 text-center font-manuscript text-base text-muted"
              >
                {cmd.glyph}
              </span>
            ) : (
              <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" />
            )}
            <span className="flex-1">{cmd.label}</span>
            <KeyHint keys={keysOf(cmd)} />
          </>
        );
      }}
    />
  );
}
