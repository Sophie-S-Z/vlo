import type { ReadingItem } from '@/features/codex/codex';
import { compareDates } from '@/features/timeline/dates';

/**
 * The scenes of a series on one timeline (F67): the dated scenes by story date, then the undated scenes.
 * A partial date sorts at its middle, as on the Memory Timeline. The sort is stable, so scenes with one
 * date and the undated scenes keep their reading order.
 */
export function seriesTimeline(order: readonly ReadingItem[]): {
  dated: ReadingItem[];
  undated: ReadingItem[];
} {
  const dated = order
    .filter(({ item }) => item.storyDate !== undefined)
    .sort((a, b) => compareDates(a.item.storyDate ?? '', b.item.storyDate ?? ''));
  return { dated, undated: order.filter(({ item }) => item.storyDate === undefined) };
}
