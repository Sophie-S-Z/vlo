/*
 * Image size on the device (Phase 16, decision G2). The browser decodes the file, Vlo draws it at most
 * `MAX_IMAGE_SIDE` pixels on its long side, and stores a JPEG at 85% quality. An image with transparent
 * pixels stays a PNG. The new file holds no camera data, so a photo's place and time never travel in it.
 */

/** The long side of a stored image, in pixels. */
export const MAX_IMAGE_SIDE = 2400;
/** The JPEG quality of a stored image. */
export const JPEG_QUALITY = 0.85;
/** The largest file that Vlo reads. A larger file is too big to decode on a phone. */
export const MAX_IMAGE_INPUT = 50 * 1024 * 1024;

export const IMAGE_TYPES = ['image/jpeg', 'image/png'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export class ImageReadError extends Error {}

/** The size to draw an image at: the same shape, with the long side at most `max` pixels. */
export function fitSize(
  width: number,
  height: number,
  max = MAX_IMAGE_SIDE,
): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const long = Math.max(w, h);
  if (long <= max) return { width: w, height: h };
  const scale = max / long;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** True when one pixel of the RGBA data is not fully opaque. */
export function hasTransparency(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return true;
  return false;
}

/** File types that can hold transparent pixels. A JPEG never does. */
const ALPHA_TYPES = new Set(['image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml']);

export interface PreparedImage {
  data: Blob;
  type: ImageType;
  width: number;
  height: number;
}

type Canvas = OffscreenCanvas | HTMLCanvasElement;

function canvasOf(width: number, height: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encode(canvas: Canvas, type: ImageType): Promise<Blob> {
  const quality = type === 'image/jpeg' ? JPEG_QUALITY : undefined;
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, ...(quality ? { quality } : {}) });
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new ImageReadError('The browser could not save the image.'));
      },
      type,
      quality,
    );
  });
}

/** Decodes an image file and makes the stored copy. */
export async function prepareImage(file: Blob, max = MAX_IMAGE_SIDE): Promise<PreparedImage> {
  if (file.size > MAX_IMAGE_INPUT) throw new ImageReadError('This image is larger than 50 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageReadError('Vlo cannot read this image. Use a JPEG, PNG, WebP or GIF file.');
  }
  try {
    const size = fitSize(bitmap.width, bitmap.height, max);
    const canvas = canvasOf(size.width, size.height);
    const context = canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : canvas.getContext('2d');
    if (!context) throw new ImageReadError('The browser could not draw the image.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const clear =
      ALPHA_TYPES.has(file.type) && hasTransparency(context.getImageData(0, 0, size.width, size.height).data);
    const type: ImageType = clear ? 'image/png' : 'image/jpeg';
    return { data: await encode(canvas, type), type, ...size };
  } finally {
    bitmap.close();
  }
}
