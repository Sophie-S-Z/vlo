import type { Editor as TiptapEditor } from '@tiptap/react';
import { Tabs } from 'radix-ui';
import { useMemo } from 'react';
import { aiOriginWords, mappedText } from './editorText';
import { AiTab } from './panel/AiTab';
import { OriginalityTab } from './panel/OriginalityTab';
import { KeywordTable, StatsTab, useItemStats } from './panel/StatsTab';

/*
 * Insights: the full statistics, keyword density, the AI check and the originality check of the open item.
 * It loads only when the writer opens it. The text is read once, when it opens, so each report names the
 * same words.
 */

interface AnalysisPanelProps {
  editor: TiptapEditor;
  kind: 'prose' | 'poem';
  itemId: string;
  projectId: string;
  /** Closes Insights and selects the words from `from` to `to` of the analysed text. */
  onShow: (from: number, to: number) => void;
}

const TAB =
  'rounded-md px-3 py-1.5 text-sm text-muted data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-sm';

export function AnalysisPanel({ editor, kind, itemId, projectId, onShow }: AnalysisPanelProps) {
  const mapped = useMemo(() => mappedText(editor.state.doc), [editor]);
  const provenance = useMemo(() => aiOriginWords(editor.state.doc), [editor]);
  const { stats, error } = useItemStats(mapped.text, kind);
  const show = (from: number, to: number) => {
    onShow(mapped.at(from), mapped.at(to));
  };
  return (
    <Tabs.Root defaultValue="stats" className="grid gap-4">
      <Tabs.List
        aria-label="Insights"
        className="flex flex-wrap gap-1 rounded-lg border border-rule bg-bg p-1"
      >
        <Tabs.Trigger value="stats" className={TAB}>
          Stats
        </Tabs.Trigger>
        <Tabs.Trigger value="keywords" className={TAB}>
          Keywords
        </Tabs.Trigger>
        <Tabs.Trigger value="ai" className={TAB}>
          AI check
        </Tabs.Trigger>
        <Tabs.Trigger value="originality" className={TAB}>
          Originality
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="stats">
        <StatsTab stats={stats} error={error} kind={kind} onShow={show} />
      </Tabs.Content>
      <Tabs.Content value="keywords" className="grid gap-5">
        {stats ? (
          <>
            <p className="text-sm text-muted">
              Density is the share of all words. Small words such as &quot;the&quot; are left out. A word
              above about 3% can read as repeated.
            </p>
            <KeywordTable caption="Words" rows={stats.keywords} />
            <KeywordTable caption="Two-word phrases" rows={stats.phrases2} />
            <KeywordTable caption="Three-word phrases" rows={stats.phrases3} />
          </>
        ) : (
          <p className="text-muted">{error ? 'Vlo could not count this item.' : 'Counting.'}</p>
        )}
      </Tabs.Content>
      {/* The AI tab stays mounted, so a deep check keeps running when the writer looks at another tab. */}
      <Tabs.Content value="ai" forceMount className="data-[state=inactive]:hidden">
        <AiTab text={mapped.text} provenance={provenance} onShow={show} />
      </Tabs.Content>
      <Tabs.Content value="originality">
        <OriginalityTab text={mapped.text} itemId={itemId} projectId={projectId} onShow={show} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
