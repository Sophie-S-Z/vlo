import { EditorContent, useEditor, type Editor as TiptapEditor } from '@tiptap/react';
import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { AliasPreview } from '@/features/people/aliasPreview';
import type { PageFormat, Template } from '@/lib/db';
import type * as Y from 'yjs';
import { FocusTools } from '@/features/focus/focusExtension';
import { centerCaret, refreshFocus } from '@/features/focus/focusPlugin';
import { useFocusPrefs } from '@/features/focus/focusPrefs';
import { cn } from '@/ui/cn';
import {
  closeFind,
  getActiveEditor,
  getFindRequest,
  openFind,
  openPanel,
  runCommand,
  setActiveEditor,
  useFindRequest,
} from './commands/editorBus';
import { commandsFor, matchesCommand, type EditorCommand } from './commands/registry';
import { CaretBlock } from './extensions/caretBlock';
import { ClickBelow } from './extensions/clickBelow';
import { HeldSelection, ToolKeys } from './extensions/editorTools';
import { FindReplace } from './extensions/findReplace';
import { FootnoteList } from './FootnoteList';
import { poemExtensions } from './extensions/poem';
import { CraftLabels } from '@/features/craft/CraftLabels';
import { useCraft } from '@/features/craft/craftStore';
import { CraftSwitch } from '@/features/craft/craftSwitch';
import { proseExtensions } from './extensions/prose';
import { SlashMenu } from './extensions/slashMenu';
import { SmartPunctuation } from './extensions/smartPunctuation';
import { TypingState } from './extensions/textFill';
import { BASE_STACK, DEFAULT_FONT, fontStack, type FontValue } from './format/fonts';
import { ensurePaletteStyles } from './format/palette';
import { PageFrame } from './PageFrame';
import { ReadAloudMark, stopReadingFor } from './readAloud/reader';
import { FindBar } from './toolbar/FindBar';
import { PanelHost } from './toolbar/PanelHost';
import { ReadAloudBar } from './toolbar/ReadAloudBar';
import { SelectionMenu } from './toolbar/SelectionMenu';
import { SlashMenuList } from './toolbar/SlashMenuList';
import { Toolbar } from './toolbar/Toolbar';
import { useWritingPrefs } from './writingPrefs';
import '@/styles/editor.css';
import '@/styles/fonts.css';

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
  /** The project font. */
  font?: FontValue;
  /** Pageless, or a Letter or A4 sheet with page-end lines. */
  page?: PageFormat;
  /** Page zoom in percent. */
  zoom?: number;
  /** Receives the page count, or null when no sheet shows. */
  onPages?: (pages: number | null) => void;
  /** The project's template, for the tools that only some templates offer. */
  template?: Template | undefined;
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
function slashItems(kind: EditorProps['kind'], template: Template | undefined) {
  const tools = commandsFor(kind, template).filter((c) => c.slash);
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

export function Editor({
  doc,
  kind,
  label,
  focusOnOpen = false,
  onEditor,
  font = DEFAULT_FONT,
  page = 'pageless',
  zoom = 100,
  onPages,
  template,
}: EditorProps) {
  const helpId = useId();
  const listId = `${useId()}-tools`;
  const writing = useWritingPrefs();
  const smart = kind === 'poem' ? writing.smartPoems : writing.smartProse;
  const editor = useEditor(
    {
      extensions: [
        ...(kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc)),
        ...(smart ? [SmartPunctuation] : []),
        FocusTools,
        ClickBelow,
        CaretBlock,
        TypingState,
        HeldSelection,
        ReadAloudMark,
        AliasPreview,
        CraftSwitch,
        SlashMenu.configure({
          items: slashItems(kind, template),
          listId,
          onChoose: (cmd, e) => {
            runCommand(e, cmd, 'caret');
          },
        }),
        FindReplace.configure({
          onOpen: (e, field) => {
            openFind(e, field);
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

  // The find bar closes with its editor, and a reading stops.
  const find = useFindRequest();
  useEffect(
    () => () => {
      if (getFindRequest()?.editor === editor) closeFind();
      stopReadingFor(editor);
    },
    [editor],
  );

  // The project font is the manuscript font for the text, the notes and the panels' samples.
  const craft = useCraft();
  const craftOn = kind === 'poem' && template === 'poetry' && craft.on;

  const stack = fontStack(font, BASE_STACK);
  const rootStyle = { '--font-manuscript': stack } as CSSProperties;

  return (
    <div className="grid gap-3" data-vlo-editor="" style={rootStyle}>
      {/* The toolbar, the find bar and the read aloud bar stay at the top while the text scrolls. */}
      <div className="sticky top-0 z-10 -mx-1 grid bg-bg">
        <Toolbar editor={editor} kind={kind} template={template} />
        {find?.editor === editor && <FindBar editor={editor} request={find} />}
        <ReadAloudBar editor={editor} />
      </div>
      <PageFrame editor={editor} format={page} zoom={zoom} layoutKey={stack} onPages={onPages}>
        {/* The Craft labels sit in a layer over the poem, outside the editable text. */}
        <div className={cn('relative', craftOn && 'vlo-craft')}>
          {craftOn && <CraftLabels editor={editor} />}
          <EditorContent editor={editor} className={cn('relative', focus.typewriter && 'vlo-typewriter')} />
        </div>
        <FootnoteList editor={editor} />
      </PageFrame>
      <SelectionMenu editor={editor} form={kind} template={template} />
      <SlashMenuList editor={editor} listId={listId} />
      <PanelHost editor={editor} form={kind} />
      <p id={helpId} className="text-xs text-muted">
        {HELP[kind]}
      </p>
    </div>
  );
}
