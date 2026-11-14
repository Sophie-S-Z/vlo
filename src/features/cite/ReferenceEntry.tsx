import type { Run } from '@/features/export/model';

/** One entry of a reference list, with its titles in italics. */
export function ReferenceEntry({ runs }: { runs: readonly Run[] }) {
  return runs.map((run, i) =>
    run.type !== 'text' ? null : run.style.italic ? (
      <i key={i}>{run.text}</i>
    ) : (
      <span key={i}>{run.text}</span>
    ),
  );
}
