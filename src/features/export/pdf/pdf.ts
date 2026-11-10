import { PDFDocument } from 'pdf-lib';
import { bookMargins, gutterFor, isNumbered, TRIM_POINTS } from '@/features/book/book';
import type { TextFill } from '@/features/editor/format/fill';
import { fontLabel } from '@/features/editor/format/fonts';
import type { NoteContent } from '@/features/editor/format/notes';
import { mathmlFor, type LatexToMathml } from '../latex';
import { headerText, roundedWords, type ManuscriptSetup } from '../manuscript';
import type { BookSettings } from '@/lib/db';
import {
  footnotesOf,
  repeatsTitle,
  runsText,
  textBlocks,
  type Align,
  type Block,
  type ExportDoc,
  type HeadingBlock,
  type Run,
  type RunStyle,
} from '../model';
import { Drawer, INK, rgbOf, type Rgb } from './draw';
import { FontSet, type Face, type LoadFile } from './fonts';
import { MathLayout, type MathBox } from './math';
import { toScriptPdf } from './script';
import { shifted, type Sink } from './sink';

/*
 * PDF export (spec section 9). Vlo lays out the text itself: each line is measured with the embedded font,
 * long lines wrap (a poem line wraps under its hanging indent), and leading and inner spaces stay. Notes sit
 * at the foot of the page that refers to them, and every page after the title has its number.
 *
 * Book layout (F51, plan Task J4) adds a trim size, mirrored margins with a gutter, front and back matter,
 * chapter openings on right-hand pages, running heads, and widow and orphan control.
 */

export interface PdfOptions {
  /** Reads a file under public/, such as "fonts/lora/regular.ttf". */
  loadFile: LoadFile;
  /** LaTeX to MathML. MathLive by default. */
  toMathml?: LatexToMathml;
  /** The writer's own fonts that may be embedded, by stored value. */
  own?: ReadonlyMap<string, Uint8Array>;
  /** The Vlo font for each own font that cannot be embedded, by stored value. */
  swaps?: ReadonlyMap<string, string>;
  /** Standard manuscript format, for a novel. */
  manuscript?: ManuscriptSetup;
}

export interface DrawnStyle {
  /** The font's name. */
  font: string;
  style: 'bold' | 'italic';
}

export interface PdfResult {
  bytes: Uint8Array;
  /** Each font and style that the PDF draws by slanting or thickening the upright letters. */
  drawnStyles: DrawnStyle[];
}

const POINTS = { letter: [612, 792], a4: [595.28, 841.89] } as const;
const MARGIN = 72;
const TEXT_SIZE = 12;
const BOOK_TEXT_SIZE = 11;
const LINK_BLUE = rgbOf('#2f5d8a');
const MUTED = rgbOf('#5c5751');

interface Paint {
  color: Rgb;
  highlight?: Rgb;
  underline: boolean;
  strike: boolean;
  link?: string;
  fill?: TextFill;
  /** The same object for every piece of one styled run, so a gradient spans the whole run on a line. */
  fillId?: object;
}

interface TextAtom {
  kind: 'text';
  text: string;
  face: Face;
  size: number;
  rise: number;
  width: number;
  space: boolean;
  paint: Paint;
  note?: number;
}

interface BoxAtom {
  kind: 'box';
  box: MathBox;
  width: number;
  color: Rgb;
}

type Atom = TextAtom | BoxAtom | { kind: 'break' };
type InlineAtom = TextAtom | BoxAtom;

interface Line {
  atoms: InlineAtom[];
  width: number;
  ascent: number;
  depth: number;
  /** True when the line ends a paragraph or a hard break, so justify leaves it alone. */
  last: boolean;
  indent: number;
}

/** One line or one piece of a page, placed from the top of its own height. */
interface Row {
  height: number;
  spaceBefore: number;
  keepWithNext?: boolean;
  breakBefore?: boolean;
  /** Start this row this far down an empty page, as a share of the text height. */
  dropTo?: number;
  /** Start this row on a new right-hand page, after a blank page when needed. */
  recto?: boolean;
  /** The id of the section that starts with this row, for the contents page. */
  mark?: string;
  /** The place of a body line in its paragraph, for widow and orphan control. */
  para?: { line: number; lines: number };
  /** The distance from the row's top to its baseline. */
  baseline?: number;
  notes: number[];
  draw: (d: Sink, top: number) => void;
}

interface Base {
  font: string | undefined;
  size: number;
  bold?: boolean;
  italic?: boolean;
}

/** Rows draw from the left edge of the text, and each page moves them right by its left margin. */
interface Settings {
  textWidth: number;
  textSize: number;
  /** Line spacing for body text, as a multiple of the font's single spacing. */
  spacing: number;
  paragraphGap: number;
  /** The space before a quote, a list, an equation or a scene break. */
  blockGap: number;
  manuscript: boolean;
  book?: BookSettings;
}

const FLEURON = '\u2766';

/** Keeps the first two and the last two lines of a paragraph together, so no page has a widow or an orphan. */
function keepLines(rows: readonly Row[]): void {
  rows.forEach((row, line) => {
    row.para = { line, lines: rows.length };
  });
  const [first] = rows;
  const beforeLast = rows[rows.length - 2];
  if (first && beforeLast) first.keepWithNext = beforeLast.keepWithNext = true;
}

function heightOf(rows: readonly Row[]): number {
  return rows.reduce((sum, row, i) => sum + (i > 0 ? row.spaceBefore : 0) + row.height, 0);
}

const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function leading(size: number, spacing: number): number {
  return size * 1.2 * spacing;
}

class Layout {
  private readonly notes = new Map<number, NoteContent>();
  private math: MathLayout | null = null;
  private readonly drawn = new Map<string, DrawnStyle>();
  /** The last block laid out, for the first-line indent of a book. */
  private last: Block['type'] | null = null;
  /** True until the first block after a chapter opening, for its drop cap. */
  private afterOpening = false;
  private chapters = 0;

  constructor(
    private readonly fonts: FontSet,
    doc: ExportDoc,
    private readonly settings: Settings,
    private readonly toMathml: LatexToMathml,
    private readonly bodyFont: string,
  ) {
    for (const note of footnotesOf(doc)) this.notes.set(note.number, note.note);
  }

  async face(font: string | undefined, bold: boolean, italic: boolean): Promise<Face> {
    const face = await this.fonts.face(font, bold, italic);
    const name = fontLabel(this.fonts.resolve(font));
    if (face.fakeBold) this.drawn.set(`${name}|bold`, { font: name, style: 'bold' });
    if (face.fakeItalic) this.drawn.set(`${name}|italic`, { font: name, style: 'italic' });
    return face;
  }

  get drawnStyles(): DrawnStyle[] {
    return [...this.drawn.values()];
  }

  private async mathLayout(): Promise<MathLayout> {
    if (!this.math) {
      const [upright, italic, symbol] = await Promise.all([
        this.face(this.bodyFont, false, false),
        this.face(this.bodyFont, false, true),
        this.fonts.math(),
      ]);
      this.math = new MathLayout({ upright, italic, symbol });
    }
    return this.math;
  }

  private paint(style: RunStyle): Paint {
    const plain = this.settings.manuscript;
    return {
      color: plain ? INK : style.link ? LINK_BLUE : style.color ? rgbOf(style.color) : INK,
      ...(style.highlight && !plain ? { highlight: rgbOf(style.highlight) } : {}),
      underline: style.underline === true || (style.link !== undefined && !plain),
      strike: style.strike === true,
      ...(style.link ? { link: style.link } : {}),
      ...(style.fill && !plain ? { fill: style.fill, fillId: style.fill } : {}),
    };
  }

  /** Splits text into pieces that one face can draw: the run's face, or the math face for symbols. */
  private async pieces(text: string, face: Face): Promise<{ text: string; face: Face }[]> {
    const out: { text: string; face: Face }[] = [];
    let symbol: Face | null = null;
    for (const char of text) {
      const code = char.codePointAt(0) ?? 0;
      let use = face;
      if (code > 32 && !face.metrics.hasGlyphForCodePoint(code)) {
        symbol ??= await this.fonts.math();
        if (symbol.metrics.hasGlyphForCodePoint(code)) use = symbol;
      }
      const last = out[out.length - 1];
      if (last?.face === use) last.text += char;
      else out.push({ text: char, face: use });
    }
    return out;
  }

  async atoms(runs: readonly Run[], base: Base): Promise<Atom[]> {
    const out: Atom[] = [];
    const plain = this.settings.manuscript;
    for (const run of runs) {
      if (run.type === 'break') {
        out.push({ kind: 'break' });
      } else if (run.type === 'math') {
        const layout = await this.mathLayout();
        const size = base.size * (plain ? 1 : (run.style.size ?? 1));
        const box = layout.equation(this.toMathml(run.latex), run.latex, size, false);
        out.push({ kind: 'box', box, width: box.width, color: this.paint(run.style).color });
      } else if (run.type === 'footnote') {
        const face = await this.face(base.font, false, false);
        const size = base.size * 0.65;
        const text = String(run.number);
        out.push({
          kind: 'text',
          text,
          face,
          size,
          rise: base.size * 0.35,
          width: face.font.widthOfTextAtSize(text, size),
          space: false,
          paint: { color: INK, underline: false, strike: false },
          note: run.number,
        });
      } else {
        const style = run.style;
        const font = plain ? base.font : (style.font ?? base.font);
        const face = await this.face(
          font,
          base.bold === true || style.bold === true,
          base.italic === true || style.italic === true,
        );
        const script = style.superscript === true || style.subscript === true;
        const size = base.size * (plain ? 1 : (style.size ?? 1)) * (script ? 0.7 : 1);
        const rise = style.superscript ? base.size * 0.35 : style.subscript ? -base.size * 0.15 : 0;
        const paint = this.paint(style);
        const text = run.text.replace(/\t/g, '    ');
        for (const part of text.match(/ +|[^ ]+/g) ?? []) {
          const space = part.startsWith(' ');
          for (const piece of space ? [{ text: part, face }] : await this.pieces(part, face)) {
            out.push({
              kind: 'text',
              text: piece.text,
              face: piece.face,
              size,
              rise,
              width: piece.face.font.widthOfTextAtSize(piece.text, size),
              space,
              paint,
            });
          }
        }
      }
    }
    return out;
  }

  /** Splits an atom that is wider than a line, at character boundaries. */
  private splitWide(atom: TextAtom, room: number): TextAtom[] {
    const out: TextAtom[] = [];
    let current = '';
    for (const { segment } of SEGMENTER.segment(atom.text)) {
      const next = current + segment;
      if (current !== '' && atom.face.font.widthOfTextAtSize(next, atom.size) > room) {
        out.push({ ...atom, text: current, width: atom.face.font.widthOfTextAtSize(current, atom.size) });
        current = segment;
      } else {
        current = next;
      }
    }
    if (current !== '')
      out.push({ ...atom, text: current, width: atom.face.font.widthOfTextAtSize(current, atom.size) });
    return out;
  }

  /**
   * Fills lines word by word. Spaces at a wrap are dropped. Leading spaces of the first line stay, so a
   * poem line keeps its indent. A word wider than a whole line breaks between its letters.
   */
  breakLines(atoms: readonly Atom[], indentOf: (line: number) => number, width: number): Line[] {
    const lines: Line[] = [];
    let current: InlineAtom[] = [];
    let currentWidth = 0;
    let spaces: InlineAtom[] = [];
    let spacesWidth = 0;
    let hasWord = false;
    const finish = (last: boolean) => {
      const indent = indentOf(lines.length);
      lines.push({ ...measure(current), last, indent });
      current = [];
      currentWidth = 0;
      spaces = [];
      spacesWidth = 0;
      hasWord = false;
    };
    // A word: the atoms between two spaces.
    let word: InlineAtom[] = [];
    const placeWord = () => {
      if (word.length === 0) return;
      const wordWidth = word.reduce((sum, a) => sum + a.width, 0);
      const room = width - indentOf(lines.length);
      const leadingSpaces = lines.length === 0 && !hasWord;
      if (hasWord && currentWidth + spacesWidth + wordWidth > room) finish(false);
      const roomNow = width - indentOf(lines.length);
      const keep = hasWord || leadingSpaces ? spaces : [];
      const keepWidth = hasWord || leadingSpaces ? spacesWidth : 0;
      current.push(...keep);
      currentWidth += keepWidth;
      spaces = [];
      spacesWidth = 0;
      if (currentWidth + wordWidth > roomNow) {
        // Too wide for any line: break it between letters.
        for (const atom of word) {
          const parts =
            atom.kind === 'text'
              ? this.splitWide(atom, Math.max(roomNow - currentWidth, roomNow / 4))
              : [atom];
          for (const part of parts) {
            if (currentWidth > 0 && currentWidth + part.width > width - indentOf(lines.length)) {
              finish(false);
            }
            current.push(part);
            currentWidth += part.width;
            hasWord = true;
          }
        }
      } else {
        current.push(...word);
        currentWidth += wordWidth;
        hasWord = true;
      }
      word = [];
    };
    for (const atom of atoms) {
      if (atom.kind === 'break') {
        placeWord();
        finish(true);
        continue;
      }
      if (atom.kind === 'text' && atom.space) {
        placeWord();
        spaces.push(atom);
        spacesWidth += atom.width;
        continue;
      }
      word.push(atom);
    }
    placeWord();
    // A hard break at the very end adds no empty line, as in the editor.
    if (current.length === 0 && lines.length > 0 && spaces.length === 0) return lines;
    finish(true);
    return lines;
  }

  /** A line as a row, with its own height. */
  lineRow(
    line: Line,
    x0: number,
    avail: number,
    align: Align | undefined,
    spacing: number,
    size: number,
  ): Row {
    const lead = leading(size, spacing);
    const ascent = Math.max(lead * 0.78, line.ascent);
    const depth = Math.max(lead * 0.22, line.depth);
    const notes = line.atoms.flatMap((a) => (a.kind === 'text' && a.note !== undefined ? [a.note] : []));
    return {
      height: ascent + depth,
      spaceBefore: 0,
      baseline: ascent,
      notes,
      draw: (d, top) => {
        drawLine(d, line, x0, top - ascent, avail, align);
      },
    };
  }

  async paragraph(
    runs: readonly Run[],
    options: {
      left: number;
      right: number;
      align?: Align | undefined;
      spacing: number;
      firstIndent?: number;
      dropCap?: boolean;
      hanging?: number;
      base: Base;
    },
  ): Promise<Row[]> {
    const { base } = options;
    const avail = this.settings.textWidth - options.left - options.right;
    const x0 = options.left;
    let atoms = await this.atoms(runs, base);
    let cap: { atom: TextAtom; width: number; lines: number } | null = null;
    if (options.dropCap) {
      const first = atoms[0];
      const letter =
        first?.kind === 'text' && !first.space ? [...SEGMENTER.segment(first.text)][0]?.segment : undefined;
      if (first?.kind === 'text' && letter) {
        // The letter spans three lines: its top at the first line's capital height, its foot on the third baseline.
        const lead = leading(base.size, options.spacing);
        const m = first.face.metrics;
        const capRatio = (m.capHeight || m.ascent * 0.7) / m.unitsPerEm;
        const size = (2 * lead + capRatio * base.size) / capRatio;
        const width = first.face.font.widthOfTextAtSize(letter, size);
        cap = {
          atom: { ...first, text: letter, size, width, rise: 0 },
          width: width + base.size * 0.25,
          lines: 3,
        };
        const rest = first.text.slice(letter.length);
        atoms = [
          ...(rest === ''
            ? []
            : [{ ...first, text: rest, width: first.face.font.widthOfTextAtSize(rest, first.size) }]),
          ...atoms.slice(1),
        ];
      }
    }
    const hanging = (options.hanging ?? 0) * base.size;
    const indentOf = (line: number) => {
      if (cap && line < cap.lines) return cap.width;
      if (line === 0) return options.firstIndent ?? 0;
      return hanging;
    };
    const lines = this.breakLines(atoms, indentOf, avail);
    // A drop cap needs the three lines beside it.
    if (cap && lines.length < cap.lines) return this.paragraph(runs, { ...options, dropCap: false });
    const rows = lines.map((line) =>
      this.lineRow(line, x0, avail, options.align, options.spacing, base.size),
    );
    const first = rows[0];
    if (cap && first) {
      const { atom } = cap;
      const lead = leading(base.size, options.spacing);
      const ascent = Math.max(lead * 0.78, lines[0]?.ascent ?? 0);
      const draw = first.draw;
      first.draw = (d, top) => {
        draw(d, top);
        drawText(d, atom, x0, top - ascent - 2 * lead);
      };
      // Keep the three lines beside the letter together.
      rows.slice(0, cap.lines - 1).forEach((row) => {
        row.keepWithNext = true;
      });
    }
    return rows;
  }

  async block(block: Block, place: { left: number; right: number }, folder: boolean): Promise<Row[]> {
    const opening = this.afterOpening;
    this.afterOpening = false;
    const rows = await this.blockRows(block, place, folder, opening);
    this.last = block.type;
    return rows;
  }

  private async blockRows(
    block: Block,
    place: { left: number; right: number },
    folder: boolean,
    opening: boolean,
  ): Promise<Row[]> {
    const { spacing, paragraphGap, blockGap, manuscript, book, textSize } = this.settings;
    const body: Base = { font: this.bodyFont, size: textSize };
    const scale = textSize / TEXT_SIZE;
    const withGap = (rows: Row[], gap: number) => {
      const [first] = rows;
      if (first) first.spaceBefore = Math.max(first.spaceBefore, gap);
      return rows;
    };
    switch (block.type) {
      case 'paragraph': {
        // A book indents each paragraph that follows a paragraph, and justifies its lines.
        const indent = book
          ? this.last === 'paragraph'
            ? 1.5 * textSize
            : 0
          : manuscript
            ? 36
            : block.firstLineIndent
              ? 2 * textSize
              : 0;
        const rows = await this.paragraph(block.runs, {
          left: place.left,
          right: place.right,
          align: manuscript ? undefined : (block.align ?? (book ? 'justify' : undefined)),
          spacing: manuscript ? spacing : (block.lineSpacing ?? spacing),
          firstIndent: indent,
          dropCap: !manuscript && (block.dropCap === true || (opening && book?.dropCaps === true)),
          base: body,
        });
        if (book) keepLines(rows);
        return withGap(rows, paragraphGap);
      }
      case 'heading': {
        if (book && folder) {
          const title = runsText(block.runs).trim();
          return this.opening(block, block.level === 2 && isNumbered(title));
        }
        const sizes = manuscript ? [12, 12, 12, 12] : [22, 17, 14, 12];
        const size = (sizes[block.level - 1] ?? 12) * scale;
        const rows = await this.paragraph(block.runs, {
          left: place.left,
          right: place.right,
          align: manuscript && block.level <= 2 ? 'center' : block.align,
          spacing: 1.1,
          base: {
            font: this.bodyFont,
            size,
            bold: !manuscript || block.level > 2,
            italic: block.level === 4,
          },
        });
        rows.forEach((row) => {
          row.keepWithNext = true;
        });
        const first = rows[0];
        if (first) {
          first.spaceBefore = manuscript
            ? leading(textSize, spacing)
            : ([30, 24, 16, 12][block.level - 1] ?? 12) * scale;
          if (folder) {
            first.breakBefore = true;
            if (manuscript) first.dropTo = 1 / 3;
          }
        }
        const last = rows[rows.length - 1];
        if (last && manuscript && folder) {
          // A blank line between the chapter title and its first paragraph.
          last.height += leading(textSize, spacing);
        }
        return rows;
      }
      case 'sceneBreak': {
        if (book) return this.ornament(book.sceneBreak);
        const face = await this.face(this.bodyFont, false, false);
        const lead = leading(textSize, spacing);
        const width = face.font.widthOfTextAtSize('#', textSize);
        return [
          {
            height: lead * 1.5,
            spaceBefore: blockGap,
            notes: [],
            draw: (d, top) => {
              const x = place.left + (this.settings.textWidth - place.left - place.right - width) / 2;
              d.text('#', x, top - lead * 0.95, { face, size: textSize, color: INK });
            },
          },
        ];
      }
      case 'math': {
        const layout = await this.mathLayout();
        const box = layout.equation(this.toMathml(block.latex), block.latex, textSize * 1.1, true);
        const avail = this.settings.textWidth - place.left - place.right;
        return [
          {
            height: box.ascent + box.depth + textSize * 0.6,
            spaceBefore: blockGap,
            notes: [],
            draw: (d, top) => {
              const x = place.left + Math.max(0, (avail - box.width) / 2);
              box.draw(d, x, top - textSize * 0.3 - box.ascent, INK);
            },
          },
        ];
      }
      case 'quote': {
        const inner = { left: place.left + 24, right: place.right + 24 };
        this.last = 'quote';
        return withGap(await this.blocks(block.blocks, inner, false), blockGap);
      }
      case 'list': {
        const out: Row[] = [];
        const face = await this.face(this.bodyFont, false, false);
        const depth = Math.round(place.left / 22);
        for (const [i, item] of block.items.entries()) {
          const marker = block.ordered ? `${String(block.start + i)}.` : (['•', '◦', '▪'][depth % 3] ?? '•');
          // A text font with no hollow or square bullet draws it from the symbol font.
          const markerFace = (await this.pieces(marker, face))[0]?.face ?? face;
          const inner = { left: place.left + 22, right: place.right };
          this.last = 'list';
          const rows = await this.blocks(item, inner, false);
          const first = rows[0];
          if (first) {
            first.spaceBefore = i === 0 ? blockGap : blockGap / 2;
            const draw = first.draw;
            const markerWidth = markerFace.font.widthOfTextAtSize(marker, textSize);
            first.draw = (d, top) => {
              draw(d, top);
              const lead = leading(textSize, spacing);
              d.text(marker, inner.left - 6 - markerWidth, top - lead * 0.78, {
                face: markerFace,
                size: textSize,
                color: INK,
              });
            };
          }
          out.push(...rows);
        }
        return out;
      }
      case 'stanza': {
        const out: Row[] = [];
        for (const line of block.lines) {
          const rows = await this.paragraph(line.runs, {
            left: place.left,
            right: place.right,
            spacing: manuscript ? spacing : 1.15,
            hanging: line.hanging,
            base: body,
          });
          // An empty poem line keeps its height.
          out.push(...(rows.length > 0 ? rows : [this.blankRow(spacing)]));
        }
        return withGap(out, leading(textSize, manuscript ? spacing : 1.15));
      }
    }
  }

  private blankRow(spacing: number): Row {
    return {
      height: leading(this.settings.textSize, spacing),
      spaceBefore: 0,
      notes: [],
      draw: () => undefined,
    };
  }

  /**
   * A chapter, part or matter opening of a book: a new right-hand page, with the title sunk down the page
   * in the book's chapter style. A numbered chapter gets its number above the title.
   */
  async opening(block: HeadingBlock, numbered: boolean): Promise<Row[]> {
    const { textSize: size, spacing } = this.settings;
    const style = this.settings.book?.chapter ?? 'plain';
    const part = block.level === 1;
    const align: Align = part || style !== 'modern' ? 'center' : 'left';
    const rows: Row[] = [];
    if (numbered) {
      this.chapters += 1;
      if (style !== 'plain') {
        const number: Run = { type: 'text', text: String(this.chapters), style: {} };
        rows.push(
          ...(await this.paragraph([number], {
            left: 0,
            right: 0,
            align,
            spacing: 1,
            base: { font: this.bodyFont, size: (style === 'modern' ? 3.2 : 1.25) * size },
          })),
        );
      }
    }
    const titleRows = await this.paragraph(block.runs, {
      left: 0,
      right: 0,
      align,
      spacing: 1.1,
      base: {
        font: this.bodyFont,
        size: (part ? 2 : style === 'classic' ? 1.7 : 1.45) * size,
        bold: !part && style !== 'classic',
      },
    });
    const [firstTitle] = titleRows;
    if (firstTitle && rows.length > 0) firstTitle.spaceBefore = 0.6 * size;
    rows.push(...titleRows);
    const [first] = rows;
    const last = rows[rows.length - 1];
    if (first) {
      first.recto = true;
      first.dropTo = part ? 1 / 3 : style === 'plain' ? 1 / 8 : 1 / 5;
    }
    // A part stands alone on its page. A chapter keeps its title with its first lines.
    if (!part) {
      for (const row of rows) row.keepWithNext = true;
      if (last) last.height += 2 * leading(size, spacing);
      this.afterOpening = true;
    }
    this.last = 'heading';
    return rows;
  }

  /** A book's scene break: three stars, a fleuron or a blank line. */
  private async ornament(kind: BookSettings['sceneBreak']): Promise<Row[]> {
    const { textSize: size, spacing } = this.settings;
    const lead = leading(size, spacing);
    if (kind === 'space') return [{ height: lead, spaceBefore: 0, notes: [], draw: () => undefined }];
    const text = kind === 'stars' ? '*' : FLEURON;
    let face = await this.face(this.bodyFont, false, false);
    // Few text fonts have a fleuron. EB Garamond has one.
    if (!face.metrics.hasGlyphForCodePoint(0x2766) && kind === 'fleuron')
      face = await this.face('eb-garamond', false, false);
    const glyphSize = kind === 'stars' ? size : 1.4 * size;
    const width = face.font.widthOfTextAtSize(text, glyphSize);
    const count = kind === 'stars' ? 3 : 1;
    const total = count * width + (count - 1) * size;
    return [
      {
        height: 2 * lead,
        spaceBefore: 0,
        notes: [],
        draw: (d, top) => {
          const x = (this.settings.textWidth - total) / 2;
          for (let i = 0; i < count; i += 1)
            d.text(text, x + i * (width + size), top - 1.3 * lead, { face, size: glyphSize, color: INK });
        },
      },
    ];
  }

  async blocks(
    blocks: readonly Block[],
    place: { left: number; right: number },
    folder: boolean,
  ): Promise<Row[]> {
    const out: Row[] = [];
    for (const block of blocks)
      out.push(...(await this.block(block, place, folder && block.type === 'heading')));
    return out;
  }

  /** The rows of one note at the foot of a page: its number, then its text. */
  async noteRows(number: number): Promise<Row[]> {
    const note = this.notes.get(number) ?? [];
    const runs: Run[] = [
      { type: 'text', text: `${String(number)}  `, style: {} },
      ...note.map((r): Run => {
        const marks = new Set(r.marks?.map((m) => m.type));
        const style: RunStyle = {
          ...(marks.has('bold') ? { bold: true } : {}),
          ...(marks.has('italic') ? { italic: true } : {}),
          ...(marks.has('underline') ? { underline: true } : {}),
          ...(marks.has('strike') ? { strike: true } : {}),
          ...(marks.has('superscript') ? { superscript: true } : {}),
          ...(marks.has('subscript') ? { subscript: true } : {}),
        };
        return { type: 'text', text: r.text, style };
      }),
    ];
    const rows = await this.paragraph(runs, {
      left: 0,
      right: 0,
      spacing: 1,
      hanging: 1.2,
      base: { font: this.bodyFont, size: this.settings.textSize - 2 },
    });
    const first = rows[0];
    if (first) first.spaceBefore = 3;
    return rows;
  }
}

function measure(atoms: InlineAtom[]): { atoms: InlineAtom[]; width: number; ascent: number; depth: number } {
  let width = 0;
  let ascent = 0;
  let depth = 0;
  for (const a of atoms) {
    width += a.width;
    if (a.kind === 'box') {
      ascent = Math.max(ascent, a.box.ascent);
      depth = Math.max(depth, a.box.depth);
    } else {
      const m = a.face.metrics;
      ascent = Math.max(ascent, (m.ascent / m.unitsPerEm) * a.size + a.rise);
      depth = Math.max(depth, (Math.abs(m.descent) / m.unitsPerEm) * a.size - a.rise);
    }
  }
  return { atoms, width, ascent, depth };
}

function drawText(
  d: Sink,
  atom: TextAtom,
  x: number,
  baseline: number,
  box?: { x0: number; x1: number },
): void {
  const { face, size, paint } = atom;
  const y = baseline + atom.rise;
  const m = face.metrics;
  const up = (m.ascent / m.unitsPerEm) * size;
  const down = (Math.abs(m.descent) / m.unitsPerEm) * size;
  if (paint.highlight) d.rect(x, y - down, atom.width, up + down, paint.highlight);
  // Spaces are drawn too, so text copied from the PDF keeps them.
  if (atom.space) {
    d.text(atom.text, x, y, { face, size, color: paint.color });
  } else {
    if (paint.fill) {
      const first = paint.fill.stops[0]?.color;
      if (paint.fill.look === 'glow' && first) d.glow(atom.text, x, y, { face, size, color: rgbOf(first) });
      d.gradientText(atom.text, x, y, { face, size, color: paint.color }, paint.fill, {
        x0: box?.x0 ?? x,
        x1: box?.x1 ?? x + atom.width,
        y0: y - down,
        y1: y + up,
      });
    } else {
      d.text(atom.text, x, y, { face, size, color: paint.color });
    }
  }
  const thickness = Math.max(size * 0.055, 0.5);
  const lineColor = paint.fill ? rgbOf(paint.fill.stops[0]?.color ?? '#1f1d1b') : paint.color;
  if (paint.underline) d.rect(x, y - size * 0.12, atom.width, thickness, lineColor);
  if (paint.strike) d.rect(x, y + size * 0.27, atom.width, thickness, lineColor);
  if (paint.link && !atom.space) d.link(x, y - down, atom.width, up + down, paint.link);
}

function drawLine(
  d: Sink,
  line: Line,
  x0: number,
  baseline: number,
  avail: number,
  align: Align | undefined,
): void {
  const room = avail - line.indent;
  const free = Math.max(0, room - line.width);
  let x = x0 + line.indent;
  let extra = 0;
  if (align === 'center') x += free / 2;
  else if (align === 'right') x += free;
  else if (align === 'justify' && !line.last) {
    const gaps = line.atoms.filter((a) => a.kind === 'text' && a.space).length;
    if (gaps > 0) extra = free / gaps;
  }
  // The span of each gradient run on this line, so its colors run across the whole run.
  const spans = new Map<object, { x0: number; x1: number }>();
  let at = x;
  for (const atom of line.atoms) {
    const width = atom.width + (atom.kind === 'text' && atom.space ? extra : 0);
    if (atom.kind === 'text' && atom.paint.fillId) {
      const span = spans.get(atom.paint.fillId);
      if (span) span.x1 = at + width;
      else spans.set(atom.paint.fillId, { x0: at, x1: at + width });
    }
    at += width;
  }
  for (const atom of line.atoms) {
    if (atom.kind === 'box') {
      atom.box.draw(d, x, baseline, atom.color);
      x += atom.width;
      continue;
    }
    const width = atom.width + (atom.space ? extra : 0);
    const span = atom.paint.fillId ? spans.get(atom.paint.fillId) : undefined;
    drawText(d, { ...atom, width }, x, baseline, span);
    x += width;
  }
}

interface PageRows {
  rows: { row: Row; top: number }[];
  notes: { row: Row; number: number }[];
  notesHeight: number;
}

/** The pages of an export, laid out once for the PDF file and for the book preview. */
export interface LaidOutPdf {
  /** The width and height of every page. */
  size: readonly [number, number];
  pages: readonly PageRows[];
  /** Draws one page, with its page number and running head. */
  drawPage: (index: number, sink: Sink) => void;
  drawnStyles: DrawnStyle[];
}

interface ContentsEntry {
  id: string;
  title: string;
  part: boolean;
}

/** The sections that a book's contents lists: its parts and chapters, or else each titled item. */
function contentsEntries(doc: ExportDoc): ContentsEntry[] {
  const folders = doc.sections.filter((s) => s.form === null);
  const titled = doc.sections.filter((s) => s.title.trim() !== '' && s.blocks[0]?.type === 'heading');
  return (folders.length > 0 ? folders : titled).map((s) => {
    const first = s.blocks[0];
    return { id: s.id, title: s.title, part: first?.type === 'heading' && first.level === 1 };
  });
}

function matterHeading(text: string): HeadingBlock {
  return { type: 'heading', level: 2, runs: [{ type: 'text', text, style: {} }] };
}

/**
 * A book's front matter: the half title, the title page, the copyright page on its back, the dedication,
 * the epigraph and the contents. Each one that has text starts a right-hand page.
 */
async function frontMatter(
  layout: Layout,
  doc: ExportDoc,
  book: BookSettings,
  settings: Settings,
  textHeight: number,
  bodyFont: string,
  folios: ReadonlyMap<string, number>,
): Promise<Row[]> {
  const size = settings.textSize;
  const rows: Row[] = [];
  const page = (part: Row[], dropTo: number, recto = true) => {
    const [first] = part;
    if (!first) return;
    first.breakBefore = true;
    first.recto = recto;
    first.dropTo = Math.max(0, dropTo);
    rows.push(...part);
  };
  const lines = (text: string, base: Base, align: Align = 'center') =>
    layout.paragraph([{ type: 'text', text, style: {} }], { left: 0, right: 0, align, spacing: 1.1, base });
  const matter = async (body: string, base: Base, align: Align) => {
    const out: Row[] = [];
    for (const block of textBlocks(body)) {
      const part = await layout.paragraph(block.runs, { left: 0, right: 0, align, spacing: 1.2, base });
      const [first] = part;
      if (first && out.length > 0) first.spaceBefore = 0.8 * base.size;
      out.push(...part);
    }
    return out;
  };

  page(await lines(doc.title, { font: bodyFont, size: 1.4 * size }), 1 / 4);
  const title = await lines(doc.title, { font: bodyFont, size: 2.2 * size, bold: true });
  if (doc.author) {
    const author = await lines(doc.author, { font: bodyFont, size: 1.3 * size, italic: true });
    const [first] = author;
    if (first) first.spaceBefore = 1.5 * size;
    title.push(...author);
  }
  page(title, 1 / 4);
  // The copyright page is the back of the title page, with its text at the foot.
  const copyright = await matter(book.copyright, { font: bodyFont, size: 0.8 * size }, 'left');
  page(copyright, 1 - heightOf(copyright) / textHeight, false);
  page(await matter(book.dedication, { font: bodyFont, size, italic: true }, 'center'), 1 / 3);
  page(await matter(book.epigraph, { font: bodyFont, size, italic: true }, 'center'), 1 / 4);

  const entries = contentsEntries(doc);
  if (book.contents && entries.length > 1) {
    rows.push(...(await layout.opening(matterHeading('Contents'), false)));
    const parts = entries.some((e) => e.part);
    const face = await layout.face(bodyFont, false, false);
    for (const entry of entries) {
      const entryRows = await layout.paragraph([{ type: 'text', text: entry.title, style: {} }], {
        left: parts && !entry.part ? size : 0,
        right: 3 * size,
        spacing: 1.2,
        hanging: 1,
        base: { font: bodyFont, size, bold: entry.part },
      });
      const [first] = entryRows;
      const last = entryRows[entryRows.length - 1];
      if (first) first.spaceBefore = entry.part ? 0.8 * size : 0.3 * size;
      if (last) {
        const draw = last.draw;
        const baseline = last.baseline ?? 0;
        // The page number comes after pagination, so the row reads it when it draws.
        last.draw = (d, top) => {
          draw(d, top);
          const folio = folios.get(entry.id);
          if (folio === undefined) return;
          const text = String(folio);
          const width = face.font.widthOfTextAtSize(text, size);
          d.text(text, settings.textWidth - width, top - baseline, { face, size, color: INK });
        };
      }
      rows.push(...entryRows);
    }
  }
  return rows;
}

/** A book's back matter: the acknowledgments and "About the author", each on a right-hand page. */
async function backMatter(layout: Layout, book: BookSettings): Promise<Row[]> {
  const rows: Row[] = [];
  for (const [name, body] of [
    ['Acknowledgments', book.acknowledgments],
    ['About the author', book.about],
  ] as const) {
    if (body.trim() === '') continue;
    rows.push(...(await layout.opening(matterHeading(name), false)));
    rows.push(...(await layout.blocks(textBlocks(body), { left: 0, right: 0 }, false)));
  }
  return rows;
}

/** One layout of every page. A book lays out again when its page count needs a wider gutter. */
async function layOutOnce(
  doc: ExportDoc,
  options: PdfOptions,
  fonts: FontSet,
  toMathml: LatexToMathml,
  pagesGuess: number,
): Promise<LaidOutPdf & { gutter: number }> {
  const book = doc.book;
  const manuscript = book ? undefined : options.manuscript;
  const [pageWidth, pageHeight] = book ? TRIM_POINTS[book.trim] : POINTS[doc.paper];
  const margins = book
    ? bookMargins(pagesGuess)
    : { inside: MARGIN, outside: MARGIN, top: MARGIN, bottom: MARGIN };
  const bodyFont = manuscript?.typewriter ? 'courier-prime' : doc.font;
  const textSize = book ? BOOK_TEXT_SIZE : TEXT_SIZE;
  const spacing = manuscript ? 2 : book ? 1.2 : 1.15;
  const gap = manuscript ? 0 : 8;
  const settings: Settings = {
    textWidth: pageWidth - margins.inside - margins.outside,
    textSize,
    spacing,
    paragraphGap: book ? 0 : gap,
    blockGap: book ? leading(textSize, spacing) / 2 : gap,
    manuscript: manuscript !== undefined,
    ...(book ? { book } : {}),
  };
  const layout = new Layout(fonts, doc, settings, toMathml, bodyFont);
  const textTop = pageHeight - margins.top;
  const textBottom = margins.bottom;
  const textHeight = textTop - textBottom;
  /** The page number of each marked section, filled in after pagination. */
  const folios = new Map<string, number>();

  // The opening: the front matter of a book, a title page for a whole export, a title for one item.
  const rows: Row[] = [];
  const titlePage = book !== undefined || manuscript !== undefined || doc.sections.length > 1;
  const center = (text: string, face: Face, size: number, baselineFromTop: number): Row => ({
    height: 0,
    spaceBefore: 0,
    notes: [],
    draw: (d, top) => {
      const width = face.font.widthOfTextAtSize(text, size);
      d.text(text, (settings.textWidth - width) / 2, top - baselineFromTop, { face, size, color: INK });
    },
  });
  if (book) {
    rows.push(...(await frontMatter(layout, doc, book, settings, textHeight, bodyFont, folios)));
  } else if (manuscript) {
    const plain = await layout.face(bodyFont, false, false);
    const line = TEXT_SIZE * 1.2;
    const left = [
      manuscript.name,
      ...manuscript.contact
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== ''),
    ];
    const count = roundedWords(manuscript.words, doc.language);
    rows.push({
      height: textHeight,
      spaceBefore: 0,
      notes: [],
      draw: (d, top) => {
        left.forEach((text, i) => {
          d.text(text, 0, top - TEXT_SIZE - i * line, { face: plain, size: TEXT_SIZE, color: INK });
        });
        const width = plain.font.widthOfTextAtSize(count, TEXT_SIZE);
        d.text(count, settings.textWidth - width, top - TEXT_SIZE, {
          face: plain,
          size: TEXT_SIZE,
          color: INK,
        });
      },
    });
    const byline = `by ${manuscript.name}`;
    rows.push(center(doc.title, plain, TEXT_SIZE, -textHeight / 2));
    rows.push(center(byline, plain, TEXT_SIZE, -textHeight / 2 + 2 * line));
  } else if (titlePage) {
    const titleFace = await layout.face(bodyFont, true, false);
    rows.push({ ...center(doc.title, titleFace, 28, textHeight / 3), height: textHeight });
    if (doc.author) {
      const italicFace = await layout.face(bodyFont, false, true);
      rows.push(center(doc.author, italicFace, 14, -textHeight * (2 / 3) + 40));
    }
  } else if (doc.title !== '') {
    // A text with no title, such as a cover letter, starts with its first paragraph.
    const titleRows = await layout.paragraph([{ type: 'text', text: doc.title, style: {} }], {
      left: 0,
      right: 0,
      align: 'center',
      spacing: 1.1,
      base: { font: bodyFont, size: 22, bold: true },
    });
    rows.push(...titleRows);
    if (doc.author) {
      const authorRows = await layout.paragraph(
        [{ type: 'text', text: doc.author, style: { italic: true } }],
        {
          left: 0,
          right: 0,
          align: 'center',
          spacing: 1.1,
          base: { font: bodyFont, size: 13 },
        },
      );
      const [first] = authorRows;
      if (first) first.spaceBefore = 6;
      rows.push(...authorRows);
    }
    const last = rows[rows.length - 1];
    if (last) last.height += 18;
  }

  const bodyFirst = rows.length;
  let firstContent = true;
  for (const section of doc.sections) {
    const blocks = section.blocks.filter((block) => !repeatsTitle(doc, section, block));
    const sectionRows = await layout.blocks(blocks, { left: 0, right: 0 }, section.form === null);
    const first = sectionRows[0];
    if (first && book) {
      first.mark = section.id;
      // The text starts on a right-hand page, and each poem on a page of its own.
      if (firstContent) first.recto = true;
      else if (section.form === 'poem') first.breakBefore = true;
    } else if (first && firstContent && titlePage) first.breakBefore = true;
    if (first && firstContent && !titlePage) first.spaceBefore = 0;
    if (first) firstContent = false;
    rows.push(...sectionRows);
  }
  if (book) rows.push(...(await backMatter(layout, book)));

  // Pages: rows from the top, notes from the foot. A row moves on when it and its notes do not fit.
  const pages: PageRows[] = [{ rows: [], notes: [], notesHeight: 0 }];
  let y = textTop;
  let bodyPage = -1;
  const markPages = new Map<string, number>();
  const noteCache = new Map<number, Row[]>();
  const notesOf = async (numbers: readonly number[]) => {
    const out: { row: Row; number: number }[] = [];
    for (const n of numbers) {
      let cached = noteCache.get(n);
      if (!cached) {
        cached = await layout.noteRows(n);
        noteCache.set(n, cached);
      }
      out.push(...cached.map((row) => ({ row, number: n })));
    }
    return out;
  };
  const separator = 14;
  const current = (): PageRows => {
    const last = pages[pages.length - 1];
    if (last) return last;
    const page = { rows: [], notes: [], notesHeight: 0 };
    pages.push(page);
    return page;
  };
  const empty = () => current().rows.length === 0;
  const newPage = () => {
    pages.push({ rows: [], notes: [], notesHeight: 0 });
    y = textTop;
  };
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    if ((row.breakBefore || row.recto) && !empty()) newPage();
    // The first page is a right-hand page, so each right-hand page has an even index.
    if (row.recto && (pages.length - 1) % 2 === 1) newPage();
    // Keep a row with the rows it must not be split from, such as a heading and its first line.
    let need = row.height;
    let end = i;
    for (; rows[end]?.keepWithNext && rows[end + 1]; end += 1)
      need += (rows[end + 1]?.spaceBefore ?? 0) + (rows[end + 1]?.height ?? 0);
    const noteRows = await notesOf(row.notes);
    // The group's notes go on the same page, so a note on a paragraph's last line keeps the line company.
    const groupNotes = end === i ? noteRows : await notesOf(rows.slice(i, end + 1).flatMap((r) => r.notes));
    const height = (notes: typeof noteRows) =>
      notes.reduce((sum, n) => sum + n.row.spaceBefore + n.row.height, 0);
    const notesExtra = height(noteRows);
    const separatorExtra = groupNotes.length > 0 && current().notes.length === 0 ? separator : 0;
    const space = empty() ? 0 : row.spaceBefore;
    const fits = (rowsHeight: number, notesHeight: number) =>
      y - space - rowsHeight >= textBottom + current().notesHeight + separatorExtra + notesHeight;
    // A group taller than half a page may split, but the row itself must fit.
    if (
      !empty() &&
      !(fits(row.height, notesExtra) && fits(Math.min(need, textHeight / 2), height(groupNotes)))
    ) {
      newPage();
    }
    const page = current();
    if (empty() && row.dropTo !== undefined) y = textTop - textHeight * row.dropTo;
    const top = y - (empty() ? 0 : row.spaceBefore);
    page.rows.push({ row, top });
    y = top - row.height;
    if (noteRows.length > 0) {
      if (page.notes.length === 0) page.notesHeight += separator;
      page.notes.push(...noteRows);
      page.notesHeight += notesExtra;
    }
    if (i === bodyFirst) bodyPage = pages.length - 1;
    if (row.mark !== undefined) markPages.set(row.mark, pages.length - 1);
  }
  if (bodyPage < 0) bodyPage = pages.length;
  // A printed book has an even number of pages. Other exports drop an empty page.
  if (book && pages.length % 2 === 1) pages.push({ rows: [], notes: [], notesHeight: 0 });
  const kept = book ? pages : pages.filter((page, index) => index === 0 || page.rows.length > 0);
  for (const [id, index] of markPages) folios.set(id, index - bodyPage + 1);

  const plain = await layout.face(bodyFont, false, false);
  const italic = await layout.face(bodyFont, false, true);
  const header = manuscript ? headerText(manuscript.name, doc.title) : '';
  const drawPage = (index: number, sink: Sink) => {
    const content = kept[index];
    if (!content) return;
    const left = book && index % 2 === 1 ? margins.outside : margins.inside;
    const d = shifted(sink, left);
    for (const { row, top } of content.rows) row.draw(d, top);
    if (content.notes.length > 0) {
      let top = textBottom + content.notesHeight;
      d.rect(0, top - 4, settings.textWidth / 3, 0.5, MUTED);
      top -= separator;
      for (const { row } of content.notes) {
        top -= row.spaceBefore;
        row.draw(d, top);
        top -= row.height;
      }
    }
    if (book) {
      // Blank pages and the front matter have no number. A chapter's first page has no running head.
      if (content.rows.length === 0 || index < bodyPage) return;
      const size = 0.8 * textSize;
      const centered = (text: string, face: Face, baseline: number) => {
        const width = face.font.widthOfTextAtSize(text, size);
        d.text(text, (settings.textWidth - width) / 2, baseline, { face, size, color: MUTED });
      };
      centered(String(index - bodyPage + 1), plain, textBottom / 2);
      if (!content.rows[0]?.row.recto) {
        const head = index % 2 === 1 ? (doc.author ?? doc.title) : doc.title;
        centered(head, italic, textTop + margins.top / 2);
      }
      return;
    }
    if (index === 0 && titlePage) return;
    const number = String(titlePage ? index : index + 1);
    if (manuscript) {
      const text = `${header}${number}`;
      const width = plain.font.widthOfTextAtSize(text, TEXT_SIZE);
      sink.text(text, pageWidth - MARGIN - width, pageHeight - MARGIN / 2, {
        face: plain,
        size: TEXT_SIZE,
        color: INK,
      });
    } else {
      const width = plain.font.widthOfTextAtSize(number, 10);
      sink.text(number, (pageWidth - width) / 2, MARGIN / 2, { face: plain, size: 10, color: MUTED });
    }
  };
  return {
    size: [pageWidth, pageHeight],
    pages: kept,
    drawPage,
    drawnStyles: layout.drawnStyles,
    gutter: book ? gutterFor(pagesGuess) : 0,
  };
}

/** Lays out every page of an export. A book's gutter follows its page count. */
export async function layOutPdf(doc: ExportDoc, options: PdfOptions, pdf: PDFDocument): Promise<LaidOutPdf> {
  const fonts = new FontSet(
    pdf,
    options.loadFile,
    options.own ?? new Map(),
    options.swaps ?? new Map(),
    'newsreader',
  );
  const toMathml = options.toMathml ?? (await mathmlFor(doc));
  let laid = await layOutOnce(doc, options, fonts, toMathml, 0);
  // A wider gutter can add pages, so a book lays out again until its gutter fits its page count.
  for (let tries = 0; doc.book && tries < 4; tries += 1) {
    const pages = laid.pages.length;
    if (gutterFor(pages) <= laid.gutter) break;
    laid = await layOutOnce(doc, options, fonts, toMathml, pages);
  }
  return laid;
}

/** The PDF file of an export. */
export async function toPdf(doc: ExportDoc, options: PdfOptions): Promise<PdfResult> {
  if (doc.script) return toScriptPdf(doc, doc.script, options);
  const pdf = await PDFDocument.create();
  const laid = await layOutPdf(doc, options, pdf);
  laid.pages.forEach((_, index) => {
    laid.drawPage(index, new Drawer(pdf, pdf.addPage([...laid.size])));
  });
  const manuscript = doc.book ? undefined : options.manuscript;
  pdf.setTitle(doc.title);
  pdf.setLanguage(doc.language);
  if (manuscript?.name || doc.author) pdf.setAuthor(manuscript?.name ?? doc.author ?? '');
  pdf.setCreator('Vlo');
  pdf.setProducer('Vlo');
  return { bytes: await pdf.save(), drawnStyles: laid.drawnStyles };
}
