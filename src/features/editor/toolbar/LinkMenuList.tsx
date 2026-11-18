import type { Editor } from '@tiptap/core';
import { insertLink, linkMenuKey } from '../extensions/itemLink';
import { MenuList } from './MenuList';

/** The list that "[[" shows: the items, then the headings, whose names hold the letters after it. */
export function LinkMenuList({ editor, listId }: { editor: Editor; listId: string }) {
  return (
    <MenuList
      editor={editor}
      listId={listId}
      menuKey={linkMenuKey}
      label="Items and headings"
      empty="No item or heading has these letters. Press Escape to keep the brackets."
      itemKey={(choice) => `${choice.item}-${String(choice.heading?.index ?? '')}`}
      onChoose={(choice) => {
        insertLink(editor, choice);
      }}
      option={(choice) => (
        <>
          <span className="flex-1 truncate">{choice.heading?.text ?? choice.title}</span>
          <span className="max-w-[45%] truncate text-xs text-muted">
            {choice.heading ? `Heading in ${choice.title}` : 'Item'}
          </span>
        </>
      )}
    />
  );
}
