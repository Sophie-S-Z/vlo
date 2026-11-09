import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { ChartNoAxesColumn, History, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatsBar } from '@/features/analysis/StatsBar';
import { getCraft, setCraftItem, useCraft } from '@/features/craft/craftStore';
import { activeMinutesOf, watchActiveMinutes } from '@/features/snapshots/autoSnapshot';
import { latestSnapshotText, takeSnapshot } from '@/features/snapshots/snapshots';
import { clock } from '@/lib/clock';
import type { Item, PageFormat, Template } from '@/lib/db';
import { cleanLanguage } from '@/lib/language';
import { countUnit } from '@/lib/wordcount';
import { SceneBackdrop } from '@/features/scenes/SceneBackdrop';
import { ScenePicker } from '@/features/scenes/ScenePicker';
import { SoundControl } from '@/features/sound/SoundPanel';
import { cleanScene, NO_SCENE, type SceneChoice } from '@/features/scenes/scenes';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/ui/dialog';
import { takeWordsToShow } from './commands/editorBus';
import { Editor } from './Editor';
import { findWords } from './extensions/findReplace';
import { cleanFontValue, DEFAULT_FONT, type FontValue } from './format/fonts';
import { cleanPageFormat, PAGE_SIZES } from './format/page';
import { docBody, docText, writeItemText } from './itemText';
import { ManuscriptContext, type ManuscriptSettings } from './manuscript';
import { PageControl } from './PageControl';
import { SaveStatus } from './SaveStatus';
import { trackSaves, type SaveState } from './saveTracker';
import { TAB_ORIGIN } from './tabSync';
import { useItemDoc } from './useItemDoc';
import { WordCount } from './WordCount';
import { setWritingPrefs, useWritingPrefs } from './writingPrefs';

// Insights (statistics, AI check, originality) loads only when the writer opens it.
const AnalysisPanel = lazy(async () => ({
  default: (await import('@/features/analysis/AnalysisPanel')).AnalysisPanel,
}));

// The history panel and the diff library load only when the writer opens History.
const HistoryPanel = lazy(async () => ({
  default: (await import('@/features/snapshots/HistoryPanel')).HistoryPanel,
}));

interface EditorPaneProps {
  item: Item;
  kind: 'prose' | 'poem';
  /** The manuscript column width in ch. */
  width: number;
  /** Active minutes between automatic snapshots. */
  snapshotEveryMinutes: number;
  /** The project font, as stored. */
  font?: string | undefined;
  /** The project page format, as stored. */
  page?: PageFormat | undefined;
  /** The project scene, as stored. */
  scene?: string | undefined;
  /** The project language, as stored (F38). */
  language?: string | undefined;
  /** Changes the project's font, page format or scene. */
  onSettings?: (change: {
    font?: FontValue;
    page?: PageFormat;
    scene?: SceneChoice;
    language?: string;
  }) => void;
  /** The project's templates, for the tools that only some templates offer. */
  templates?: readonly Template[] | undefined;
  /** The right pane of the split view (F39): no scene or sound, and the text waits for the writer to click it. */
  beside?: boolean;
}

/** The open item: its editor, save status and counts. Only this item's Yjs document loads. Key it by item id. */
export function EditorPane({
  item,
  kind,
  width,
  snapshotEveryMinutes,
  font: storedFont,
  page: storedPage,
  scene: storedScene,
  language: storedLanguage,
  onSettings,
  templates,
  beside = false,
}: EditorPaneProps) {
  const state = useItemDoc(item.id);
  const language = cleanLanguage(storedLanguage);
  const [save, setSave] = useState<SaveState>('saved');
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  // The latest editor document. Keeping a reference costs nothing per keystroke; text is read after the pause.
  const latest = useRef<ProseMirrorNode | null>(null);
  const { id, projectId } = item;
  const target = useMemo(() => ({ id, projectId }), [id, projectId]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  // The words that a report asked to show. They take the selection after Insights closes.
  const showRange = useRef<{ from: number; to: number } | null>(null);
  const [notice, setNotice] = useState('');
  const readText = useCallback(() => (latest.current ? docText(latest.current, kind) : null), [kind]);
  const currentText = useCallback(() => readText() ?? '', [readText]);

  useEffect(() => {
    if (!editor) return;
    latest.current = editor.state.doc;
    const onUpdate = () => {
      latest.current = editor.state.doc;
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor]);

  // The Craft switch of the open poem (spec 8.3). Only a poem of a poetry collection has one. In a split
  // view the switch acts on the pane whose text has focus, and each poem shows its own labels.
  const craftable = kind === 'poem' && (templates?.includes('poetry') ?? false);
  const craft = item.craft === true;
  const craftState = useCraft();
  const labels = craftable && (craftState.itemId === id ? craftState.on : craft);
  useEffect(() => {
    if (!beside || getCraft().itemId === id) setCraftItem(craftable ? id : null, craft);
  }, [beside, craftable, id, craft]);
  useEffect(() => {
    if (!editor) return;
    const take = () => {
      setCraftItem(craftable ? id : null, craft);
    };
    editor.on('focus', take);
    return () => {
      editor.off('focus', take);
    };
  }, [editor, craftable, id, craft]);
  useEffect(
    () => () => {
      if (getCraft().itemId === id) setCraftItem(null, false);
    },
    [id],
  );

  // A save reads the language when it runs, so a change of language does not end the save tracker.
  const languageNow = useRef(language);
  useEffect(() => {
    languageNow.current = language;
  }, [language]);

  const open = state.open;
  useEffect(() => {
    if (!open) return;
    return trackSaves({
      doc: open.doc,
      ignoreOrigins: [open.persistence, TAB_ORIGIN],
      confirm: () => open.confirmSaved(clock.now()),
      onPause: async () => {
        const doc = latest.current;
        if (doc)
          await writeItemText(target, docText(doc, kind), kind, docBody(doc, kind), languageNow.current);
      },
      onState: setSave,
    });
  }, [open, kind, target]);

  useEffect(() => {
    if (!open) return;
    return watchActiveMinutes({
      doc: open.doc,
      active: activeMinutesOf(target.id),
      ignoreOrigins: [open.persistence, TAB_ORIGIN],
      everyMinutes: snapshotEveryMinutes,
      readText,
      latestText: () => latestSnapshotText(target.id),
      save: (text) => takeSnapshot(target, open.doc, text),
      onError: () => {
        setNotice('Vlo could not save an automatic snapshot. It tries again at your next pause.');
      },
    });
  }, [open, snapshotEveryMinutes, readText, target]);

  const onEditor = useCallback(
    (next: TiptapEditor | null) => {
      setEditor(next);
      // Another screen, such as Feedback, can ask this editor to select some words when it opens. The
      // selection waits for the editor's own focus at its first render.
      const words = next && !beside ? takeWordsToShow(id) : null;
      if (!next || words === null) return;
      const show = () => {
        const match = findWords(next.state.doc, words);
        if (match) next.chain().focus().setTextSelection(match).scrollIntoView().run();
        else setNotice('The words of the reply are not in this text now.');
      };
      if (next.isInitialized) show();
      else next.once('create', show);
    },
    [beside, id],
  );

  const font = cleanFontValue(storedFont) ?? DEFAULT_FONT;
  const page = cleanPageFormat(storedPage);
  // Only the main pane shows the scene.
  const scene = beside ? NO_SCENE : cleanScene(storedScene);
  const { zoom } = useWritingPrefs();
  const [pages, setPages] = useState<number | null>(null);
  const manuscript = useMemo<ManuscriptSettings>(
    () => ({
      projectId: item.projectId,
      font,
      page,
      language,
      setFont: (next) => onSettings?.({ font: next }),
    }),
    [item.projectId, font, page, language, onSettings],
  );
  // The column widens with the zoom, so a line keeps about the same number of words.
  const column =
    page === 'pageless'
      ? `${String(width)}ch * ${String(zoom / 100)}`
      : `${String(PAGE_SIZES[page].width * (zoom / 100))}px`;
  // On a scene the page is a card with its own padding, so the column keeps its text width.
  const maxWidth = scene === NO_SCENE ? `calc(${column})` : `calc(${column} + 2 * var(--vlo-stage-pad))`;

  return (
    <ManuscriptContext value={manuscript}>
      <div
        className={cn(scene !== NO_SCENE && 'vlo-scene-stage')}
        data-scene={scene === NO_SCENE ? undefined : scene}
      >
        {scene !== NO_SCENE && <SceneBackdrop scene={scene} />}
        <article
          className={cn('mx-auto w-full', scene !== NO_SCENE && 'vlo-scene-page')}
          style={{ maxWidth }}
        >
          <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="font-display text-2xl font-semibold [overflow-wrap:anywhere]">{item.title}</h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-4">
              <WordCount
                words={item.wordCount}
                unit={countUnit(language)}
                lines={kind === 'poem' ? (item.lineCount ?? 0) : undefined}
              />
              <SaveStatus state={save} />
              <PageControl
                page={page}
                onPage={(next) => onSettings?.({ page: next })}
                zoom={zoom}
                onZoom={(next) => {
                  setWritingPrefs({ zoom: next });
                }}
                pages={pages}
                language={language}
                onLanguage={(next) => onSettings?.({ language: next })}
              />
              {!beside && (
                <>
                  <ScenePicker scene={scene} onScene={(next) => onSettings?.({ scene: next })} />
                  <SoundControl scene={scene} />
                </>
              )}
              <Dialog open={insightsOpen} onOpenChange={setInsightsOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" disabled={!editor}>
                    <ChartNoAxesColumn aria-hidden="true" className="size-4" />
                    <span className="max-sm:sr-only">Insights</span>
                  </Button>
                </DialogTrigger>
                <DialogContent
                  className="top-0 right-0 left-auto h-dvh max-h-dvh w-[min(36rem,calc(100vw-1rem))] max-w-none translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none border-y-0 border-r-0"
                  onCloseAutoFocus={(event) => {
                    const range = showRange.current;
                    showRange.current = null;
                    if (!range || !editor || editor.isDestroyed) return;
                    event.preventDefault();
                    editor.chain().focus().setTextSelection(range).scrollIntoView().run();
                  }}
                >
                  <DialogClose asChild>
                    <Button
                      variant="ghost"
                      aria-label="Close insights"
                      className="absolute top-4 right-4 px-3"
                    >
                      <X aria-hidden="true" className="size-4" />
                    </Button>
                  </DialogClose>
                  <div className="grid gap-1 pr-10">
                    <DialogTitle>Insights</DialogTitle>
                    <DialogDescription>
                      Statistics, readability, keywords, an AI writing check and an originality check for{' '}
                      {item.title}. Everything except the web search runs on this device.
                    </DialogDescription>
                  </div>
                  {editor && (
                    <Suspense fallback={<p className="text-muted">Loading insights.</p>}>
                      <AnalysisPanel
                        editor={editor}
                        kind={kind}
                        itemId={item.id}
                        projectId={item.projectId}
                        onShow={(from, to) => {
                          showRange.current = { from, to };
                          setInsightsOpen(false);
                        }}
                      />
                    </Suspense>
                  )}
                </DialogContent>
              </Dialog>
              <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" disabled={!editor || !open}>
                    <History aria-hidden="true" className="size-4" />
                    <span className="max-sm:sr-only">History</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="top-0 right-0 left-auto h-dvh max-h-dvh w-[min(36rem,calc(100vw-1rem))] max-w-none translate-x-0 translate-y-0 content-start rounded-none border-y-0 border-r-0">
                  <DialogClose asChild>
                    <Button
                      variant="ghost"
                      aria-label="Close history"
                      className="absolute top-4 right-4 px-3"
                    >
                      <X aria-hidden="true" className="size-4" />
                    </Button>
                  </DialogClose>
                  {/* Outside the lazy panel, so the dialog has its name while the panel loads. */}
                  <div className="grid gap-1 pr-10">
                    <DialogTitle>History</DialogTitle>
                    <DialogDescription>
                      Vlo saves a snapshot of {item.title} after every {snapshotEveryMinutes} minutes of
                      writing. Restoring one saves the current text first.
                    </DialogDescription>
                  </div>
                  {editor && open && (
                    <Suspense fallback={<p className="text-muted">Loading history.</p>}>
                      <HistoryPanel
                        item={item}
                        kind={kind}
                        editor={editor}
                        doc={open.doc}
                        currentText={currentText}
                        onRestored={(message) => {
                          setNotice(message);
                          setHistoryOpen(false);
                        }}
                      />
                    </Suspense>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </header>
          <p role="status" className={notice ? 'mb-3 text-sm text-muted' : 'sr-only'}>
            {notice}
          </p>
          {state.otherTabs > 0 && (
            <p className="mb-3 rounded-md border border-rule bg-surface px-3 py-2 text-sm">
              This item is open in another tab. Changes show in both tabs.
            </p>
          )}
          {state.otherVersions.older > 0 && (
            <p role="alert" className="mb-3 rounded-md border border-accent bg-surface px-3 py-2 text-sm">
              Another tab has this item open in an older version of Vlo. Reload that tab before you write
              there. The older version cannot show footnotes and the new colors and styles, and it can remove
              them.
            </p>
          )}
          {state.otherVersions.newer > 0 && (
            <p role="alert" className="mb-3 rounded-md border border-accent bg-surface px-3 py-2 text-sm">
              Another tab has this item open in a newer version of Vlo. Reload this tab to keep writing here.
            </p>
          )}
          {state.status === 'newer' && (
            <p role="alert" className="text-accent-text">
              A newer version of Vlo saved this item. Reload Vlo to open it.
            </p>
          )}
          {state.status === 'error' && (
            <p role="alert" className="text-accent-text">
              Vlo could not open this item. Reload Vlo and try again.
            </p>
          )}
          {state.status === 'ready' && (
            <Editor
              key={item.id}
              doc={state.open.doc}
              kind={kind}
              label={item.title}
              itemId={item.id}
              focusOnOpen={!beside}
              craft={labels}
              onEditor={onEditor}
              font={font}
              page={page}
              zoom={zoom}
              onPages={setPages}
              templates={templates}
              language={language}
            />
          )}
          {state.status === 'ready' && editor && <StatsBar editor={editor} kind={kind} />}
        </article>
      </div>
    </ManuscriptContext>
  );
}
