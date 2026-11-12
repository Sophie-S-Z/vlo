import type { TextFill } from '@/features/editor/format/fill';
import { gradientLine, rgbOf, SLANT, type Rgb, type TextOptions } from './draw';
import type { Face } from './fonts';
import type { LaidOutPdf } from './pdf';
import { toBase64 } from '@/lib/crypto';
import type { ExportImage } from '../model';
import type { Box, PlacedImage, Sink } from './sink';

/*
 * The book preview (roadmap F51, plan Task J5) draws each page as SVG from the same layout as the PDF. Each
 * letter is its glyph outline from the embedded font, placed as the PDF places it, so the preview and the
 * file match line for line on any device, with no web font.
 */

/** A page or font coordinate, to a hundredth. */
const fixed = (n: number) => (Math.round(n * 100) / 100).toString();
/** A matrix entry, which scales font units of 1,000 or 2,048 to the em, so it keeps more places. */
const exact = (n: number) => (Math.round(n * 1e7) / 1e7).toString();

function color({ r, g, b }: Rgb): string {
  return `rgb(${[r, g, b].map((c) => String(Math.round(c * 255))).join(',')})`;
}

/** The glyph outlines that pages use, each defined once in each page. */
class Glyphs {
  private readonly faces = new Map<Face, number>();
  private readonly paths = new Map<string, string>();

  /** The id of a glyph's outline, made on first use. */
  id(face: Face, glyph: { id: number; path: { toSVG: () => string } }): string {
    let index = this.faces.get(face);
    if (index === undefined) {
      index = this.faces.size;
      this.faces.set(face, index);
    }
    const id = `f${String(index)}g${String(glyph.id)}`;
    if (!this.paths.has(id)) this.paths.set(id, glyph.path.toSVG());
    return id;
  }

  path(id: string): string {
    return this.paths.get(id) ?? '';
  }
}

class SvgSink implements Sink {
  readonly parts: string[] = [];
  readonly used = new Set<string>();
  private gradients = 0;

  constructor(
    private readonly glyphs: Glyphs,
    private readonly height: number,
  ) {}

  /** The matrix from font units to page units for text at (x, y). */
  private matrix(x: number, y: number, options: TextOptions): number[] {
    const scale = options.size / options.face.metrics.unitsPerEm;
    const skew = options.face.fakeItalic ? SLANT : 0;
    return [scale, 0, scale * skew, -(options.scaleY ?? 1) * scale, x, this.height - y];
  }

  /** The glyphs of some text in one group: font units inside, page units outside. */
  private glyphRun(text: string, x: number, y: number, options: TextOptions, paint: string): string {
    let pen = 0;
    const uses = options.face.metrics.layout(text).glyphs.map((glyph) => {
      const id = this.glyphs.id(options.face, glyph);
      this.used.add(id);
      const use = `<use href="#${id}" x="${fixed(pen)}"/>`;
      pen += glyph.advanceWidth;
      return use;
    });
    const matrix = this.matrix(x, y, options).map(exact).join(' ');
    return `<g transform="matrix(${matrix})" ${paint}>${uses.join('')}</g>`;
  }

  text(text: string, x: number, y: number, options: TextOptions): void {
    const fill = color(options.color);
    const bold = options.bold === true || options.face.fakeBold;
    const width = fixed(options.face.metrics.unitsPerEm * 0.035);
    this.parts.push(
      this.glyphRun(
        text,
        x,
        y,
        options,
        bold ? `fill="${fill}" stroke="${fill}" stroke-width="${width}"` : `fill="${fill}"`,
      ),
    );
  }

  glow(text: string, x: number, y: number, options: TextOptions): void {
    const width = fixed(options.face.metrics.unitsPerEm * 0.16);
    const paint = `fill="none" stroke="${color(options.color)}" stroke-opacity="0.3" stroke-width="${width}"`;
    this.parts.push(this.glyphRun(text, x, y, options, paint));
  }

  gradientText(text: string, x: number, y: number, options: TextOptions, fill: TextFill, box: Box): void {
    this.gradients += 1;
    const id = `grad${String(this.gradients)}`;
    const line = gradientLine(fill, box);
    const stops = fill.stops.map((s) => `<stop offset="${String(s.at)}%" stop-color="${s.color}"/>`).join('');
    // The gradient line is in page units, and the glyphs paint in font units, so it takes the inverse matrix.
    const [a = 1, , c = 0, d = 1, e = 0, f = 0] = this.matrix(x, y, options);
    const inverse = [1 / a, 0, -c / (a * d), 1 / d, (c * f - d * e) / (a * d), -f / d].map(exact).join(' ');
    this.parts.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="matrix(${inverse})" x1="${fixed(line.x0)}" y1="${fixed(this.height - line.y0)}" x2="${fixed(line.x1)}" y2="${fixed(this.height - line.y1)}">${stops}</linearGradient>`,
    );
    this.parts.push(this.glyphRun(text, x, y, options, `fill="url(#${id})"`));
  }

  rect(x: number, y: number, width: number, height: number, c: Rgb): void {
    this.parts.push(
      `<rect x="${fixed(x)}" y="${fixed(this.height - y - height)}" width="${fixed(width)}" height="${fixed(height)}" fill="${color(c)}"/>`,
    );
  }

  private points(points: readonly [number, number][]): string {
    return points.map(([x, y]) => `${fixed(x)},${fixed(this.height - y)}`).join(' ');
  }

  line(points: readonly [number, number][], width: number, c: Rgb): void {
    this.parts.push(
      `<polyline points="${this.points(points)}" fill="none" stroke="${color(c)}" stroke-width="${fixed(width)}"/>`,
    );
  }

  shape(points: readonly [number, number][], c: Rgb): void {
    this.parts.push(`<polygon points="${this.points(points)}" fill="${color(c)}"/>`);
  }

  link(): void {
    // A preview page is a picture, so a link has nothing to open.
  }

  image(image: PlacedImage, x: number, y: number, width: number, height: number): void {
    let href = addresses.get(image.source);
    if (href === undefined) {
      href = `data:${image.source.type};base64,${toBase64(image.source.data)}`;
      addresses.set(image.source, href);
    }
    this.parts.push(
      `<image x="${fixed(x)}" y="${fixed(this.height - y - height)}" width="${fixed(width)}" height="${fixed(height)}" preserveAspectRatio="none" href="${href}"/>`,
    );
  }
}

/** The data: address of each image, made once for all the pages of a preview. */
const addresses = new WeakMap<ExportImage, string>();

const shared = new WeakMap<LaidOutPdf, Glyphs>();

/** One page of a laid-out PDF as a whole SVG file, on white paper. */
export function svgPage(laid: LaidOutPdf, index: number): string {
  let glyphs = shared.get(laid);
  if (!glyphs) {
    glyphs = new Glyphs();
    shared.set(laid, glyphs);
  }
  const [width, height] = laid.size;
  const sink = new SvgSink(glyphs, height);
  laid.drawPage(index, sink);
  const defs = [...sink.used].map((id) => `<path id="${id}" d="${glyphs.path(id)}"/>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fixed(width)} ${fixed(height)}">` +
    `<rect width="100%" height="100%" fill="${color(rgbOf('#ffffff'))}"/><defs>${defs}</defs>${sink.parts.join('')}</svg>`
  );
}
