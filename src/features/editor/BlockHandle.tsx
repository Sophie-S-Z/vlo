import type { Editor } from '@tiptap/core';
import DragHandle from '@tiptap/extension-drag-handle-react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import { Copy, GripVertical, MoveDown, MoveUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { runCommand } from './commands/editorBus';
import { COMMANDS } from './commands/registry';
import { IMAGE } from '@/features/images/attrs';

/*
 * The block handle (Phase 19, Task B3). It shows at the left of a prose block after the pointer moves, and
 * the drag handle extension hides it at each key. A drag moves the block. A click opens the block menu.
 * Phones have no handle: Alt-Shift-Up and Alt-Shift-Down move a block there with a keyboard.
 */

/** The "Turn into" tools, from the registry, so each one has its own name and icon. */
const TURN_INTO = [
  'paragraph',
  'heading-2',
  'heading-3',
  'heading-4',
  'quote',
  'bullets',
  'numbers',
  'checklist',
]
  .map((id) => COMMANDS.find((cmd) => cmd.id === id))
  .filter((cmd) => cmd !== undefined);

interface Target {
  node: ProseMirrorNode;
  pos: number;
}

export function BlockHandle({ editor }: { editor: Editor }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);

  /** Puts the selection on the block: the whole block, or the caret at its start. */
  const select = (block: Target, whole: boolean) => {
    const { doc, tr } = editor.state;
    const selection = whole
      ? NodeSelection.create(doc, block.pos)
      : Selection.near(doc.resolve(Math.min(block.pos + 1, doc.content.size)));
    editor.view.dispatch(tr.setSelection(selection));
  };
  const move = (block: Target, direction: -1 | 1) => {
    select(block, true);
    editor.chain().focus().moveBlocks(direction).run();
    select({ node: block.node, pos: editor.state.selection.from }, false);
  };
  const openMenu = () => {
    if (!target) return;
    editor.commands.lockDragHandle();
    setOpen(true);
  };
  /** Runs the action on the block, unless an edit from another tab or device changed it first. */
  const act = (run: (block: Target) => void) => () => {
    if (target === null) return;
    if (editor.state.doc.nodeAt(target.pos) === target.node) run(target);
  };
  // A block with text, a list or a quote can turn into another block. A break or an image cannot.
  const turns = target !== null && !target.node.isAtom;

  return (
    <DragHandle
      editor={editor}
      className="vlo-block-handle pointer-coarse:hidden"
      onNodeChange={({ node, pos }) => {
        // The open menu acts on its own block, so the block under the pointer waits until it closes.
        if (!open) setTarget(node ? { node, pos } : null);
      }}
    >
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) editor.commands.unlockDragHandle();
        }}
      >
        <div
          role="button"
          tabIndex={-1}
          aria-label="Drag to move, or press for the block menu"
          data-tip="Drag to move. Press for more."
          className="relative mr-1 flex size-6 cursor-grab items-center justify-center rounded text-muted hover:bg-surface hover:text-text active:cursor-grabbing"
          onClick={openMenu}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') openMenu();
          }}
        >
          <GripVertical aria-hidden="true" className="size-4" />
          {/* The menu takes its place from this box. A press on the handle opens it, and a drag never does. */}
          <DropdownMenuTrigger asChild>
            <span aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute inset-0" />
          </DropdownMenuTrigger>
        </div>
        {target && (
          <DropdownMenuContent
            side="bottom"
            align="start"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              editor.view.focus();
            }}
          >
            {turns && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Turn into</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {TURN_INTO.map((cmd) => (
                    <DropdownMenuItem
                      key={cmd.id}
                      onSelect={act((block) => {
                        select(block, false);
                        runCommand(editor, cmd);
                      })}
                    >
                      <cmd.icon aria-hidden="true" className="size-4" />
                      {cmd.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuItem
              // An image keeps one row for each node, so a copy of it comes from Copy and Paste.
              disabled={target.node.type.name === IMAGE}
              onSelect={act((block) => {
                editor
                  .chain()
                  .focus()
                  .insertContentAt(block.pos + block.node.nodeSize, block.node)
                  .run();
              })}
            >
              <Copy aria-hidden="true" className="size-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={act((block) => {
                move(block, -1);
              })}
            >
              <MoveUp aria-hidden="true" className="size-4" />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={act((block) => {
                move(block, 1);
              })}
            >
              <MoveDown aria-hidden="true" className="size-4" />
              Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={act((block) => {
                editor
                  .chain()
                  .focus()
                  .deleteRange({ from: block.pos, to: block.pos + block.node.nodeSize })
                  .run();
              })}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        )}
      </DropdownMenu>
    </DragHandle>
  );
}
