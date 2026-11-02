import { diffWordsWithSpace } from 'diff';

export interface DiffPart {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

/**
 * Word-level changes from `before` to `after`. Spaces and line breaks count, so poem layout changes show.
 * With `timeoutMs`, returns null when marking the changes would take longer than that.
 */
export function wordDiff(
  before: string,
  after: string,
  options: { timeoutMs?: number } = {},
): DiffPart[] | null {
  const changes =
    options.timeoutMs === undefined
      ? diffWordsWithSpace(before, after)
      : diffWordsWithSpace(before, after, { timeout: options.timeoutMs });
  if (!changes) return null;
  return changes.map((change) => ({
    kind: change.added ? 'added' : change.removed ? 'removed' : 'same',
    text: change.value,
  }));
}
