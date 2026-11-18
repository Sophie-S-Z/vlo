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
import { WriterKeys } from './extensions/writerKeys';
import { FindReplace } from './extensions/findReplace';
import { ImageInput } from './extensions/image';
import { ChangesList } from './ChangesList';
import { FootnoteList } from './FootnoteList';
import { poemExtensions } from './extensions/poem';
import { CraftLabels } from '@/features/craft/CraftLabels';
import { CraftSwitch } from '@/features/craft/craftSwitch';
import type { PoemForm } from '@/features/craft/forms';
import { proseExtensions, type LinkOptions } from './extensions/prose';
import { scriptExtensions } from './extensions/script';
import { SlashMenu } from './extensions/slashMenu';
import { SmartPunctuation } from './extensions/smartPunctuation';
import { StyleCheck } from './extensions/styleCheck';
import { CodexNames } from './extensions/codexNames';
import { ContinuityCheck } from './extensions/continuityCheck';
import { GrammarCheck } from './extensions/grammar';
import { PartsOfSpeech } from './extensions/partsOfSpeech';
import { PosLegend } from '@/features/pos/PosLegend';
import { TextShortcuts } from './extensions/textShortcuts';
import { useGrammarPrefs } from '@/features/grammar/grammarPrefs';
import { TypingState } from './extensions/textFill';
import { BASE_STACK, COMFORT_FONT, DEFAULT_FONT, fontStack, type FontValue } from './format/fonts';
import { ensurePaletteStyles } from './format/palette';
import { PageFrame, type SheetSetup } from './PageFrame';
import { DEFAULT_PAGE_SETUP } from './format/pageSetup';
import { ReadAloudMark, stopReadingFor } from './readAloud/reader';
import { FindBar } from './toolbar/FindBar';
import { PanelHost } from './toolbar/PanelHost';
import { ReadAloudBar } from './toolbar/ReadAloudBar';
import { SelectionMenu } from './toolbar/SelectionMenu';
import { SlashMenuList } from './toolbar/SlashMenuList';
import { MentionMenuList } from './toolbar/MentionMenuList';
import { LinkMenuList } from './toolbar/LinkMenuList';
import { takeLinkAnchor } from '@/features/links/linkStore';
import { CodexCompletion } from './extensions/codexCompletion';
import { CursorNote } from './CursorNote';
import { Toolbar } from './toolbar/Toolbar';
import { restorePlace, savePlace, scrollToCaret } from './lastPlace';
import { BlockHandle } from './BlockHandle';
import { PasteNotice } from './PasteNotice';
import { watchPhoneTyping } from './phoneTyping';
import { useTracking } from './trackingStore';
import { useWritingPrefs } from './writingPrefs';
import '@/styles/editor.css';
import '@/styles/fonts.css';
import type { EditorForm } from '@/features/library/templates';

/** The pause after a caret move before the place is kept, in ms. */
const PLACE_DELAY_MS = 1000;

// The theme colors behind each palette swatch. The editor chunk adds them once.
ensurePaletteStyles();

const DEFAULT_SHEET: SheetSetup = { setup: DEFAULT_PAGE_SETUP, header: '', footer: '' };

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
  /** The margins, page numbers and page lines of the sheet (Phase 19, Task F3). */
  sheet?: SheetSetup;
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
  /** The margin shows each waiting change as a card, so the list under the text keeps only its tools. */
  changesInMargin?: boolean;
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
} satisfies Record<EditorForm, (doc: Y.Doc, links: LinkOptions) => AnyExtension[]>;

/**
 * The editor element's attributes. A rename passes a new label. The browser's spell check stays off while
 * Vlo's own check of spelling and grammar runs, so a word never gets two marks.
 */
function editorAttributes(
  label: string,
  kind: EditorProps['kind'],
  helpId: string,
  { showAi, grammar }: { showAi: boolean; grammar: boolean },
): Record<string, string> {
  return {
    'aria-label': label,
    'aria-multiline': 'true',
    'aria-describedby': helpId,
    role: 'textbox',
    spellcheck: grammar ? 'false' : 'true',
    class: `vlo-manuscript vlo-${kind}`,
    // "Show AI text" draws the aiOrigin mark. The mark stays in the text when it is hidden.
    ...(showAi ? { 'data-show-ai': '' } : {}),
  };
}

/**
 * Tools for the / menu: label matches first, then keyword matches, each in registry order. The list is
 * read at each query, so a new paragraph style shows at once.
 */
function slashItems(kind: EditorProps['kind'], templates: readonly Template[] | undefined) {
  return (query: string): EditorCommand[] => {
    const found = commandsFor(kind, templates).filter((c) => c.slash && matchesCommand(c, query));
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
  sheet = DEFAULT_SHEET,
  zoom = 100,
  onPages,
  templates,
  language,
  itemId,
  projectId,
  craft = false,
  poemForm,
  changesInMargin = false,
}: EditorProps) {
  const helpId = useId();
  const listId = `${useId()}-tools`;
  const mentionListId = `${useId()}-names`;
  const linkListId = `${useId()}-links`;
  const writing = useWritingPrefs();
  const smart = kind === 'poem' ? writing.smartPoems : writing.smartProse;
  // The style check's word lists are English. A project with no language is English.
  const english = (language ?? 'en').split('-')[0] === 'en';
  // Harper checks English prose. A poem's and a script's lines keep the browser's spell check.
  const grammarForm = english && kind === 'prose';
  const grammar = useGrammarPrefs().on && grammarForm;
  const editor = useEditor(
    {
      extensions: [
        ...EXTENSIONS[kind](doc, { itemId: itemId ?? null, listId: linkListId }),
        ...(smart ? [SmartPunctuation] : []),
        ...(kind === 'script'
          ? []
          : [TextShortcuts.configure({ typos: english && kind === 'prose', curly: smart })]),
        FocusTools,
        ClickBelow,
        CaretBlock,
        TypingState,
        HeldSelection,
        ReadAloudMark,
        AliasPreview,
        CraftSwitch.configure({ itemId }),
        StyleCheck.configure({ form: kind, english }),
        CodexNames,
        ContinuityCheck.configure({ itemId, english }),
        ...(grammarForm ? [GrammarCheck.configure({ itemId, language })] : []),
        // The tagger reads English only.
        ...(english ? [PartsOfSpeech] : []),
        AuthorshipCount.configure({ projectId: projectId ?? null }),
        ...(kind === 'script' ? [] : [ImageInput.configure({ projectId: projectId ?? null })]),
        CodexCompletion.configure({ listId: mentionListId }),
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
        WriterKeys.configure({ form: kind, templates }),
        ToolKeys.configure({
          onShortcuts: (e) => {
            openPanel({ editor: e, panel: 'shortcuts', anchor: 'caret' });
          },
          onToolFocus: focusTools,
        }),
      ],
      // Poems run no input rules, so "1." or "- " stays as typed. Smart punctuation turns on its rules and
      // the writer's text shortcuts.
      enableInputRules: kind === 'prose' ? true : smart ? ['typography', 'textShortcuts'] : false,
      enablePasteRules: kind === 'prose',
      // The tool surfaces read editor state on their own, so a keystroke does not re-render this tree.
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: editorAttributes(label, kind, helpId, { showAi: writing.showAiText, grammar }),
        // Room for the sticky toolbar above the caret, and for the phone keyboard bar under it.
        scrollMargin: { top: 56, bottom: 72, left: 0, right: 0 },
      },
    },
    [doc, kind, smart, language, projectId],
  );

  // A rename changes the editor's accessible name at once, without reopening the item.
  // The "Show AI text" and grammar switches also change the attributes at once.
  const namedAs = useRef({ label, showAi: writing.showAiText, grammar });
  useEffect(() => {
    const showAi = writing.showAiText;
    const was = namedAs.current;
    if (editor.isDestroyed || (was.label === label && was.showAi === showAi && was.grammar === grammar))
      return;
    namedAs.current = { label, showAi, grammar };
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: editorAttributes(label, kind, helpId, { showAi, grammar }),
      },
    });
  }, [editor, label, kind, helpId, writing.showAiText, grammar]);

  // Viewing mode (Phase 19, Task A1) makes the text read only. Each tool reads the editable state, so an
  // empty transaction lets them see the change.
  const viewing = useTracking().viewing;
  useEffect(() => {
    if (editor.isDestroyed || editor.isEditable === !viewing) return;
    editor.setEditable(!viewing, false);
    editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false));
  }, [editor, viewing]);

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

  // The text takes the focus when its item opens. A setting that builds the editor again, such as the
  // language, leaves the focus where it was, so a writer in the details panel stays there.
  const focused = useRef(focusOnOpen);
  useEffect(() => {
    // A link to a heading opens its item at the heading (Phase 19, Task F1). Else the item opens at the
    // writer's last place on this device (Task A2), else at the end of the text.
    const linked = itemId !== undefined && takeLinkAnchor(itemId, editor);
    if (focused.current && !linked) {
      if (itemId !== undefined && restorePlace(itemId, editor)) {
        editor.commands.focus();
        requestAnimationFrame(() => {
          if (!editor.isDestroyed) scrollToCaret(editor.view);
        });
      } else editor.commands.focus('end');
    }
    const onFocus = () => {
      focused.current = true;
    };
    const onBlur = () => {
      focused.current = false;
    };
    editor.on('focus', onFocus);
    editor.on('blur', onBlur);
    return () => {
      editor.off('focus', onFocus);
      editor.off('blur', onBlur);
    };
    // The item id of an editor never changes: the pane keys the editor by its item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Print (Task A5): the print sheet in editor.css prints only the open editor's page. In a split view the
  // active pane is the open one.
  const printRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = () => {
      const active = getActiveEditor()?.editor;
      if (active !== undefined && active !== editor) return;
      printRoot.current?.setAttribute('data-vlo-print-root', '');
      document.documentElement.setAttribute('data-vlo-printing', '');
    };
    const after = () => {
      printRoot.current?.removeAttribute('data-vlo-print-root');
      document.documentElement.removeAttribute('data-vlo-printing');
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, [editor]);

  // On a phone with its keyboard open, the text takes the screen and the toolbar sits on the keyboard.
  useEffect(() => watchPhoneTyping(editor), [editor]);

  // Keeps the place after a 1 s pause, when the text loses focus, when the tab hides and when it closes.
  useEffect(() => {
    if (itemId === undefined) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      savePlace(itemId, editor);
    };
    const later = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, PLACE_DELAY_MS);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden' && timer) save();
    };
    editor.on('selectionUpdate', later);
    editor.on('blur', save);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      if (timer) save();
      editor.off('selectionUpdate', later);
      editor.off('blur', save);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
    };
  }, [editor, itemId]);

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
  // Page look (Task A3) can show the text in a screen font of its own, also on this device only.
  const stack = fontStack(writing.comfortFont ? COMFORT_FONT : (writing.screenFont ?? font), BASE_STACK);
  const rootStyle = {
    '--font-manuscript': stack,
    '--vlo-letter-spacing': `${String(writing.letterSpacing)}em`,
    '--vlo-word-spacing': `${String(writing.wordSpacing)}em`,
    '--vlo-line-height': String(writing.lineHeight),
  } as CSSProperties;
  const layoutKey = [
    stack,
    writing.letterSpacing,
    writing.wordSpacing,
    writing.lineHeight,
    writing.paragraphs,
  ].join('|');

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)] gap-3"
      data-vlo-editor=""
      data-paragraphs={writing.paragraphs}
      style={rootStyle}
    >
      {/* The toolbar, the find bar and the read aloud bar stay at the top while the text scrolls. */}
      <div className="sticky top-0 z-10 -mx-1 grid bg-bg" data-vlo-keyboard-bar="">
        <Toolbar editor={editor} kind={kind} templates={templates} />
        {find?.editor === editor && <FindBar editor={editor} request={find} itemId={itemId} />}
        <ReadAloudBar editor={editor} />
        {english && <PosLegend />}
        <CursorNote editor={editor} itemId={itemId} />
        {kind === 'prose' && <PasteNotice editor={editor} />}
      </div>
      <div ref={printRoot} className="contents">
        <PageFrame
          editor={editor}
          format={page}
          sheet={sheet}
          zoom={zoom}
          layoutKey={layoutKey}
          onPages={onPages}
        >
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
      </div>
      <ChangesList editor={editor} inMargin={changesInMargin} />
      {kind === 'prose' && <BlockHandle editor={editor} />}
      <SelectionMenu editor={editor} form={kind} templates={templates} />
      <SlashMenuList editor={editor} listId={listId} />
      <MentionMenuList editor={editor} listId={mentionListId} />
      {kind === 'prose' && <LinkMenuList editor={editor} listId={linkListId} />}
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
