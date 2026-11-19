import { localStore, useLocalStore } from '@/app/localStore';

/*
 * The stats bar under the writing, on this device: whether it shows, and which counts it shows. It is on,
 * with the words and the reading time, and the writer can turn it off or pick other counts.
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

export const ANALYSIS_DEFAULTS: AnalysisPrefs = {
  bar: true,
  metrics: ['words', 'reading'],
};

export function cleanPrefs(raw: unknown): AnalysisPrefs {
  if (!raw || typeof raw !== 'object') return ANALYSIS_DEFAULTS;
  const value = raw as Partial<Record<keyof AnalysisPrefs, unknown>>;
  const metrics = Array.isArray(value.metrics)
    ? METRICS.filter((metric) => (value.metrics as unknown[]).includes(metric))
    : ANALYSIS_DEFAULTS.metrics;
  return { bar: typeof value.bar === 'boolean' ? value.bar : ANALYSIS_DEFAULTS.bar, metrics };
}

const store = localStore('vlo:analysis', cleanPrefs);

export function setAnalysisPrefs(change: Partial<AnalysisPrefs>): void {
  store.set(cleanPrefs({ ...store.get(), ...change }));
}

export function useAnalysisPrefs(): AnalysisPrefs {
  return useLocalStore(store);
}
