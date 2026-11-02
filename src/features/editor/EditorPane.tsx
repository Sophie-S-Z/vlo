import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clock } from '@/lib/clock';
import type { Item } from '@/lib/db';
import { Editor } from './Editor';
import { docText, writeItemText } from './itemText';
import { SaveStatus } from './SaveStatus';
import { trackSaves, type SaveState } from './saveTracker';
import { TAB_ORIGIN } from './tabSync';
import { useItemDoc } from './useItemDoc';
import { WordCount } from './WordCount';

interface EditorPaneProps {
  item: Item;
  kind: 'prose' | 'poem';
  /** The manuscript column width in ch. */
  width: number;
}

/** The open item: its editor, save status and counts. Only this item's Yjs document loads. Key it by item id. */
export function EditorPane({ item, kind, width }: EditorPaneProps) {
  const state = useItemDoc(item.id);
  const [save, setSave] = useState<SaveState>('saved');
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  // The latest editor document. Keeping a reference costs nothing per keystroke; text is read after the pause.
  const latest = useRef<ProseMirrorNode | null>(null);
  const { id, projectId } = item;
  const target = useMemo(() => ({ id, projectId }), [id, projectId]);

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
        </div>
      </header>
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
