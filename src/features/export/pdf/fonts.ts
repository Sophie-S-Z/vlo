import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';
import { DEFAULT_FONT, localFontName } from '@/features/editor/format/fonts';
import list from '../pdf-fonts.json';

/*
 * The fonts a PDF or EPUB embeds (spec section 9). Every Vlo font has TTF files in public/fonts/<id>/. A
 * writer's own font is embedded from its bytes when its license allows it, or else swapped for the closest
 * Vlo font (plan decision 7). Noto Sans Math draws the symbols a text font has no glyph for.
 */

export type FontStyle = 'regular' | 'italic' | 'bold' | 'boldItalic';

interface FontFiles {
  /** The family name in Google Fonts. */
  family: string;
  /** The family's folder in the google/fonts repository, for its license. */
  dir: string;
  styles: string[];
}

export const PDF_FONTS: Readonly<Record<string, FontFiles>> = list.fonts;

export const MATH_FONT = 'noto-sans-math';

/** Reads a font file: a path under public/, such as "fonts/lora/regular.ttf". */
export type LoadFile = (path: string) => Promise<Uint8Array>;

/** The parts of a fontkit font that the layout reads. */
export interface FontMetrics {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  capHeight: number;
  xHeight: number;
  hasGlyphForCodePoint: (codePoint: number) => boolean;
}

/** One embedded face, and how to draw the styles the face lacks. */
export interface Face {
  font: PDFFont;
  metrics: FontMetrics;
  /** Bold drawn as a filled and stroked outline, for a font with no bold file. */
  fakeBold: boolean;
  /** Italic drawn as slanted upright letters, for a font with no italic file. */
  fakeItalic: boolean;
}

/** The path of each file of a Vlo font, by style. */
export function fontPaths(id: string): Partial<Record<FontStyle, string>> {
  const files = PDF_FONTS[id];
  if (!files) return {};
  const out: Partial<Record<FontStyle, string>> = {};
  for (const style of ['regular', 'italic', 'bold', 'boldItalic'] as const) {
    if (files.styles.includes(style)) out[style] = `fonts/${id}/${style}.ttf`;
  }
  return out;
}

function metricsOf(font: PDFFont): FontMetrics {
  return (font as unknown as { embedder: { font: FontMetrics } }).embedder.font;
}

/** The OS/2 fsType bits that fontkit reads: what the font's license allows (OpenType OS/2 fsType). */
interface EmbedFlags {
  /** Bit 1, Restricted License embedding. */
  noEmbedding?: boolean;
  /** Bit 2, Preview and Print embedding. */
  viewOnly?: boolean;
  /** Bit 3, Editable embedding. */
  editable?: boolean;
  /** Bit 8: the whole font must be embedded, never a subset. */
  noSubsetting?: boolean;
  /** Bit 9: only bitmaps may be embedded. */
  bitmapOnly?: boolean;
}

/** The OS/2 table parts that say whether a font may be embedded, and what kind of font it is. */
interface FontTables {
  'OS/2'?: { fsType?: EmbedFlags; panose?: number[] };
  familyName?: string;
  /** Missing on a font collection, which holds several fonts in one file. */
  unitsPerEm?: number;
}

function readFont(bytes: Uint8Array): FontTables | null {
  try {
    const font = fontkit.create(bytes) as unknown as FontTables;
    return typeof font.unitsPerEm === 'number' ? font : null;
  } catch {
    return null;
  }
}

/** Why a writer's own font cannot be embedded, or null when it can. */
export function embedProblem(bytes: Uint8Array | undefined): string | null {
  if (!bytes) return 'Vlo cannot read this font on this device.';
  const font = readFont(bytes);
  if (!font) return 'Vlo cannot read this font file.';
  const flags = font['OS/2']?.fsType ?? {};
  // Old fonts can set more than one of bits 1 to 3. The least strict one then applies.
  if (flags.noEmbedding === true && flags.viewOnly !== true && flags.editable !== true) {
    return 'Its license does not allow embedding.';
  }
  if (flags.bitmapOnly === true) return 'Its license allows only bitmap embedding.';
  return null;
}

/** False when the font's license asks for the whole font in the file, never a subset. */
export function maySubset(bytes: Uint8Array): boolean {
  return readFont(bytes)?.['OS/2']?.fsType?.noSubsetting !== true;
}

/** The closest Vlo font for a writer's own font, from its design class when Vlo can read it, else its name. */
export function standInFor(name: string, bytes?: Uint8Array): string {
  const panose = bytes ? readFont(bytes)?.['OS/2']?.panose : undefined;
  const lower = name.toLowerCase();
  // PANOSE family 3 is script and handwriting. Proportion 9 is monospaced. Serif styles 11 to 13 are sans.
  if (panose?.[0] === 3 || /script|hand|brush|marker|comic/.test(lower)) return 'caveat';
  if (panose?.[3] === 9 || /mono|courier|typewriter|code|consol/.test(lower)) return 'courier-prime';
  if (
    (panose && (panose[1] ?? 0) >= 11 && (panose[1] ?? 0) <= 13) ||
    /sans|helvetica|arial|grotesk|gothic/.test(lower)
  ) {
    return 'inter';
  }
  return DEFAULT_FONT;
}

/** The parts of fontkit's TrueType subset writer that `evenGlyphs` changes. */
interface SubsetWriter {
  glyf: Uint8Array[];
  offset: number;
  _addGlyph?: (this: SubsetWriter, gid: number) => number;
}

let glyphsEven = false;

/**
 * fontkit writes a subset with short loca offsets when the glyph data is under 128 KB. Short offsets count
 * 2-byte words, so a glyph of odd length moves every later glyph by one byte, and readers draw nothing.
 * EB Garamond, Inter and Kalam have odd-length glyphs. This pads each glyph to an even length.
 */
export function evenGlyphs(sample: Uint8Array): void {
  if (glyphsEven) return;
  const writer = Object.getPrototypeOf(fontkit.create(sample).createSubset()) as SubsetWriter;
  const add = writer._addGlyph;
  if (!add) return;
  writer._addGlyph = function addEven(this: SubsetWriter, gid: number): number {
    const index = add.call(this, gid);
    const data = this.glyf[index];
    if (data && data.length % 2 === 1) {
      // The same Buffer type that fontkit read, since its stream takes no plain Uint8Array.
      const make = (data.constructor as { alloc?: (size: number) => Uint8Array }).alloc;
      const padded = make ? make(data.length + 1) : new Uint8Array(data.length + 1);
      padded.set(data);
      this.glyf[index] = padded;
      this.offset += 1;
    }
    return index;
  };
  glyphsEven = true;
}

/** The faces of an export, embedded on first use. */
export class FontSet {
  private readonly faces = new Map<string, Promise<Face>>();
  /** One embedded font for each file, so a drawn bold shares the regular font. */
  private readonly embedded = new Map<string, Promise<PDFFont>>();

  constructor(
    private readonly pdf: PDFDocument,
    private readonly load: LoadFile,
    /** A writer's own fonts that may be embedded, by stored value. */
    private readonly own: ReadonlyMap<string, Uint8Array>,
    /** The Vlo font for each own font that cannot be embedded, by stored value. */
    private readonly swaps: ReadonlyMap<string, string>,
    private readonly fallbackFont: string,
  ) {
    pdf.registerFontkit(fontkit);
  }

  /** The Vlo font id or own font value that a stored font value draws with. */
  resolve(value: string | undefined): string {
    const v = value ?? this.fallbackFont;
    if (PDF_FONTS[v]) return v;
    if (localFontName(v) !== null) {
      if (this.own.has(v)) return v;
      return this.swaps.get(v) ?? this.fallbackFont;
    }
    return this.fallbackFont;
  }

  private font(key: string, bytes: () => Promise<Uint8Array>): Promise<PDFFont> {
    let pending = this.embedded.get(key);
    if (!pending) {
      pending = bytes().then((b) => {
        evenGlyphs(b);
        return this.pdf.embedFont(b, { subset: maySubset(b) });
      });
      this.embedded.set(key, pending);
    }
    return pending;
  }

  /** The face for a font in a style. A missing italic or bold file gives a drawn italic or bold. */
  face(value: string | undefined, bold: boolean, italic: boolean): Promise<Face> {
    const id = this.resolve(value);
    const key = `${id}|${String(bold)}|${String(italic)}`;
    let pending = this.faces.get(key);
    if (!pending) {
      pending = this.embed(id, bold, italic);
      this.faces.set(key, pending);
    }
    return pending;
  }

  private async embed(id: string, bold: boolean, italic: boolean): Promise<Face> {
    const own = this.own.get(id);
    if (own) {
      const font = await this.font(`own:${id}`, () => Promise.resolve(own));
      return { font, metrics: metricsOf(font), fakeBold: bold, fakeItalic: italic };
    }
    const paths = fontPaths(id);
    // The closest file the font has: bold italic, then italic or bold, then regular.
    const order: FontStyle[] =
      bold && italic
        ? ['boldItalic', 'italic', 'bold', 'regular']
        : bold
          ? ['bold', 'regular']
          : italic
            ? ['italic', 'regular']
            : ['regular'];
    const style = order.find((s) => paths[s]) ?? 'regular';
    const path = paths[style] ?? `fonts/${DEFAULT_FONT}/regular.ttf`;
    const font = await this.font(path, () => this.load(path));
    return {
      font,
      metrics: metricsOf(font),
      fakeBold: bold && style !== 'bold' && style !== 'boldItalic',
      fakeItalic: italic && style !== 'italic' && style !== 'boldItalic',
    };
  }

  /** The face that draws symbols a text font lacks. */
  math(): Promise<Face> {
    return this.face(MATH_FONT, false, false);
  }
}
