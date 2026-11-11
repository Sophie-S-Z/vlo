import type { Editor as TiptapEditor } from '@tiptap/react';
import { Settings2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useManuscript } from '@/features/editor/manuscript';
import { rangeWords } from '@/features/editor/stats/stats';
import { countUnit, type CountUnit } from '@/lib/wordcount';
import { Button } from '@/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { Switch } from '@/ui/switch';
import { METRIC_LABEL, METRICS, setAnalysisPrefs, useAnalysisPrefs, type Metric } from './analysisPrefs';
import { statsInWorker } from './analysisClient';
import { mappedText } from './editorText';
import { durationLabel, type FullStats } from './stats';
import type { EditorForm } from '@/features/library/templates';

/*
 * The stats bar: a quiet line of counts under the writing. It counts in the analysis worker after a pause
 * in typing, so a keystroke never waits, and the numbers change with no motion (principle 1).
 */

/** The pause after a change before the bar counts again, in ms. */
export const BAR_DELAY_MS = 700;

const numbers = new Intl.NumberFormat();

/** The name of a count in the settings. Chinese and Japanese writing counts characters (F38). */
function metricLabel(metric: Metric, unit: CountUnit): string {
  if (unit === 'words') return METRIC_LABEL[metric];
  return metric === 'words'
    ? 'Characters'
    : metric === 'characters'
      ? 'All characters'
      : METRIC_LABEL[metric];
}

export function metricText(
  metric: Metric,
  stats: FullStats,
  kind: EditorForm,
  unit: CountUnit = 'words',
): string {
  const plural = (n: number, one: string, many: string) => `${numbers.format(n)} ${n === 1 ? one : many}`;
  switch (metric) {
    case 'words':
      return plural(stats.words, unit.slice(0, -1), unit);
    case 'characters':
      return unit === 'words'
        ? plural(stats.characters, 'character', 'characters')
        : `${numbers.format(stats.characters)} in all`;
    case 'charactersNoSpaces':
      return `${numbers.format(stats.charactersNoSpaces)} without spaces`;
    case 'sentences':
      return plural(stats.sentences, 'sentence', 'sentences');
    case 'paragraphs':
      return kind === 'poem'
        ? plural(stats.paragraphs, 'line', 'lines')
        : plural(stats.paragraphs, 'paragraph', 'paragraphs');
    case 'reading':
      return `${durationLabel(stats.readingMinutes)} to read`;
    case 'speaking':
      return `${durationLabel(stats.speakingMinutes)} aloud`;
    case 'grade':
      return stats.readability ? `grade ${String(stats.readability.grade)}` : 'grade none';
    case 'ease':
      return stats.readability ? `ease ${String(Math.round(stats.readability.fleschEase))}` : 'ease none';
    case 'pages': {
      const pages = Math.round(stats.pagesSingle * 10) / 10;
      return `${String(pages)} ${pages === 1 ? 'page' : 'pages'}`;
    }
  }
}

interface StatsBarProps {
  editor: TiptapEditor;
  kind: EditorForm;
}

export function StatsBar({ editor, kind }: StatsBarProps) {
  const prefs = useAnalysisPrefs();
  const language = useManuscript()?.language;
  const unit = countUnit(language);
  const [stats, setStats] = useState<FullStats | null>(null);
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState(false);
  const settingsId = useId();

  useEffect(() => {
    if (!prefs.bar) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let current = true;
    const count = () => {
      timer = null;
      if (editor.isDestroyed) return;
      statsInWorker(mappedText(editor.state.doc).text, kind, language).then(
        (next) => {
          if (current) {
            setStats(next);
            setFailed(false);
          }
        },
        () => {
          if (current) setFailed(true);
        },
      );
    };
    const later = (delay = BAR_DELAY_MS) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(count, delay);
    };
    const select = () => {
      const { from, to, empty } = editor.state.selection;
      setSelected(empty ? 0 : rangeWords(editor.state.doc, from, to, language));
    };
    later(0);
    const onUpdate = () => {
      later();
    };
    editor.on('update', onUpdate);
    editor.on('selectionUpdate', select);
    return () => {
      current = false;
      if (timer) clearTimeout(timer);
      editor.off('update', onUpdate);
      editor.off('selectionUpdate', select);
    };
  }, [editor, kind, prefs.bar, language]);

  if (!prefs.bar) return null;
  // An empty item shows only its count, not "none to read" and "grade none".
  const metrics = stats?.characters === 0 ? (['words'] as const) : prefs.metrics;
  const parts = stats ? metrics.map((metric) => metricText(metric, stats, kind, unit)) : [];
  if (selected > 0) parts.push(`${numbers.format(selected)} selected`);

  return (
    <div
      className="vlo-stats-bar sticky bottom-0 z-10 mt-6 flex items-center justify-between gap-2 border-t border-rule bg-bg/95 py-1.5 text-xs text-muted"
      role="group"
      aria-label="Writing statistics"
    >
      <p className="min-w-0 truncate tabular-nums">
        {failed ? 'Vlo could not count this item.' : parts.length > 0 ? parts.join(' · ') : 'Counting.'}
      </p>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-7 shrink-0 px-2"
            aria-label="Choose the counts in the stats bar"
          >
            <Settings2 aria-hidden="true" className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="grid gap-3 text-sm">
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 font-medium">Counts in the bar</legend>
            {METRICS.map((metric) => (
              <label key={metric} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.metrics.includes(metric)}
                  onChange={(event) => {
                    const on = event.target.checked;
                    setAnalysisPrefs({
                      metrics: on ? [...prefs.metrics, metric] : prefs.metrics.filter((m) => m !== metric),
                    });
                  }}
                />
                {metricLabel(metric, unit)}
              </label>
            ))}
          </fieldset>
          <div className="flex items-center justify-between gap-3 border-t border-rule pt-3">
            <label htmlFor={settingsId}>Show the stats bar</label>
            <Switch
              id={settingsId}
              checked={prefs.bar}
              onCheckedChange={(bar) => {
                setAnalysisPrefs({ bar });
              }}
            />
          </div>
          <p className="text-xs text-muted">Insights, above the text, has every count and the checks.</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
