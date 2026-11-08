import { useSyncExternalStore } from 'react';
import { safeStorage } from '@/app/preferences';

/*
 * The stats bar under the writing, on this device: whether it shows, and which counts it shows. It is on,
 * with five counts, and the writer can turn it off or pick other counts.
 */

export const METRICS = [
  'words',
  'characters',
  'charactersNoSpaces',
  'sentences',
  'paragraphs',
  'reading',
  'speaking',
  'grade',
  'ease',
  'pages',
] as const;

export type Metric = (typeof METRICS)[number];

export const METRIC_LABEL: Readonly<Record<Metric, string>> = {
  words: 'Words',
  characters: 'Characters',
  charactersNoSpaces: 'Characters without spaces',
  sentences: 'Sentences',
  paragraphs: 'Paragraphs or lines',
  reading: 'Reading time',
  speaking: 'Speaking time',
  grade: 'Reading grade',
  ease: 'Reading ease',
  pages: 'Pages',
};

export interface AnalysisPrefs {
  bar: boolean;
  metrics: readonly Metric[];
}

const KEY = 'vlo:analysis';
export const ANALYSIS_DEFAULTS: AnalysisPrefs = {
  bar: true,
  metrics: ['words', 'characters', 'sentences', 'reading', 'grade'],
};
const listeners = new Set<() => void>();

export function cleanPrefs(raw: unknown): AnalysisPrefs {
  if (!raw || typeof raw !== 'object') return ANALYSIS_DEFAULTS;
  const value = raw as Partial<Record<keyof AnalysisPrefs, unknown>>;
  const metrics = Array.isArray(value.metrics)
    ? METRICS.filter((metric) => (value.metrics as unknown[]).includes(metric))
    : ANALYSIS_DEFAULTS.metrics;
  return { bar: typeof value.bar === 'boolean' ? value.bar : ANALYSIS_DEFAULTS.bar, metrics };
}

function load(): AnalysisPrefs {
  try {
    return cleanPrefs(JSON.parse(safeStorage()?.getItem(KEY) ?? 'null'));
  } catch {
    return ANALYSIS_DEFAULTS;
  }
}

let current = load();

export function getAnalysisPrefs(): AnalysisPrefs {
  return current;
}

export function setAnalysisPrefs(change: Partial<AnalysisPrefs>): void {
  current = cleanPrefs({ ...current, ...change });
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private windows can refuse storage. The choice still works until the page closes.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAnalysisPrefs(): AnalysisPrefs {
  return useSyncExternalStore(subscribe, getAnalysisPrefs, getAnalysisPrefs);
}
