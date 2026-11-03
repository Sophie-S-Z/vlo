import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { History, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activeMinutesOf, watchActiveMinutes } from '@/features/snapshots/autoSnapshot';
import { latestSnapshotText, takeSnapshot } from '@/features/snapshots/snapshots';
import { clock } from '@/lib/clock';
import type { Item, PageFormat } from '@/lib/db';
import { Button } from '@/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/ui/dialog';
import { Editor } from './Editor';
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
  /** Changes the project's font or page format. */
  onSettings?: (change: { font?: FontValue; page?: PageFormat }) => void;
}

/** The open item: its editor, save status and counts. Only this item's Yjs document loads. Key it by item id. */
export function EditorPane({
  item,
  kind,
  width,
  snapshotEveryMinutes,
  font: storedFont,
  page: storedPage,
  onSettings,
}: EditorPaneProps) {
  const state = useItemDoc(item.id);
  const [save, setSave] = useState<SaveState>('saved');
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  // The latest editor document. Keeping a reference costs nothing per keystroke; text is read after the pause.
  const latest = useRef<ProseMirrorNode | null>(null);
  const { id, projectId } = item;
  const target = useMemo(() => ({ id, projectId }), [id, projectId]);
  const [historyOpen, setHistoryOpen] = useState(false);
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

  const open = state.open;
  useEffect(() => {
    if (!open) return;
    return trackSaves({
      doc: open.doc,
      ignoreOrigins: [open.persistence, TAB_ORIGIN],
      confirm: () => open.confirmSaved(clock.now()),
      onPause: async () => {
        const doc = latest.current;
        if (doc) await writeItemText(target, docText(doc, kind), kind, docBody(doc, kind));
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

  const onEditor = useCallback((next: TiptapEditor | null) => {
    setEditor(next);
  }, []);

  const font = cleanFontValue(storedFont) ?? DEFAULT_FONT;
  const page = cleanPageFormat(storedPage);
  const { zoom } = useWritingPrefs();
  const [pages, setPages] = useState<number | null>(null);
  const manuscript = useMemo<ManuscriptSettings>(
    () => ({
      projectId: item.projectId,
      font,
      page,
      setFont: (next) => onSettings?.({ font: next }),
    }),
    [item.projectId, font, page, onSettings],
  );
  // The column widens with the zoom, so a line keeps about the same number of words.
  const maxWidth =
    page === 'pageless'
      ? `calc(${String(width)}ch * ${String(zoom / 100)})`
      : `${String(PAGE_SIZES[page].width * (zoom / 100))}px`;

  return (
    <ManuscriptContext value={manuscript}>
      <article className="mx-auto w-full" style={{ maxWidth }}>
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-2xl font-semibold [overflow-wrap:anywhere]">{item.title}</h2>
          <div className="flex items-center gap-4">
            <WordCount words={item.wordCount} lines={kind === 'poem' ? (item.lineCount ?? 0) : undefined} />
            <SaveStatus state={save} />
            <PageControl
              page={page}
              onPage={(next) => onSettings?.({ page: next })}
              zoom={zoom}
              onZoom={(next) => {
                setWritingPrefs({ zoom: next });
              }}
              pages={pages}
            />
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" disabled={!editor || !open}>
                  <History aria-hidden="true" className="size-4" />
                  History
                </Button>
              </DialogTrigger>
              <DialogContent className="top-0 right-0 left-auto h-dvh max-h-dvh w-[min(36rem,calc(100vw-1rem))] max-w-none translate-x-0 translate-y-0 content-start rounded-none border-y-0 border-r-0">
                <DialogClose asChild>
                  <Button variant="ghost" aria-label="Close history" className="absolute top-4 right-4 px-3">
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
            Another tab has this item open in an older version of Vlo. Reload that tab before you write there.
            The older version cannot show footnotes and the new colors and styles, and it can remove them.
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
            focusOnOpen
            onEditor={onEditor}
            font={font}
            page={page}
            zoom={zoom}
            onPages={setPages}
          />
        )}
      </article>
    </ManuscriptContext>
  );
}
