import type { Editor } from '@tiptap/core';
import { useEffect, useId, useState } from 'react';
import { formatWords } from '@/features/library/format';
import { useActiveEditor } from '../commands/editorBus';
import { docStats, minutesLabel, rangeWords, wordsToday, type TextStats } from './stats';

/*
 * The writing stats in the details panel (plan E4). They follow the open item and update after a short
 * pause in typing, so a keystroke never waits for a count.
 */

const numbers = new Intl.NumberFormat();
/** The pause after a change before the stats count again, in ms. */
const STATS_DELAY_MS = 400;

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{term}</dt>
      <dd className="text-right font-mono">{value}</dd>
    </div>
  );
}

export function WritingStats({ projectId, totalWords }: { projectId: string; totalWords: number }) {
  const titleId = useId();
  const active = useActiveEditor();
  // The counts belong to one editor, so another item never shows the last item's counts.
  const [counted, setCounted] = useState<{ editor: Editor; stats: TextStats } | null>(null);
  const [selection, setSelection] = useState<{ editor: Editor; words: number } | null>(null);
  const [today, setToday] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const { editor, form } = active;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const count = () => {
      timer = null;
      if (editor.isDestroyed) return;
      setCounted({ editor, stats: docStats(editor.state.doc, form) });
    };
    const later = (delay = STATS_DELAY_MS) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(count, delay);
    };
    const select = () => {
      const { from, to, empty } = editor.state.selection;
      setSelection({ editor, words: empty ? 0 : rangeWords(editor.state.doc, from, to) });
    };
    later(0);
    const onUpdate = () => {
      later();
    };
    editor.on('update', onUpdate);
    editor.on('selectionUpdate', select);
    return () => {
      if (timer) clearTimeout(timer);
      editor.off('update', onUpdate);
      editor.off('selectionUpdate', select);
    };
  }, [active]);

  useEffect(() => {
    let current = true;
    void wordsToday(projectId, totalWords).then((words) => {
      if (current) setToday(words);
    });
    return () => {
      current = false;
    };
  }, [projectId, totalWords]);

  const poem = active?.form === 'poem';
  const stats = active && counted?.editor === active.editor ? counted.stats : null;
  const selected = active && selection?.editor === active.editor ? selection.words : 0;
  return (
    <section aria-labelledby={titleId} className="grid gap-2 text-sm">
      <h2 id={titleId} className="font-medium">
        Writing stats
      </h2>
      <dl className="grid gap-1.5">
        {today !== null && <Row term="Written today" value={formatWords(today)} />}
        {stats && (
          <>
            <Row term="Words" value={numbers.format(stats.words)} />
            {selected > 0 && <Row term="Selected" value={formatWords(selected)} />}
            <Row term="Characters" value={numbers.format(stats.characters)} />
            <Row term="Without spaces" value={numbers.format(stats.charactersNoSpaces)} />
            <Row term={poem ? 'Lines' : 'Paragraphs'} value={numbers.format(stats.blocks)} />
            <Row term="Sentences" value={numbers.format(stats.sentences)} />
            <Row
              term="Reading time"
              value={stats.words === 0 ? 'none' : minutesLabel(stats.readingMinutes)}
            />
            <Row term="Read aloud" value={stats.words === 0 ? 'none' : minutesLabel(stats.speakingMinutes)} />
          </>
        )}
      </dl>
      {stats && (
        <p className="text-xs text-muted">
          For this {poem ? 'poem' : 'item'}, without its notes. Written today counts the whole project: words
          added less words removed.
        </p>
      )}
    </section>
  );
}
