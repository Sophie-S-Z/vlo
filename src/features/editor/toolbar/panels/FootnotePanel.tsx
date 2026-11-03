import { Node, type Editor, type JSONContent } from '@tiptap/core';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import type { Transaction } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Italic,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Underline,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { closePanel, focusText } from '../../commands/editorBus';
import { shortcutLabel } from '../../commands/keys';
import { FOOTNOTE, footnotesOf, leaveFootnote, selectedFootnote } from '../../extensions/footnote';
import { parseNote, type NoteContent, type NoteMark } from '../../format/notes';
import { toolClass } from '../ToolButton';

/** A note is one paragraph. */
const NoteDocument = Node.create({ name: 'doc', topNode: true, content: 'paragraph' });

function noteExtensions() {
  return [
    StarterKit.configure({
      document: false,
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
      link: false,
      trailingNode: false,
      dropcursor: false,
      gapcursor: false,
    }),
    NoteDocument,
    Superscript,
    Subscript,
  ];
}

function noteDoc(content: NoteContent): JSONContent {
  return { type: 'doc', content: [{ type: 'paragraph', ...(content.length > 0 ? { content } : {}) }] };
}

function noteAt(editor: Editor, pos: number | null): NoteContent {
  if (pos === null) return [];
  const node = editor.state.doc.nodeAt(pos);
  return node?.type.name === FOOTNOTE ? parseNote(node.attrs.content) : [];
}

const NOTE_TOOLS: readonly { mark: NoteMark; label: string; icon: LucideIcon; keys: string }[] = [
  { mark: 'bold', label: 'Bold', icon: Bold, keys: 'Mod-b' },
  { mark: 'italic', label: 'Italic', icon: Italic, keys: 'Mod-i' },
  { mark: 'underline', label: 'Underline', icon: Underline, keys: 'Mod-u' },
  { mark: 'strike', label: 'Strikethrough', icon: Strikethrough, keys: 'Mod-Shift-s' },
  { mark: 'superscript', label: 'Superscript', icon: SuperscriptIcon, keys: 'Mod-.' },
  { mark: 'subscript', label: 'Subscript', icon: SubscriptIcon, keys: 'Mod-,' },
];

interface Target {
  pos: number;
  number: number;
}

function targetAt(editor: Editor, pos: number | null): Target | null {
  if (pos === null) return null;
  const entry = footnotesOf(editor.state).find((e) => e.pos === pos);
  return entry ? { pos, number: entry.number } : null;
}

/**
 * Edits the note of the selected footnote. Each change goes into the document at once, so undo, autosave
 * and other tabs see it. Enter, Done or Escape returns to the text just after the reference.
 */
export function FootnotePanel({ editor }: { editor: Editor }) {
  const [target, setTarget] = useState<Target | null>(() => targetAt(editor, selectedFootnote(editor.state)));
  const posRef = useRef(target?.pos ?? null);
  const headingId = useId();
  const helpId = useId();

  // The reference moves when text before it changes. Its number changes when a reference before it comes or goes.
  useEffect(() => {
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      const current = posRef.current;
      if (current === null || !transaction.docChanged) return;
      const mapped = transaction.mapping.mapResult(current, 1);
      // A change from another tab replaces the whole paragraph or stanza, so the mapping reports the
      // reference as deleted even when it is still there. The editor keeps it selected, so look there.
      const next =
        (mapped.deleted ? null : targetAt(editor, mapped.pos)) ??
        targetAt(editor, selectedFootnote(editor.state));
      posRef.current = next?.pos ?? null;
      setTarget((old) => (old?.pos === next?.pos && old?.number === next?.number ? old : next));
    };
    editor.on('transaction', onTransaction);
    return () => {
      editor.off('transaction', onTransaction);
    };
  }, [editor]);

  // The reference is gone, for example after an undo or a change in another tab. A reference that is
  // still selected gives way to a caret after it, so the next key cannot replace it.
  useEffect(() => {
    if (target !== null) return;
    const at = selectedFootnote(editor.state);
    if (at !== null) leaveFootnote(editor, at);
    closePanel();
  }, [editor, target]);

  // Reads only the ref and the editor, so the note editor's key handler can keep the first copy.
  const done = () => {
    const pos = posRef.current;
    if (pos !== null) leaveFootnote(editor, pos);
    closePanel();
    focusText(editor);
  };

  const note = useEditor(
    {
      extensions: noteExtensions(),
      content: noteDoc(noteAt(editor, target?.pos ?? null)),
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'false',
          'aria-labelledby': headingId,
          'aria-describedby': helpId,
          spellcheck: 'true',
          class:
            'min-h-20 rounded-md border border-rule bg-bg px-3 py-2 font-manuscript text-base text-text outline-none focus-visible:border-accent',
        },
        handleKeyDown: (_view, event) => {
          if (event.key !== 'Enter' || event.isComposing) return false;
          event.preventDefault();
          done();
          return true;
        },
      },
      onUpdate: ({ editor: noteEditor }) => {
        const pos = posRef.current;
        if (pos === null) return;
        editor.commands.setFootnoteContent(pos, parseNote(noteEditor.getJSON().content[0]?.content ?? []));
      },
    },
    [],
  );

  // The note editor takes focus with the caret at the end, so the writer types the note at once.
  useEffect(() => {
    if (note.isDestroyed) return;
    note.view.dispatch(note.state.tr.setSelection(TextSelection.atEnd(note.state.doc)));
    note.view.focus();
  }, [note]);

  const active = useEditorState({
    editor: note,
    selector: ({ editor: e }) => NOTE_TOOLS.map((t) => e.isActive(t.mark)),
  });

  const remove = () => {
    const pos = posRef.current;
    const node = pos === null ? null : editor.state.doc.nodeAt(pos);
    if (pos === null || node?.type.name !== FOOTNOTE) return;
    posRef.current = null;
    const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
    tr.setSelection(TextSelection.create(tr.doc, pos));
    editor.view.dispatch(tr);
    closePanel();
    focusText(editor);
  };

  if (target === null) return null;
  const label = `Footnote ${String(target.number)}`;

  return (
    <div className="grid gap-3">
      <h2 id={headingId} className="text-sm font-medium">
        {label}
      </h2>
      <div role="toolbar" aria-label="Note formatting" className="-my-1 flex flex-wrap gap-0.5">
        {NOTE_TOOLS.map((tool, i) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.mark}
              type="button"
              aria-label={tool.label}
              aria-pressed={active[i] ?? false}
              title={`${tool.label} (${shortcutLabel(tool.keys)})`}
              className={cn(toolClass)}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                note.chain().focus().toggleMark(tool.mark).run();
              }}
            >
              <Icon aria-hidden="true" className="size-4" />
            </button>
          );
        })}
      </div>
      <EditorContent editor={note} />
      <p id={helpId} className="text-xs text-muted">
        Enter returns to your text. The note shows in the list under the text.
      </p>
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="ghost" onClick={remove}>
          Remove footnote
        </Button>
        <Button type="button" onClick={done}>
          Done
        </Button>
      </div>
    </div>
  );
}
