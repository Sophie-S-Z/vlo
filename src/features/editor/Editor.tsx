import type { AnyExtension } from '@tiptap/core';
import { EditorContent, useEditor, type Editor as TiptapEditor } from '@tiptap/react';
import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { AliasPreview } from '@/features/people/aliasPreview';
import type { PageFormat, Template } from '@/lib/db';
import { textDirection } from '@/lib/language';
import type * as Y from 'yjs';
import { AuthorshipCount } from '@/features/authorship/sourcePlugin';
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
import { ImageInput } from './extensions/image';
import { ChangesList } from './ChangesList';
import { CommentList } from './CommentList';
import { FootnoteList } from './FootnoteList';
import { poemExtensions } from './extensions/poem';
import { CraftLabels } from '@/features/craft/CraftLabels';
import { CraftSwitch } from '@/features/craft/craftSwitch';
import type { PoemForm } from '@/features/craft/forms';
import { proseExtensions } from './extensions/prose';
import { scriptExtensions } from './extensions/script';
import { SlashMenu } from './extensions/slashMenu';
import { SmartPunctuation } from './extensions/smartPunctuation';
import { StyleCheck } from './extensions/styleCheck';
import { CodexNames } from './extensions/codexNames';
import { ContinuityCheck } from './extensions/continuityCheck';
import { TypingState } from './extensions/textFill';
import { BASE_STACK, COMFORT_FONT, DEFAULT_FONT, fontStack, type FontValue } from './format/fonts';
import { ensurePaletteStyles } from './format/palette';
import { PageFrame } from './PageFrame';
import { ReadAloudMark, stopReadingFor } from './readAloud/reader';
import { FindBar } from './toolbar/FindBar';
import { PanelHost } from './toolbar/PanelHost';
import { ReadAloudBar } from './toolbar/ReadAloudBar';
import { SelectionMenu } from './toolbar/SelectionMenu';
import { SlashMenuList } from './toolbar/SlashMenuList';
import { CursorNote } from './CursorNote';
import { Toolbar } from './toolbar/Toolbar';
import { useWritingPrefs } from './writingPrefs';
import '@/styles/editor.css';
import '@/styles/fonts.css';
import type { EditorForm } from '@/features/library/templates';

// The theme colors behind each palette swatch. The editor chunk adds them once.
ensurePaletteStyles();

interface EditorProps {
  doc: Y.Doc;
  kind: EditorForm;
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
  /** The project's templates, for the tools that only some templates offer. */
  templates?: readonly Template[] | undefined;
  /** The language of the writing (F38). It sets the spell-check language and the text direction. */
  language?: string | undefined;
  /** The item of the text, so the Assistant knows which item the active editor holds. */
  itemId?: string;
  /** The project of the text, for its authorship record (F54). */
  projectId?: string;
  /** Shows the Craft labels over the poem. */
  craft?: boolean;
  /** The form that the Craft labels check the poem against (F56). */
  poemForm?: PoemForm | undefined;
}

const HELP = {
  prose: 'Type / for tools. Press Escape, then Tab, to leave the text.',
  poem: 'Type / for tools. Tab adds four spaces and Shift-Tab removes them. Enter on an empty line starts a new stanza. Press Escape, then Tab, to leave the poem.',
  script:
    'Type / for tools. Tab changes the element of the line, and Enter starts the element that usually follows. Press Escape, then Tab, to leave the script.',
} satisfies Record<EditorForm, string>;

const EXTENSIONS = {
  prose: proseExtensions,
  poem: (doc: Y.Doc) => poemExtensions(doc, { tabSpaces: 4 }),
  script: scriptExtensions,
} satisfies Record<EditorForm, (doc: Y.Doc) => AnyExtension[]>;

/** The editor element's attributes. A rename passes a new label. */
function editorAttributes(
  label: string,
  kind: EditorProps['kind'],
  helpId: string,
  showAi: boolean,
): Record<string, string> {
  return {
    'aria-label': label,
    'aria-multiline': 'true',
    'aria-describedby': helpId,
    role: 'textbox',
    spellcheck: 'true',
    class: `vlo-manuscript vlo-${kind}`,
    // "Show AI text" draws the aiOrigin mark. The mark stays in the text when it is hidden.
    ...(showAi ? { 'data-show-ai': '' } : {}),
  };
}

/** Tools for the / menu: label matches first, then keyword matches, each in registry order. */
function slashItems(kind: EditorProps['kind'], templates: readonly Template[] | undefined) {
  const tools = commandsFor(kind, templates).filter((c) => c.slash);
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
  templates,
  language,
  itemId,
  projectId,
  craft = false,
  poemForm,
}: EditorProps) {
  const helpId = useId();
  const listId = `${useId()}-tools`;
  const writing = useWritingPrefs();
  const smart = kind === 'poem' ? writing.smartPoems : writing.smartProse;
  // The style check's word lists are English. A project with no language is English.
  const english = (language ?? 'en').split('-')[0] === 'en';
  const editor = useEditor(
    {
      extensions: [
        ...EXTENSIONS[kind](doc),
        ...(smart ? [SmartPunctuation] : []),
        FocusTools,
        ClickBelow,
        CaretBlock,
        TypingState,
        HeldSelection,
        ReadAloudMark,
        AliasPreview,
        CraftSwitch,
        StyleCheck.configure({ form: kind, english }),
        CodexNames,
        ContinuityCheck.configure({ itemId, english }),
        AuthorshipCount.configure({ projectId: projectId ?? null }),
        ...(kind === 'script' ? [] : [ImageInput.configure({ projectId: projectId ?? null })]),
        SlashMenu.configure({
          items: slashItems(kind, templates),
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
      editorProps: { attributes: editorAttributes(label, kind, helpId, writing.showAiText) },
    },
    [doc, kind, smart, english, projectId],
  );

  // A rename changes the editor's accessible name at once, without reopening the item.
  // The "Show AI text" switch also changes the attributes at once.
  const namedAs = useRef({ label, showAi: writing.showAiText });
  useEffect(() => {
    const showAi = writing.showAiText;
    if (editor.isDestroyed || (namedAs.current.label === label && namedAs.current.showAi === showAi)) return;
    namedAs.current = { label, showAi };
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: editorAttributes(label, kind, helpId, showAi),
      },
    });
  }, [editor, label, kind, helpId, writing.showAiText]);

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

  // The command menu runs format commands on the open editor. In a split view (F39) the editor whose text
  // has focus is the active one, and a pane that opens beside waits for focus.
  useEffect(() => {
    const take = () => {
      setActiveEditor({ editor, form: kind, ...(itemId === undefined ? {} : { itemId }) });
    };
    if (focusOnOpen || !getActiveEditor()) take();
    editor.on('focus', take);
    return () => {
      editor.off('focus', take);
      if (getActiveEditor()?.editor === editor) setActiveEditor(null);
    };
  }, [editor, kind, itemId, focusOnOpen]);

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
  // Comfort settings (F37) change the screen only. The page-end lines measure the screen, so they follow.
  const stack = fontStack(writing.comfortFont ? COMFORT_FONT : font, BASE_STACK);
  const rootStyle = {
    '--font-manuscript': stack,
    '--vlo-letter-spacing': `${String(writing.letterSpacing)}em`,
    '--vlo-word-spacing': `${String(writing.wordSpacing)}em`,
    '--vlo-line-height': String(writing.lineHeight),
  } as CSSProperties;
  const layoutKey = [stack, writing.letterSpacing, writing.wordSpacing, writing.lineHeight].join('|');

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3" data-vlo-editor="" style={rootStyle}>
      {/* The toolbar, the find bar and the read aloud bar stay at the top while the text scrolls. */}
      <div className="sticky top-0 z-10 -mx-1 grid bg-bg">
        <Toolbar editor={editor} kind={kind} templates={templates} />
        {find?.editor === editor && <FindBar editor={editor} request={find} />}
        <ReadAloudBar editor={editor} />
        <CursorNote editor={editor} itemId={itemId} />
      </div>
      <PageFrame editor={editor} format={page} zoom={zoom} layoutKey={layoutKey} onPages={onPages}>
        {/* The Craft labels sit in a layer over the poem, outside the editable text. */}
        <div
          className={cn('relative', craft && 'vlo-craft')}
          {...(language ? { lang: language, dir: textDirection(language) } : {})}
        >
          {craft && itemId !== undefined && (
            <CraftLabels editor={editor} itemId={itemId} form={poemForm} english={english} />
          )}
          <EditorContent editor={editor} className={cn('relative', focus.typewriter && 'vlo-typewriter')} />
        </div>
        <FootnoteList editor={editor} />
      </PageFrame>
      <ChangesList editor={editor} />
      <CommentList editor={editor} />
      <SelectionMenu editor={editor} form={kind} templates={templates} />
      <SlashMenuList editor={editor} listId={listId} />
      <PanelHost
        editor={editor}
        form={kind}
        item={itemId !== undefined && projectId !== undefined ? { id: itemId, projectId } : null}
        language={language}
      />
      <p id={helpId} className="text-xs text-muted">
        {HELP[kind]}
      </p>
    </div>
  );
}
