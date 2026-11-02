import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { History, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { watchActiveMinutes } from '@/features/snapshots/autoSnapshot';
import { snapshotsOf, takeSnapshot } from '@/features/snapshots/snapshots';
import { clock } from '@/lib/clock';
import type { Item } from '@/lib/db';
import { Button } from '@/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/ui/dialog';
import { Editor } from './Editor';
import { docText, writeItemText } from './itemText';
import { SaveStatus } from './SaveStatus';
import { trackSaves, type SaveState } from './saveTracker';
import { TAB_ORIGIN } from './tabSync';
import { useItemDoc } from './useItemDoc';
import { WordCount } from './WordCount';

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
}

/** The open item: its editor, save status and counts. Only this item's Yjs document loads. Key it by item id. */
export function EditorPane({ item, kind, width, snapshotEveryMinutes }: EditorPaneProps) {
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
        if (latest.current) await writeItemText(target, docText(latest.current, kind), kind);
      },
      onState: setSave,
    });
  }, [open, kind, target]);

  useEffect(() => {
    if (!open) return;
    return watchActiveMinutes({
      doc: open.doc,
      ignoreOrigins: [open.persistence, TAB_ORIGIN],
      everyMinutes: snapshotEveryMinutes,
      readText,
      latestText: async () => (await snapshotsOf(target.id))[0]?.text ?? null,
      save: (text) => takeSnapshot(target, open.doc, text),
    });
  }, [open, snapshotEveryMinutes, readText, target]);

  const onEditor = useCallback((next: TiptapEditor | null) => {
    setEditor(next);
  }, []);

  return (
    <article className="mx-auto w-full" style={{ maxWidth: `${String(width)}ch` }}>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-2xl font-semibold [overflow-wrap:anywhere]">{item.title}</h2>
        <div className="flex items-center gap-4">
          <WordCount words={item.wordCount} lines={kind === 'poem' ? (item.lineCount ?? 0) : undefined} />
          <SaveStatus state={save} />
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
        />
      )}
    </article>
  );
}
