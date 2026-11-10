import { Node, type AnyExtension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import type * as Y from 'yjs';
import { getCodex, subscribeCodex } from '@/features/codex/codexStore';
import { PrivateName } from '@/features/people/personMark';
import { YFRAGMENT } from '@/lib/ydocs';
import { AiOriginMark } from './aiOrigin';
import { CommentMark } from './comment';
import { EscapeTab } from './escapeTab';
import { ClearFormatting } from './formatting';
import { SuggestionMark } from './suggestion';
import { nextRole, SCRIPT_LINE, scriptRole, type ScriptRole } from '../scriptRoles';

/*
 * The script schema (roadmap 2 F63, plan Task M2): doc > scriptLine+ > text. Each line has one role, the
 * element of a screenplay or a stage play. Tab changes the role of the line, and Enter at the end of a
 * line starts the role that usually follows, as in Final Draft.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    scriptLine: {
      /** Gives each selected line the role. */
      setScriptRole: (role: ScriptRole) => ReturnType;
    };
  }
}

const ScriptDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: `${SCRIPT_LINE}+`,
});

const completionKey = new PluginKey<string>('scriptCompletion');

/**
 * The Codex character whose name starts with the character line at the cursor, or ''. The cursor must be
 * at the end of the line, and the line must not hold the whole name already.
 */
function completion(state: EditorState): string {
  const { $head, empty } = state.selection;
  const line = $head.parent;
  if (!empty || line.type.name !== SCRIPT_LINE || line.attrs.role !== 'character') return '';
  if ($head.parentOffset !== line.content.size) return '';
  const typed = line.textContent.toUpperCase();
  if (typed.trim() === '') return '';
  return (
    getCodex()
      .entries.filter((entry) => entry.kind === 'character')
      .map((entry) => entry.name.trim())
      .find((name) => name.toUpperCase().startsWith(typed) && name.length > typed.length) ?? ''
  );
}

const ScriptLine = Node.create({
  name: SCRIPT_LINE,
  content: 'text*',
  marks: '_',
  defining: true,

  addAttributes() {
    return {
      role: {
        default: 'action',
        parseHTML: (element) => scriptRole(element.dataset.role),
        renderHTML: (attributes) => ({ 'data-role': scriptRole(attributes.role) }),
      },
    };
  },

  parseHTML() {
    // Paragraphs from other apps become action lines.
    return [{ tag: 'p[data-role]' }, { tag: 'p', priority: 40 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', HTMLAttributes, 0];
  },

  addCommands() {
    return {
      setScriptRole:
        (role) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          let found = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name !== SCRIPT_LINE) return true;
            found = true;
            if (dispatch && node.attrs.role !== role) tr.setNodeAttribute(pos, 'role', role);
            return false;
          });
          return found;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) =>
        editor.commands.setScriptRole(nextRole(scriptRole(editor.getAttributes(SCRIPT_LINE).role), 'Tab')),
      Enter: ({ editor }) =>
        editor.commands.command(({ tr, state }) => {
          const { $from } = state.selection;
          if ($from.parent.type.name !== SCRIPT_LINE) return false;
          const role = scriptRole($from.parent.attrs.role);
          // The line takes the Codex name as the Codex writes it.
          const name = completionKey.getState(state) ?? '';
          if (name !== '') tr.insertText(name, $from.start(), $from.end());
          tr.deleteSelection();
          const $at = tr.selection.$from;
          // In the middle of a line, both halves keep the role.
          const atEnd = $at.parentOffset === $at.parent.content.size;
          tr.split($at.pos, 1, [
            { type: $at.parent.type, attrs: { role: atEnd ? nextRole(role, 'Enter') : role } },
          ]);
          tr.scrollIntoView();
          return true;
        }),
    };
  },

  addProseMirrorPlugins() {
    return [
      // A character line shows the rest of a Codex character's name in grey. Enter takes the name.
      new Plugin<string>({
        key: completionKey,
        state: {
          init: (_config, state) => completion(state),
          apply: (tr, prev, _old, next) =>
            tr.docChanged || tr.selectionSet || tr.getMeta(completionKey) ? completion(next) : prev,
        },
        view: (view) => ({
          destroy: subscribeCodex(() => {
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(completionKey, true));
          }),
        }),
        props: {
          decorations: (state) => {
            const name = completionKey.getState(state) ?? '';
            const rest = name.slice(state.selection.$head.parent.content.size);
            if (rest === '') return null;
            const ghost = document.createElement('span');
            ghost.className = 'vlo-script-ghost';
            ghost.setAttribute('aria-hidden', 'true');
            ghost.textContent = rest;
            return DecorationSet.create(state.doc, [
              Decoration.widget(state.selection.head, ghost, { side: 1, key: rest }),
            ]);
          },
        },
      }),
    ];
  },
});

/** The script schema with bold, italic and underline, the formats that Fountain and Final Draft keep. */
export function scriptExtensions(ydoc: Y.Doc): AnyExtension[] {
  return [
    StarterKit.configure({
      document: false,
      paragraph: false,
      heading: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      code: false,
      codeBlock: false,
      hardBreak: false,
      horizontalRule: false,
      strike: false,
      link: false,
      undoRedo: false,
      trailingNode: false,
      dropcursor: false,
      gapcursor: false,
    }),
    ScriptDocument,
    ScriptLine,
    ClearFormatting.configure({ blocks: false }),
    PrivateName,
    AiOriginMark,
    CommentMark,
    SuggestionMark,
    EscapeTab,
    Collaboration.configure({ document: ydoc, field: YFRAGMENT }),
  ];
}
