import { diffWordsWithSpace } from 'diff';

export interface DiffPart {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

/** Word-level changes from `before` to `after`. Spaces and line breaks count, so poem layout changes show. */
export function wordDiff(before: string, after: string): DiffPart[] {
  return diffWordsWithSpace(before, after).map((change) => ({
    kind: change.added ? 'added' : change.removed ? 'removed' : 'same',
    text: change.value,
  }));
}
