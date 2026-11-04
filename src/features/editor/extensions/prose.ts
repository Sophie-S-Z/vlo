import type { AnyExtension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import StarterKit from '@tiptap/starter-kit';
import type * as Y from 'yjs';
import { YFRAGMENT } from '@/lib/ydocs';
import { EscapeTab } from './escapeTab';
import { Footnote } from './footnote';
import { MathBlock, MathInline } from './math';
import { blockFormatting, ClearFormatting, inlineFormatting } from './formatting';
import { SceneBreak } from './sceneBreak';

/** The prose schema for scenes, memories and notes. Collaboration keeps undo history, so UndoRedo is off. */
export function proseExtensions(ydoc: Y.Doc): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      code: false,
      codeBlock: false,
      horizontalRule: false,
      undoRedo: false,
      link: { openOnClick: false, autolink: false, defaultProtocol: 'https' },
    }),
    ...inlineFormatting(),
    ...blockFormatting(),
    ClearFormatting,
    SceneBreak,
    Footnote,
    MathInline,
    MathBlock,
    EscapeTab,
    Collaboration.configure({ document: ydoc, field: YFRAGMENT }),
  ];
}
