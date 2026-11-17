import { useGesture } from '@use-gesture/react';
import { Minus, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ImageReadError } from '@/features/images/resize';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { clampCrop, cropSide, MAX_ZOOM, photoDataUrl, type Crop } from './photo';

/*
 * Places a new profile photo (ADR 0011). The writer drags the picture inside the circle, and zooms with the
 * slider, a pinch, the wheel, or the + and - keys. The arrow keys move it too. "Use this photo" keeps the
 * square inside the circle.
 */

const ZOOM_STEP = 0.25;
const UNREADABLE = 'Vlo cannot read this image. Use a JPEG, PNG, WebP or GIF file.';

export function PhotoCropper({
  file,
  onDone,
  onCancel,
}: {
  /** The picked file. The dialog shows while the parent renders it. */
  file: Blob;
  onDone: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [url, setUrl] = useState('');
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, zoom: 1 });
  const [message, setMessage] = useState('');
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);

  // A data URL needs no revoke, so a second run of the effect in development keeps the picture.
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => {
      setUrl(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      setMessage(UNREADABLE);
    };
    reader.readAsDataURL(file);
    return () => {
      reader.abort();
    };
  }, [file]);

  const place = (change: (crop: Crop) => Crop) => {
    if (size) setCrop((current) => clampCrop(change(current), size.width, size.height));
  };
  /** Pixels of the picture for each CSS pixel of the circle. */
  const scale = () =>
    size ? cropSide(size.width, size.height, crop.zoom) / (frame.current?.clientWidth ?? 1) : 1;
  const zoomTo = (zoom: number) => {
    place((c) => ({ ...c, zoom }));
  };

  useGesture(
    {
      onDrag: ({ delta: [dx, dy], pinching, cancel }) => {
        if (pinching) {
          cancel();
          return;
        }
        const s = scale();
        place((c) => ({ ...c, x: c.x - dx * s, y: c.y - dy * s }));
      },
      onPinch: ({ offset: [zoom] }) => {
        zoomTo(zoom);
      },
      onWheel: ({ event, delta: [, dy] }) => {
        event.preventDefault();
        place((c) => ({ ...c, zoom: c.zoom * Math.exp(-dy * 0.002) }));
      },
    },
    {
      target: frame,
      eventOptions: { passive: false },
      drag: { pointer: { keys: false } },
      pinch: { from: () => [crop.zoom, 0], scaleBounds: { min: 1, max: MAX_ZOOM } },
    },
  );

  const side = size ? cropSide(size.width, size.height, crop.zoom) : 1;
  const percent = (n: number) => `${String(n * 100)}%`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogTitle>Place your photo</DialogTitle>
        <DialogDescription>
          Drag the photo to move it in the circle. Pinch, scroll or use the slider to zoom.
        </DialogDescription>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the keys move the photo. */}
        <div
          ref={frame}
          role="group"
          aria-roledescription="photo frame"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the keys move the photo.
          tabIndex={0}
          aria-label="Photo. The arrow keys move it, and the plus and minus keys zoom."
          onKeyDown={(event) => {
            const step = side * 0.04;
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            };
            const move = moves[event.key];
            if (move) place((c) => ({ ...c, x: c.x + move[0], y: c.y + move[1] }));
            else if (event.key === '+' || event.key === '=') zoomTo(crop.zoom + ZOOM_STEP);
            else if (event.key === '-') zoomTo(crop.zoom - ZOOM_STEP);
            else return;
            event.preventDefault();
          }}
          className="relative mx-auto aspect-square w-full max-w-72 cursor-grab touch-none overflow-hidden rounded-[var(--radius-card)] bg-bg select-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
        >
          {url && (
            <img
              ref={image}
              src={url}
              alt=""
              draggable={false}
              onLoad={(event) => {
                const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
                setSize({ width, height });
                setCrop({ x: width / 2, y: height / 2, zoom: 1 });
              }}
              onError={() => {
                setMessage(UNREADABLE);
              }}
              className="absolute max-w-none"
              style={
                size
                  ? {
                      width: percent(size.width / side),
                      height: percent(size.height / side),
                      left: percent(0.5 - crop.x / side),
                      top: percent(0.5 - crop.y / side),
                    }
                  : { opacity: 0 }
              }
            />
          )}
          {/* The circle that the photo keeps, with the rest of the square dimmed. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_100vmax_oklch(0.17_0.008_60/0.55)] ring-2 ring-white/80"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            aria-label="Zoom out"
            disabled={!size || crop.zoom <= 1}
            className="px-3"
            onClick={() => {
              zoomTo(crop.zoom - ZOOM_STEP);
            }}
          >
            <Minus aria-hidden="true" className="size-4" />
          </Button>
          <label htmlFor={`${id}-zoom`} className="sr-only">
            Zoom
          </label>
          <input
            id={`${id}-zoom`}
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            disabled={!size}
            aria-valuetext={`${String(Math.round(crop.zoom * 100))} percent`}
            onChange={(event) => {
              zoomTo(Number(event.target.value));
            }}
            className="min-w-0 flex-1 accent-[var(--accent)]"
          />
          <Button
            type="button"
            variant="ghost"
            aria-label="Zoom in"
            disabled={!size || crop.zoom >= MAX_ZOOM}
            className="px-3"
            onClick={() => {
              zoomTo(crop.zoom + ZOOM_STEP);
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <p role="status" className="text-sm empty:hidden">
          {message}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!size}
            onClick={() => {
              if (!image.current) return;
              try {
                onDone(photoDataUrl(image.current, crop));
              } catch (error) {
                setMessage(
                  error instanceof ImageReadError
                    ? error.message
                    : 'Vlo could not use this photo. Pick another.',
                );
              }
            }}
          >
            Use this photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
