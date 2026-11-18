import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import type { Editor } from '@tiptap/core';
import type { PluginKey } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { chooseFromMenu, type MenuState } from '../extensions/slashMenu';

/**
 * The list of a trigger menu: the / tools or the @ names. It sits under the trigger, or above it near the
 * bottom of the screen, and follows it when the page scrolls. The editor keeps focus, and the menu plugin
 * handles the keys.
 */
export function MenuList<T>({
  editor,
  listId,
  menuKey,
  label,
  empty,
  itemKey,
  onChoose,
  option,
  before,
}: {
  editor: Editor;
  listId: string;
  menuKey: PluginKey<MenuState<T>>;
  /** The name of the list for screen readers. */
  label: string;
  /** The line when nothing matches. */
  empty: string;
  itemKey: (item: T) => string;
  onChoose: (item: T) => void;
  /** The content of option i. */
  option: (item: T) => ReactNode;
  /** A heading above option i, such as a group name. */
  before?: (item: T, i: number, menu: MenuState<T>) => ReactNode;
}) {
  const menu = useEditorState({ editor, selector: ({ editor: e }) => menuKey.getState(e.state) ?? null });
  const list = useRef<HTMLDivElement>(null);
  const open = menu !== null && menu.from !== null;
  const from = menu?.from ?? null;

  useLayoutEffect(() => {
    const el = list.current;
    if (!el || from === null) return;
    const reference = {
      getBoundingClientRect: () => {
        if (editor.isDestroyed || from > editor.state.doc.content.size) return new DOMRect();
        const c = editor.view.coordsAtPos(from);
        return new DOMRect(c.left, c.top, 1, c.bottom - c.top);
      },
      contextElement: editor.view.dom,
    };
    let live = true;
    const place = () => {
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
    };
    const stop = autoUpdate(reference, el, place);
    return () => {
      live = false;
      stop();
    };
  }, [editor, from, menu?.matches.length]);

  // Keep the chosen option in view while the arrow keys move.
  useLayoutEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${String(menu.index)}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, menu?.index, listId]);

  if (!open) return null;
  const shell =
    'fixed z-40 max-h-[min(22rem,50vh)] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[var(--radius-card)] border border-rule bg-surface p-1 text-text shadow-lg';

  if (menu.matches.length === 0) {
    return (
      <div ref={list} id={listId} data-vlo-layer="" className={shell} style={{ visibility: 'hidden' }}>
        <p className="px-3 py-2 text-sm text-muted">{empty}</p>
      </div>
    );
  }

  return (
    <div
      ref={list}
      id={listId}
      role="listbox"
      aria-label={label}
      data-vlo-layer=""
      className={shell}
      style={{ visibility: 'hidden' }}
    >
      {menu.matches.map((item, i) => (
        <div key={itemKey(item)}>
          {before?.(item, i, menu)}
          {/* The editor keeps focus and owns the keys (aria-activedescendant), so options take no focus or keys. */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
          <div
            id={`${listId}-${String(i)}`}
            role="option"
            aria-selected={i === menu.index}
            // Focusable by script only. The editor keeps focus, and a mouse press does not move it.
            tabIndex={-1}
            onMouseDown={(event) => {
              // The editor keeps focus, so the trigger and the query stay where they are until the choice.
              event.preventDefault();
            }}
            onClick={() => {
              chooseFromMenu(editor.view, menuKey, menu, item, onChoose);
            }}
            className={cn(
              'flex min-h-11 cursor-default items-center gap-3 rounded-md px-3 text-sm select-none pointer-fine:min-h-9',
              i === menu.index && 'bg-bg text-accent-text',
            )}
          >
            {option(item)}
          </div>
        </div>
      ))}
    </div>
  );
}
