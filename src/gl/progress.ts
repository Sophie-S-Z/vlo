export interface Anchor {
  /** Document y of the anchor, in CSS pixels. */
  top: number;
  /** Shape progress at that point: 0 is the first shape, 6 the last. */
  value: number;
}

/** Shape progress for a document y. Anchors must be sorted by `top`. */
export function progressAt(y: number, anchors: readonly Anchor[]): number {
  const first = anchors[0];
  if (!first) return 0;
  if (y <= first.top) return first.value;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1]!;
    const b = anchors[i]!;
    if (y <= b.top) {
      const span = b.top - a.top;
      return span <= 0 ? b.value : a.value + ((y - a.top) / span) * (b.value - a.value);
    }
  }
  return anchors[anchors.length - 1]!.value;
}

/**
 * Document y of the anchor for one page. It sits 30% into the page (at most 30% of a screen).
 * The middle of the screen must reach every anchor: it starts at viewport/2 and stops at
 * scrollHeight - viewport/2. A one-pixel step per index keeps the anchors in order at the ends.
 */
export function placeAnchor(
  page: { top: number; height: number },
  index: number,
  total: number,
  view: { viewport: number; scrollHeight: number },
): number {
  const at = page.top + Math.min(page.height, view.viewport) * 0.3;
  const min = view.viewport / 2 + index;
  const max = view.scrollHeight - view.viewport / 2 - (total - index);
  return Math.max(min, Math.min(at, max));
}

/**
 * Frame-rate guard. Call it once per frame with the time in milliseconds; it returns true when
 * a full window of frames averaged more than `maxMs`. A gap over `maxGapMs` (a hidden tab, a
 * shader compile) starts a new window, so a pause never counts as a slow device.
 */
export function createFrameGuard({
  frames,
  maxMs,
  maxGapMs = 250,
}: {
  frames: number;
  maxMs: number;
  maxGapMs?: number;
}): (now: number) => boolean {
  let last: number | undefined;
  let count = 0;
  let total = 0;
  return (now) => {
    const delta = last === undefined ? Infinity : now - last;
    last = now;
    if (delta > maxGapMs) {
      count = 0;
      total = 0;
      return false;
    }
    total += delta;
    if (++count < frames) return false;
    const average = total / count;
    count = 0;
    total = 0;
    return average > maxMs;
  };
}
