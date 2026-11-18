import type { Editor } from '@tiptap/core';
import { insertMention, mentionKey } from '../extensions/codexCompletion';
import { MenuList } from './MenuList';

/** The list that "@" shows: the Codex entries and the items whose names hold the letters after it. */
export function MentionMenuList({ editor, listId }: { editor: Editor; listId: string }) {
  return (
    <MenuList
      editor={editor}
      listId={listId}
      menuKey={mentionKey}
      label="Names"
      empty="No Codex entry or item has these letters. Press Escape to keep the @."
      itemKey={(mention) => mention.id}
      onChoose={(mention) => {
        insertMention(editor, mention);
      }}
      option={(mention) => (
        <>
          <span className="flex-1 truncate">{mention.name}</span>
          <span className="text-xs text-muted">{mention.kind}</span>
        </>
      )}
    />
  );
}
