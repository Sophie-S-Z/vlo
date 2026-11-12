/*
 * The attributes of an image node (Phase 16), apart from the editor and the database, so the export
 * worker and the share reader can read them.
 */

/** The node name of an image in an item's document. */
export const IMAGE = 'image';

export const IMAGE_WIDTHS = [33, 50, 75, 100] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];
export const IMAGE_ALIGNS = ['left', 'center', 'right'] as const;
export type ImageAlign = (typeof IMAGE_ALIGNS)[number];

export interface ImageAttrs {
  id: string;
  alt: string;
  /** A decorative image has no alt text, and a screen reader skips it. */
  decorative: boolean;
  caption: string;
  /** Percent of the text width. */
  width: ImageWidth;
  align: ImageAlign;
}

export const MAX_IMAGE_TEXT = 2000;

export function cleanImageText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_IMAGE_TEXT) : '';
}

export function cleanImageWidth(value: unknown): ImageWidth {
  const n = Number(value);
  return (IMAGE_WIDTHS as readonly number[]).includes(n) ? (n as ImageWidth) : 100;
}

export function cleanImageAlign(value: unknown): ImageAlign {
  return (IMAGE_ALIGNS as readonly unknown[]).includes(value) ? (value as ImageAlign) : 'center';
}

/** The attributes of an image node, checked, as an export or a share reads them. */
export function imageAttrs(attrs: Record<string, unknown> | undefined): ImageAttrs {
  return {
    id: typeof attrs?.id === 'string' ? attrs.id : '',
    alt: cleanImageText(attrs?.alt),
    decorative: attrs?.decorative === true,
    caption: cleanImageText(attrs?.caption),
    width: cleanImageWidth(attrs?.width),
    align: cleanImageAlign(attrs?.align),
  };
}
