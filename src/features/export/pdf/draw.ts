import {
  beginText,
  closePath,
  endText,
  fill,
  lineTo,
  moveTo,
  PDFDict,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  PDFString,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  stroke,
  TextRenderingMode,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { TextFill } from '@/features/editor/format/fill';
import type { Face } from './fonts';
import type { Box, Sink } from './sink';

/*
 * Low-level drawing on one PDF page: text in any face with a drawn bold or italic, rules, boxes, gradient
 * text and links. pdf-lib's drawText has no clipping or text render modes, so this writes the operators.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const INK: Rgb = { r: 0x1f / 255, g: 0x1d / 255, b: 0x1b / 255 };

export function rgbOf(hex: string): Rgb {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** The slant of a drawn italic: about 12 degrees. */
export const SLANT = 0.21;

export interface TextOptions {
  face: Face;
  size: number;
  color: Rgb;
  bold?: boolean;
  /** A vertical stretch, for tall brackets in equations. */
  scaleY?: number;
}

/**
 * The line of a gradient over a box, from its first stop to its last. CSS 90deg runs left to right and
 * 180deg top to bottom. PDF y grows upward.
 */
export function gradientLine(fillStyle: TextFill, box: Box): Box {
  const stops = fillStyle.stops;
  const angle = (fillStyle.angle * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const half = (Math.abs((box.x1 - box.x0) * dx) + Math.abs((box.y1 - box.y0) * dy)) / 2;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const at = (t: number) => ({ x: cx + dx * half * (2 * t - 1), y: cy + dy * half * (2 * t - 1) });
  const start = at((stops[0]?.at ?? 0) / 100);
  const end = at((stops[stops.length - 1]?.at ?? 100) / 100);
  return { x0: start.x, y0: start.y, x1: end.x, y1: end.y };
}

export class Drawer implements Sink {
  private readonly fontKeys = new Map<PDFFont, PDFName>();
  private shadings = 0;
  private glowKey: PDFName | null = null;

  constructor(
    readonly pdf: PDFDocument,
    readonly page: PDFPage,
  ) {}

  private fontKey(font: PDFFont): PDFName {
    let key = this.fontKeys.get(font);
    if (!key) {
      key = this.page.node.newFontDictionary(font.name, font.ref);
      this.fontKeys.set(font, key);
    }
    return key;
  }

  private textOps(
    text: string,
    x: number,
    y: number,
    options: TextOptions,
    mode: TextRenderingMode,
  ): PDFOperator[] {
    const { face, size } = options;
    const skew = face.fakeItalic ? SLANT : 0;
    return [
      beginText(),
      setFontAndSize(this.fontKey(face.font), size),
      setTextRenderingMode(mode),
      setTextMatrix(1, 0, skew, options.scaleY ?? 1, x, y),
      showText(face.font.encodeText(text)),
      endText(),
    ];
  }

  /** Draws text with its baseline at y. A drawn bold fills and strokes the outline. */
  text(text: string, x: number, y: number, options: TextOptions): void {
    if (text === '') return;
    const { color, size } = options;
    const bold = options.bold === true || options.face.fakeBold;
    this.page.pushOperators(
      pushGraphicsState(),
      setFillingRgbColor(color.r, color.g, color.b),
      ...(bold ? [setStrokingRgbColor(color.r, color.g, color.b), setLineWidth(size * 0.035)] : []),
      ...this.textOps(text, x, y, options, bold ? TextRenderingMode.FillAndOutline : TextRenderingMode.Fill),
      popGraphicsState(),
    );
  }

  /** A soft halo around text, for the glow look: a wide, faint outline in the glow color. */
  glow(text: string, x: number, y: number, options: TextOptions): void {
    if (!this.glowKey) {
      const state = this.pdf.context.obj({ Type: 'ExtGState', CA: 0.3, ca: 0.3 });
      this.glowKey = this.page.node.newExtGState('GS', state);
    }
    const { color, size } = options;
    this.page.pushOperators(
      pushGraphicsState(),
      setGraphicsState(this.glowKey),
      setStrokingRgbColor(color.r, color.g, color.b),
      setLineWidth(size * 0.16),
      ...this.textOps(text, x, y, options, TextRenderingMode.Outline),
      popGraphicsState(),
    );
  }

  /**
   * Draws text filled with a gradient over the box (x0, y0) to (x1, y1): the text becomes a clip, then an
   * axial shading paints it. The box is the whole styled run on its line, so the gradient spans the run.
   */
  gradientText(
    text: string,
    x: number,
    y: number,
    options: TextOptions,
    fillStyle: TextFill,
    box: Box,
  ): void {
    const key = this.shading(fillStyle, box);
    const bold = options.face.fakeBold;
    this.page.pushOperators(
      pushGraphicsState(),
      ...(bold ? [setLineWidth(options.size * 0.035)] : []),
      ...this.textOps(
        text,
        x,
        y,
        options,
        bold ? TextRenderingMode.FillAndOutlineAndClip : TextRenderingMode.Clip,
      ),
      PDFOperator.of(PDFOperatorNames.ShadingFill, [key]),
      popGraphicsState(),
    );
  }

  private shading(fillStyle: TextFill, box: Box): PDFName {
    const { context } = this.pdf;
    const stops = fillStyle.stops;
    const fn = (from: Rgb, to: Rgb) =>
      context.obj({
        FunctionType: 2,
        Domain: [0, 1],
        C0: [from.r, from.g, from.b],
        C1: [to.r, to.g, to.b],
        N: 1,
      });
    const colors = stops.map((s) => rgbOf(s.color));
    const parts = colors.slice(1).map((to, i) => fn(colors[i] ?? to, to));
    const stitched =
      parts.length === 1
        ? parts[0]
        : context.obj({
            FunctionType: 3,
            Domain: [0, 1],
            Functions: parts,
            Bounds: stops.slice(1, -1).map((s) => s.at / 100),
            Encode: parts.flatMap(() => [0, 1]),
          });
    const { x0, y0, x1, y1 } = gradientLine(fillStyle, box);
    const shading = context.obj({
      ShadingType: 2,
      ColorSpace: 'DeviceRGB',
      Coords: [x0, y0, x1, y1],
      Function: stitched ?? fn(INK, INK),
      Extend: [true, true],
    });
    const { Resources } = this.page.node.normalizedEntries();
    let dict = Resources.lookupMaybe(PDFName.of('Shading'), PDFDict);
    if (!dict) {
      dict = context.obj({});
      Resources.set(PDFName.of('Shading'), dict);
    }
    this.shadings += 1;
    const key = PDFName.of(`VloSh${String(this.shadings)}`);
    dict.set(key, context.register(shading));
    return key;
  }

  rect(x: number, y: number, width: number, height: number, color: Rgb): void {
    this.page.pushOperators(
      pushGraphicsState(),
      setFillingRgbColor(color.r, color.g, color.b),
      rectangle(x, y, width, height),
      fill(),
      popGraphicsState(),
    );
  }

  /** A straight line, or a path of lines through `points`. */
  line(points: readonly [number, number][], width: number, color: Rgb): void {
    const [start, ...rest] = points;
    if (!start) return;
    this.page.pushOperators(
      pushGraphicsState(),
      setStrokingRgbColor(color.r, color.g, color.b),
      setLineWidth(width),
      moveTo(start[0], start[1]),
      ...rest.map(([x, y]) => lineTo(x, y)),
      stroke(),
      popGraphicsState(),
    );
  }

  /** A filled shape through `points`. */
  shape(points: readonly [number, number][], color: Rgb): void {
    const [start, ...rest] = points;
    if (!start) return;
    this.page.pushOperators(
      pushGraphicsState(),
      setFillingRgbColor(color.r, color.g, color.b),
      moveTo(start[0], start[1]),
      ...rest.map(([x, y]) => lineTo(x, y)),
      closePath(),
      fill(),
      popGraphicsState(),
    );
  }

  /** A link over a box, to a web address. */
  link(x: number, y: number, width: number, height: number, url: string): void {
    const { context } = this.pdf;
    const annot = context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    });
    this.page.node.addAnnot(context.register(annot));
  }
}
