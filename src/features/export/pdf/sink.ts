import type { TextFill } from '@/features/editor/format/fill';
import type { Rgb, TextOptions } from './draw';

/*
 * The drawing calls of one page (plan Task J4). `Drawer` writes them to a PDF page, and the book preview
 * records them as SVG, so the preview and the file come from one layout.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Sink {
  /** Text with its baseline at y. */
  text: (text: string, x: number, y: number, options: TextOptions) => void;
  /** A soft halo around text, for the glow look. */
  glow: (text: string, x: number, y: number, options: TextOptions) => void;
  /** Text filled with a gradient that spans `box`. */
  gradientText: (text: string, x: number, y: number, options: TextOptions, fill: TextFill, box: Box) => void;
  rect: (x: number, y: number, width: number, height: number, color: Rgb) => void;
  line: (points: readonly [number, number][], width: number, color: Rgb) => void;
  shape: (points: readonly [number, number][], color: Rgb) => void;
  link: (x: number, y: number, width: number, height: number, url: string) => void;
}

/** The same sink with every x moved right by `dx`, for the left margin of each page. */
export function shifted(sink: Sink, dx: number): Sink {
  const move = (points: readonly [number, number][]) => points.map(([x, y]): [number, number] => [x + dx, y]);
  return {
    text: (text, x, y, options) => {
      sink.text(text, x + dx, y, options);
    },
    glow: (text, x, y, options) => {
      sink.glow(text, x + dx, y, options);
    },
    gradientText: (text, x, y, options, fill, box) => {
      sink.gradientText(text, x + dx, y, options, fill, { ...box, x0: box.x0 + dx, x1: box.x1 + dx });
    },
    rect: (x, y, width, height, color) => {
      sink.rect(x + dx, y, width, height, color);
    },
    line: (points, width, color) => {
      sink.line(move(points), width, color);
    },
    shape: (points, color) => {
      sink.shape(move(points), color);
    },
    link: (x, y, width, height, url) => {
      sink.link(x + dx, y, width, height, url);
    },
  };
}
