import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/ui/cn';
import { runCommand } from '../commands/editorBus';
import { shortcutLabel } from '../commands/keys';
import { GROUP_LABELS } from '../commands/registry';
import { chooseSlash, slashKey } from '../extensions/slashMenu';

/** The list the / menu shows. The editor keeps focus; the extension handles the keys. */
export function SlashMenuList({ editor, listId }: { editor: Editor; listId: string }) {
  const slash = useEditorState({ editor, selector: ({ editor: e }) => slashKey.getState(e.state) ?? null });
  const list = useRef<HTMLDivElement>(null);
  const open = slash !== null && slash.from !== null;
  const from = slash?.from ?? null;

  // Place the list under the "/", or above it near the bottom of the screen.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el || from === null) return;
    const reference = {
      getBoundingClientRect: () => {
        const c = editor.view.coordsAtPos(from);
        return new DOMRect(c.left, c.top, 1, c.bottom - c.top);
      },
    };
    let live = true;
    void computePosition(reference, el, {
      strategy: 'fixed',
      placement: 'bottom-start',
      middleware: [offset(6), flip(), shift({ padding: 12 })],
    }).then(({ x, y }) => {
      if (!live) return;
      el.style.left = `${String(x)}px`;
      el.style.top = `${String(y)}px`;
      el.style.visibility = 'visible';
    });
    return () => {
      live = false;
    };
  }, [editor, from, slash?.matches.length]);

  // Keep the chosen tool in view while the arrow keys move.
  useLayoutEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${String(slash.index)}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, slash?.index, listId]);

  if (!open) return null;
  const shell =
    'fixed z-40 max-h-[min(22rem,50vh)] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[var(--radius-card)] border border-rule bg-surface p-1 text-text shadow-lg';

  if (slash.matches.length === 0) {
    return (
      <div ref={list} id={listId} data-vlo-layer="" className={shell} style={{ visibility: 'hidden' }}>
        <p className="px-3 py-2 text-sm text-muted">No tools match. Press Escape to keep the slash.</p>
      </div>
    );
  }

  return (
    <div
      ref={list}
      id={listId}
      role="listbox"
      aria-label="Tools"
      data-vlo-layer=""
      className={shell}
      style={{ visibility: 'hidden' }}
    >
      {slash.matches.map((cmd, i) => {
        const Icon = cmd.icon;
        const newGroup = i === 0 || slash.matches[i - 1]?.group !== cmd.group;
        return (
          <div key={cmd.id}>
            {newGroup && slash.query === '' && (
              <div aria-hidden="true" className="px-3 pt-2 pb-1 text-xs font-medium text-muted">
                {GROUP_LABELS[cmd.group]}
              </div>
            )}
            {/* The editor keeps focus and owns the keys (aria-activedescendant), so options take no focus or keys. */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
            <div
              id={`${listId}-${String(i)}`}
              role="option"
              aria-selected={i === slash.index}
              // Focusable by script only. The editor keeps focus, and a mouse press does not move it.
              tabIndex={-1}
              onMouseDown={(event) => {
                // The editor keeps focus, so the / and the query stay where they are until the tool runs.
                event.preventDefault();
              }}
              onClick={() => {
                chooseSlash(editor.view, slash, cmd, (c) => runCommand(editor, c, 'caret'));
              }}
              className={cn(
                'flex min-h-11 cursor-default items-center gap-3 rounded-md px-3 text-sm select-none pointer-fine:min-h-9',
                i === slash.index && 'bg-bg text-accent-text',
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" />
              <span className="flex-1">{cmd.label}</span>
              {cmd.keys && (
                <span aria-hidden="true" className="font-mono text-xs text-muted">
                  {shortcutLabel(cmd.keys)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
