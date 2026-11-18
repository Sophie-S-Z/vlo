import type { AnyExtension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import StarterKit from '@tiptap/starter-kit';
import type * as Y from 'yjs';
import { YFRAGMENT } from '@/lib/ydocs';
import { EscapeTab } from './escapeTab';
import { Footnote } from './footnote';
import { MathBlock, MathInline } from './math';
import { blockFormatting, ClearFormatting, inlineFormatting } from './formatting';
import { PrivateName } from '@/features/people/personMark';
import { AiOriginMark } from './aiOrigin';
import { CommentMark } from './comment';
import { SuggestionMark } from './suggestion';
import { CleanPaste } from './cleanPaste';
import { PageBreak } from './pageBreak';
import { PaintFormat } from './paintFormat';
import { MoveBlocks } from './moveBlocks';
import { TextCaseCommands } from './textCase';
import { SceneBreak } from './sceneBreak';
import { Cite } from './cite';
import { ImageNode } from './image';
import { ItemLink } from './itemLink';

/** What the links of an editor need: its item, and the id of the "[[" list. */
export interface LinkOptions {
  itemId: string | null;
  listId: string;
}

/**
 * The prose schema for scenes, memories and notes. Collaboration keeps undo history, so UndoRedo is off.
 * `links` names the editor's item for its links to items.
 */
export function proseExtensions(
  ydoc: Y.Doc,
  links: LinkOptions = { itemId: null, listId: 'vlo-item-links' },
): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      code: false,
      codeBlock: false,
      horizontalRule: false,
      undoRedo: false,
      link: { openOnClick: false, autolink: false, defaultProtocol: 'https' },
    }),
    ...inlineFormatting(),
    ...blockFormatting(),
    ClearFormatting,
    PaintFormat,
    TextCaseCommands,
    MoveBlocks,
    CleanPaste,
    SceneBreak,
    PageBreak,
    TaskList,
    TaskItem.configure({ nested: true }),
    PrivateName,
    AiOriginMark,
    CommentMark,
    SuggestionMark,
    Footnote,
    MathInline,
    MathBlock,
    Cite,
    ItemLink.configure(links),
    ImageNode,
    EscapeTab,
    Collaboration.configure({ document: ydoc, field: YFRAGMENT }),
  ];
}
