import { ImageReadError } from '@/features/images/resize';
import { MAX_PHOTO } from './profile';

/*
 * The profile photo (ADR 0011). The writer places a square on the picture; the browser draws that square
 * at most 256 pixels wide and keeps a WebP, or a JPEG where the browser cannot make a WebP. The new file
 * holds no camera data, so the place and time of a photo never leave the device.
 */

/** The most that the writer can zoom into a photo. */
export const MAX_ZOOM = 4;

/** The square of the photo to keep: its center, in pixels of the picture, and the zoom. */
export interface Crop {
  x: number;
  y: number;
  zoom: number;
}

/** The side of the square, in pixels of the picture. Zoom 1 is the whole short side. */
export const cropSide = (width: number, height: number, zoom: number) => Math.min(width, height) / zoom;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The crop with its zoom in range and its square inside the picture. */
export function clampCrop(crop: Crop, width: number, height: number): Crop {
  const zoom = clamp(crop.zoom, 1, MAX_ZOOM);
  const half = cropSide(width, height, zoom) / 2;
  return { zoom, x: clamp(crop.x, half, width - half), y: clamp(crop.y, half, height - half) };
}

/** Each try: the side in pixels and the quality. A busy photo can need a smaller file. */
const TRIES = [
  [256, 0.85],
  [256, 0.7],
  [192, 0.7],
  [160, 0.6],
] as const;

/** Draws the square of the crop and gives a data URL that the server takes. */
export function photoDataUrl(image: HTMLImageElement, crop: Crop): string {
  const side = cropSide(image.naturalWidth, image.naturalHeight, crop.zoom);
  const canvas = document.createElement('canvas');
  for (const [size, quality] of TRIES) {
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) break;
    // A photo with clear pixels gets a white ground, as a JPEG has no clear pixels.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size, size);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, crop.x - side / 2, crop.y - side / 2, side, side, 0, 0, size, size);
    let url = canvas.toDataURL('image/webp', quality);
    if (!url.startsWith('data:image/webp;')) url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_PHOTO) return url;
  }
  throw new ImageReadError('Vlo could not make this photo small enough. Pick another photo.');
}
