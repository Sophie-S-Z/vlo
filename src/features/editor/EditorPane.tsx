import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { ChartNoAxesColumn, History, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatsBar } from '@/features/analysis/StatsBar';
import { setCraftPoem, useCraftOf } from '@/features/craft/craftStore';
import { activeMinutesOf, watchActiveMinutes } from '@/features/snapshots/autoSnapshot';
import { latestSnapshotText, takeSnapshot } from '@/features/snapshots/snapshots';
import { clock } from '@/lib/clock';
import type { Item, PageFormat, ScriptStyle, Template } from '@/lib/db';
import { cleanLanguage, DEFAULT_LANGUAGE } from '@/lib/language';
import { countUnit } from '@/lib/wordcount';
import { SceneBackdrop } from '@/features/scenes/SceneBackdrop';
import { ScenePicker } from '@/features/scenes/ScenePicker';
import { SoundControl } from '@/features/sound/SoundPanel';
import { cleanScene, NO_SCENE, type SceneChoice } from '@/features/scenes/scenes';
import { Button } from '@/ui/button';
import { SectionGuide } from '@/features/modes/SectionGuide';
import { ICON_BUTTON } from '@/ui/tip';
import { Segmented } from '@/ui/segmented';
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
import { docBody, docText, refreshItemText, writeItemText } from './itemText';
import { ManuscriptContext, type ManuscriptSettings } from './manuscript';
import { PageControl } from './PageControl';
import { SaveStatus } from './SaveStatus';
import { trackSaves, type SaveState } from './saveTracker';
import { TAB_ORIGIN } from './tabSync';
import { useItemDoc } from './useItemDoc';
import { WordCount } from './WordCount';
import { setWritingPrefs, useWritingPrefs } from './writingPrefs';
import type { EditorForm } from '@/features/library/templates';

// Insights (statistics, AI check, originality) loads only when the writer opens it.
// The reference list needs the citation styles, so it loads only when a References page opens (Phase 17).
const ReferencesPage = lazy(async () => ({
  default: (await import('@/features/modes/ReferencesPage')).ReferencesPage,
}));
const AnalysisPanel = lazy(async () => ({
  default: (await import('@/features/analysis/AnalysisPanel')).AnalysisPanel,
}));

// The history panel and the diff library load only when the writer opens History.
const VersionsPanel = lazy(async () => ({
  default: (await import('@/features/versions/VersionsPanel')).VersionsPanel,
}));
const HistoryPanel = lazy(async () => ({
  default: (await import('@/features/snapshots/HistoryPanel')).HistoryPanel,
}));

interface EditorPaneProps {
  item: Item;
  kind: EditorForm;
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
  /** The project's script layout (F63), as stored. */
  scriptStyle?: ScriptStyle | undefined;
  /** Changes the project's font, page format, scene, language or script layout. */
  onSettings?: (change: {
    font?: FontValue;
    page?: PageFormat;
    scene?: SceneChoice;
    language?: string;
    scriptStyle?: ScriptStyle;
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
  scriptStyle = 'screenplay',
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
  const [historyTab, setHistoryTab] = useState<'snapshots' | 'versions'>('snapshots');
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

  // The Craft switch of the open poem (spec 8.3). Only a poem of a poetry collection has one.
  const craftable = kind === 'poem' && (templates?.includes('poetry') ?? false);
  const craft = item.craft === true;
  const stored = useCraftOf(id);
  const labels = craftable && (stored ?? craft);
  useEffect(() => {
    if (!craftable) return;
    setCraftPoem(id, craft);
    return () => {
      setCraftPoem(id, null);
    };
  }, [craftable, id, craft]);

  // A save reads the language when it runs, so a change of language does not end the save tracker.
  const languageNow = useRef(language);
  useEffect(() => {
    languageNow.current = language;
  }, [language]);

  // The last tab may have closed in the save pause, so the open item brings its text copy and counts up to date.
  useEffect(() => {
    if (editor)
      void refreshItemText(target, editor.state.doc, kind, languageNow.current).catch(() => undefined);
  }, [editor, target, kind]);

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
        const match = findWords(next.state.doc, words.words, words.block);
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
          data-script-style={kind === 'script' ? scriptStyle : undefined}
        >
          {/* One row (Phase 17 decision S2): the title, then its counts and the item's quiet icon tools. */}
          <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <h2 className="min-w-0 font-display text-2xl font-semibold [overflow-wrap:anywhere]">
              {item.title}
            </h2>
            {item.role !== 'references' && (
              <div className="flex flex-wrap items-center justify-end gap-x-3">
                <WordCount
                  words={item.wordCount}
                  unit={countUnit(language)}
                  lines={kind === 'poem' ? (item.lineCount ?? 0) : undefined}
                />
                <SaveStatus state={save} />
                <div className="-mr-2 flex flex-wrap items-center">
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
                    script={
                      kind === 'script'
                        ? { style: scriptStyle, onStyle: (next) => onSettings?.({ scriptStyle: next }) }
                        : undefined
                    }
                  />
                  {!beside && (
                    <>
                      <ScenePicker scene={scene} onScene={(next) => onSettings?.({ scene: next })} />
                      <SoundControl scene={scene} />
                    </>
                  )}
                  <Dialog open={insightsOpen} onOpenChange={setInsightsOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        className={ICON_BUTTON}
                        data-tip="Insights"
                        data-tool="insights"
                        disabled={!editor}
                      >
                        <ChartNoAxesColumn aria-hidden="true" className="size-4" />
                        <span className="sr-only">Insights</span>
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
                      <Button
                        variant="ghost"
                        className={ICON_BUTTON}
                        data-tip="History"
                        data-tool="history"
                        data-tip-align="end"
                        disabled={!editor || !open}
                      >
                        <History aria-hidden="true" className="size-4" />
                        <span className="sr-only">History</span>
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
                          {historyTab === 'snapshots'
                            ? `Vlo saves a snapshot of ${item.title} after every ${String(snapshotEveryMinutes)} minutes of writing. Restoring one saves the current text first.`
                            : `Named versions of ${item.title}. A switch keeps the text in the editor as a version.`}
                        </DialogDescription>
                      </div>
                      <Segmented
                        label="Show"
                        value={historyTab}
                        options={[
                          { value: 'snapshots', label: 'Snapshots' },
                          { value: 'versions', label: 'Versions' },
                        ]}
                        onChange={setHistoryTab}
                      />
                      {editor && open && (
                        <Suspense fallback={<p className="text-muted">Loading {historyTab}.</p>}>
                          {historyTab === 'snapshots' ? (
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
                          ) : (
                            <VersionsPanel
                              item={item}
                              kind={kind}
                              editor={editor}
                              doc={open.doc}
                              onSwitched={(message) => {
                                setNotice(message);
                                setHistoryOpen(false);
                              }}
                            />
                          )}
                        </Suspense>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            )}
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
          {item.role === 'references' ? (
            <Suspense fallback={<p className="text-muted">Loading the sources.</p>}>
              <ReferencesPage
                projectId={item.projectId}
                language={language ?? DEFAULT_LANGUAGE}
                title={item.title}
              />
            </Suspense>
          ) : (
            <SectionGuide guide={item.guide} words={item.wordCount} range={item.words} />
          )}
          {state.status === 'ready' && item.role !== 'references' && (
            <Editor
              key={item.id}
              doc={state.open.doc}
              kind={kind}
              label={item.title}
              itemId={item.id}
              projectId={item.projectId}
              focusOnOpen={!beside}
              craft={labels}
              poemForm={item.form}
              onEditor={onEditor}
              font={font}
              page={page}
              zoom={zoom}
              onPages={setPages}
              templates={templates}
              language={language}
            />
          )}
          {state.status === 'ready' && editor && item.role !== 'references' && (
            <StatsBar editor={editor} kind={kind} />
          )}
        </article>
      </div>
    </ManuscriptContext>
  );
}
