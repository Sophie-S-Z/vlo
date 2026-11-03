import Typography from '@tiptap/extension-typography';
import { EditorContent, useEditor, type Editor as TiptapEditor } from '@tiptap/react';
import { useEffect, useId, useRef } from 'react';
import type * as Y from 'yjs';
import { FocusTools } from '@/features/focus/focusExtension';
import { centerCaret, refreshFocus } from '@/features/focus/focusPlugin';
import { useFocusPrefs } from '@/features/focus/focusPrefs';
import { cn } from '@/ui/cn';
import { openPanel, runCommand, setActiveEditor, getActiveEditor } from './commands/editorBus';
import { commandsFor, matchesCommand, type EditorCommand } from './commands/registry';
import { HeldSelection, ToolKeys } from './extensions/editorTools';
import { poemExtensions } from './extensions/poem';
import { proseExtensions } from './extensions/prose';
import { SlashMenu } from './extensions/slashMenu';
import { TypingState } from './extensions/textFill';
import { ensurePaletteStyles } from './format/palette';
import { PanelHost } from './toolbar/PanelHost';
import { SelectionMenu } from './toolbar/SelectionMenu';
import { SlashMenuList } from './toolbar/SlashMenuList';
import { Toolbar } from './toolbar/Toolbar';
import { useWritingPrefs } from './writingPrefs';
import '@/styles/editor.css';

// The theme colors behind each palette swatch. The editor chunk adds them once.
ensurePaletteStyles();

interface EditorProps {
  doc: Y.Doc;
  kind: 'prose' | 'poem';
  /** The accessible name, such as the item's title. */
  label: string;
  /** Puts the cursor at the end of the text when the editor opens. */
  focusOnOpen?: boolean;
  /** Receives the editor once it exists, and null when it goes. */
  onEditor?: (editor: TiptapEditor | null) => void;
}

const HELP = {
  prose: 'Type / for tools. Press Escape, then Tab, to leave the text.',
  poem: 'Type / for tools. Tab adds four spaces and Shift-Tab removes them. Enter on an empty line starts a new stanza. Press Escape, then Tab, to leave the poem.',
};

/** The editor element's attributes. A rename passes a new label. */
function editorAttributes(label: string, kind: EditorProps['kind'], helpId: string): Record<string, string> {
  return {
    'aria-label': label,
    'aria-multiline': 'true',
    'aria-describedby': helpId,
    role: 'textbox',
    spellcheck: 'true',
    class: kind === 'poem' ? 'vlo-manuscript vlo-poem' : 'vlo-manuscript vlo-prose',
  };
}

/** Tools for the / menu: label matches first, then keyword matches, each in registry order. */
function slashItems(kind: EditorProps['kind']) {
  const tools = commandsFor(kind).filter((c) => c.slash);
  return (query: string): EditorCommand[] => {
    const found = tools.filter((c) => matchesCommand(c, query));
    const q = query.trim().toLowerCase();
    if (q === '') return found;
    const byLabel = found.filter((c) => c.label.toLowerCase().includes(q));
    return [...byLabel, ...found.filter((c) => !byLabel.includes(c))];
  };
}

/** Alt-F10 moves focus to the selection menu when it shows, else to the toolbar. */
function focusTools(editor: TiptapEditor): boolean {
  const root = editor.view.dom.closest('[data-vlo-editor]');
  const target =
    root?.querySelector<HTMLElement>('[data-vlo-selection-menu] button:not([disabled])') ??
    root?.querySelector<HTMLElement>('[data-vlo-toolbar] button:not([disabled])');
  if (!target) return false;
  target.focus();
  return true;
}

export function Editor({ doc, kind, label, focusOnOpen = false, onEditor }: EditorProps) {
  const helpId = useId();
  const listId = `${useId()}-tools`;
  const writing = useWritingPrefs();
  const smart = kind === 'poem' ? writing.smartPoems : writing.smartProse;
  const editor = useEditor(
    {
      extensions: [
        ...(kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc)),
        ...(smart ? [Typography] : []),
        FocusTools,
        TypingState,
        HeldSelection,
        SlashMenu.configure({
          items: slashItems(kind),
          listId,
          onChoose: (cmd, e) => {
            runCommand(e, cmd, 'caret');
          },
        }),
        ToolKeys.configure({
          onShortcuts: (e) => {
            openPanel({ editor: e, panel: 'shortcuts', anchor: 'caret' });
          },
          onToolFocus: focusTools,
        }),
      ],
      // Poems run no input rules, so "1." or "- " stays as typed. Smart punctuation is the one opt-in rule.
      enableInputRules: kind === 'prose' ? true : smart ? ['typography'] : false,
      enablePasteRules: kind === 'prose',
      autofocus: focusOnOpen ? 'end' : false,
      // The tool surfaces read editor state on their own, so a keystroke does not re-render this tree.
      shouldRerenderOnTransaction: false,
      editorProps: { attributes: editorAttributes(label, kind, helpId) },
    },
    [doc, kind, smart],
  );

  // A rename changes the editor's accessible name at once, without reopening the item.
  const namedAs = useRef(label);
  useEffect(() => {
    if (editor.isDestroyed || namedAs.current === label) return;
    namedAs.current = label;
    editor.setOptions({
      editorProps: { ...editor.options.editorProps, attributes: editorAttributes(label, kind, helpId) },
    });
  }, [editor, label, kind, helpId]);

  const focus = useFocusPrefs();
  // A focus switch changed: redraw the dimming and center the caret at once.
  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(refreshFocus(editor.state.tr));
    if (focus.typewriter && editor.view.hasFocus()) centerCaret(editor.view);
  }, [editor, focus]);

  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  // The command menu runs format commands on the open editor.
  useEffect(() => {
    setActiveEditor({ editor, form: kind });
    return () => {
      if (getActiveEditor()?.editor === editor) setActiveEditor(null);
    };
  }, [editor, kind]);

  return (
    <div className="grid gap-3" data-vlo-editor="">
      <Toolbar editor={editor} kind={kind} />
      <EditorContent editor={editor} className={cn('relative', focus.typewriter && 'vlo-typewriter')} />
      <SelectionMenu editor={editor} form={kind} />
      <SlashMenuList editor={editor} listId={listId} />
      <PanelHost editor={editor} form={kind} />
      <p id={helpId} className="text-xs text-muted">
        {HELP[kind]}
      </p>
    </div>
  );
}
