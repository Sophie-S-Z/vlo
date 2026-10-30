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
