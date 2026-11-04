import { parseMathml, type MathNode } from '../mathml';
import type { Drawer, Rgb } from './draw';
import type { Face } from './fonts';

/*
 * Equations in a PDF, laid out from MathLive's MathML: rows, fractions, scripts, roots, limits, sums,
 * integrals, matrices and tall brackets. The layout follows TeX's main rules in a simple form. Letters
 * use the text font, and symbols the text font lacks use Noto Sans Math.
 */

export interface MathFaces {
  upright: Face;
  italic: Face;
  symbol: Face;
}

export interface MathBox {
  width: number;
  /** Height above the baseline. */
  ascent: number;
  /** Depth below the baseline. */
  depth: number;
  draw: (drawer: Drawer, x: number, baseline: number, color: Rgb) => void;
}

const INVISIBLE = /[\u2061-\u2064]/g;
const RELATIONS = new Set([
  '=',
  '<',
  '>',
  '≤',
  '≥',
  '≠',
  '≈',
  '≡',
  '→',
  '←',
  '↔',
  '⇒',
  '⇔',
  '∈',
  '∉',
  '⊂',
  '⊆',
  '∼',
  '≅',
  '∝',
  ':=',
]);
const BINARIES = new Set(['+', '-', '−', '×', '÷', '±', '∓', '·', '⋅', '∗', '∘', '∪', '∩', '∧', '∨']);
const FENCES = new Set(['(', ')', '[', ']', '{', '}', '|', '‖', '⟨', '⟩', '⌈', '⌉', '⌊', '⌋']);
const NARY = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '⋃', '⋂']);
/** Accents that MathLive writes as combining marks, as letters that draw alone. */
const ACCENTS: Readonly<Record<string, string>> = {
  '^': 'ˆ',
  '̂': 'ˆ',
  '~': '˜',
  '̃': '˜',
  '⃗': '→',
  '˙': '˙',
  '̇': '˙',
  '¨': '¨',
  ˇ: 'ˇ',
};
const BARS = new Set(['¯', '‾', '_', '―', '—', '̅', '̄']);

/** A box that may be a bracket, which grows to the height of its row. */
type Part = MathBox & { fence?: string };

const empty = (width = 0): MathBox => ({ width, ascent: 0, depth: 0, draw: () => undefined });

interface Style {
  size: number;
  /** Display style: block equations, with full-size fractions and limits above and below. */
  display: boolean;
}

const smaller = (style: Style, factor = 0.7): Style => ({
  size: Math.max(style.size * factor, style.size > 6 ? 5 : style.size),
  display: false,
});

const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The number of letters a reader sees in a text. */
function graphemes(text: string): number {
  return Array.from(SEGMENTER.segment(text)).length;
}

function hasGlyphs(face: Face, text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 32 && !face.metrics.hasGlyphForCodePoint(code)) return false;
  }
  return true;
}

export class MathLayout {
  constructor(private readonly faces: MathFaces) {}

  private glyphBox(text: string, face: Face, size: number, gapLeft = 0, gapRight = 0, scaleY = 1): MathBox {
    const m = face.metrics;
    const width = face.font.widthOfTextAtSize(text, size);
    const ascent = (m.ascent / m.unitsPerEm) * size * 0.8 * scaleY;
    const depth = (Math.abs(m.descent) / m.unitsPerEm) * size * 0.8 * scaleY;
    return {
      width: gapLeft + width + gapRight,
      ascent,
      depth,
      draw: (d, x, y, color) => {
        d.text(text, x + gapLeft, y, { face, size, color, scaleY });
      },
    };
  }

  private token(node: MathNode, style: Style): Part {
    const raw = node.text.replace(INVISIBLE, '');
    if (raw.trim() === '' && node.tag !== 'mtext') return empty();
    const { size } = style;
    let face = this.faces.upright;
    if (node.tag === 'mi' && graphemes(raw) === 1 && node.attrs.mathvariant !== 'normal')
      face = this.faces.italic;
    if (!hasGlyphs(face, raw)) face = this.faces.symbol;
    if (node.tag === 'mo') {
      const op = raw.trim();
      const gap = RELATIONS.has(op) ? 0.28 * size : BINARIES.has(op) ? 0.22 * size : 0;
      const box = this.glyphBox(op, face, size, gap, gap);
      return FENCES.has(op) ? { ...box, fence: op } : box;
    }
    return this.glyphBox(raw, face, size);
  }

  /** A row of boxes. A bracket grows to the height of what it holds. */
  private row(nodes: readonly MathNode[], style: Style): MathBox {
    const parts: Part[] = nodes.map((node) => this.box(node, style));
    const inner = parts.filter((p) => !p.fence);
    const tall = Math.max(0, ...inner.map((p) => p.ascent));
    const deep = Math.max(0, ...inner.map((p) => p.depth));
    const { size } = style;
    const sized = parts.map((p) => {
      if (!p.fence || tall + deep <= size * 1.2) return p;
      // Center the bracket on the math axis and stretch it to cover the row.
      const axis = size * 0.25;
      const half = Math.max(tall - axis, deep + axis) + size * 0.1;
      const glyph = this.glyphBox(p.fence, this.faces.symbol, size);
      const natural = glyph.ascent + glyph.depth || size;
      const scaleY = (2 * half) / natural;
      const stretched = this.glyphBox(p.fence, this.faces.symbol, size, 0, 0, scaleY);
      const shift = axis - (stretched.ascent - stretched.depth) / 2;
      return {
        width: stretched.width,
        ascent: axis + half,
        depth: half - axis,
        draw: (d: Drawer, x: number, y: number, color: Rgb) => {
          stretched.draw(d, x, y + shift, color);
        },
      };
    });
    return {
      width: sized.reduce((sum, p) => sum + p.width, 0),
      ascent: Math.max(0, ...sized.map((p) => p.ascent)),
      depth: Math.max(0, ...sized.map((p) => p.depth)),
      draw: (d, x, y, color) => {
        let at = x;
        for (const p of sized) {
          p.draw(d, at, y, color);
          at += p.width;
        }
      },
    };
  }

  private nary(op: string, style: Style, lower?: MathNode, upper?: MathNode): MathBox {
    const { size } = style;
    const big = this.glyphBox(op, this.faces.symbol, size * (style.display ? 1.6 : 1.25));
    const integral = op === '∫' || op === '∬' || op === '∭' || op === '∮';
    const lo = lower ? this.box(lower, smaller(style)) : null;
    const hi = upper ? this.box(upper, smaller(style)) : null;
    if (style.display && !integral) return this.stack(big, lo, hi, size, 0.15 * size);
    return this.scripts(big, lo, hi, size, 0.1 * size);
  }

  /** Limits above and below a base, centered. */
  private stack(
    base: MathBox,
    under: MathBox | null,
    over: MathBox | null,
    size: number,
    gapAfter = 0,
  ): MathBox {
    const gap = size * 0.12;
    const width = Math.max(base.width, under?.width ?? 0, over?.width ?? 0);
    const overShift = over ? base.ascent + gap + over.depth : 0;
    const underShift = under ? base.depth + gap + under.ascent : 0;
    return {
      width: width + gapAfter,
      ascent: over ? overShift + over.ascent : base.ascent,
      depth: under ? underShift + under.depth : base.depth,
      draw: (d, x, y, color) => {
        base.draw(d, x + (width - base.width) / 2, y, color);
        over?.draw(d, x + (width - over.width) / 2, y + overShift, color);
        under?.draw(d, x + (width - under.width) / 2, y - underShift, color);
      },
    };
  }

  /** Scripts to the right of a base: a superscript, a subscript or both. */
  private scripts(
    base: MathBox,
    sub: MathBox | null,
    sup: MathBox | null,
    size: number,
    gapAfter = 0,
  ): MathBox {
    const up = sup ? Math.max(size * 0.4, base.ascent - sup.ascent * 0.5) : 0;
    let down = sub ? Math.max(size * 0.2, base.depth + sub.ascent * 0.2) : 0;
    if (sup && sub) down = Math.max(down, sub.ascent - (up - sup.depth) + size * 0.25);
    const scriptWidth = Math.max(sub?.width ?? 0, sup?.width ?? 0);
    const kern = size * 0.04;
    return {
      width: base.width + kern + scriptWidth + gapAfter,
      ascent: Math.max(base.ascent, sup ? up + sup.ascent : 0),
      depth: Math.max(base.depth, sub ? down + sub.depth : 0),
      draw: (d, x, y, color) => {
        base.draw(d, x, y, color);
        sup?.draw(d, x + base.width + kern, y + up, color);
        sub?.draw(d, x + base.width + kern, y - down, color);
      },
    };
  }

  private fraction(num: MathBox, den: MathBox, size: number): MathBox {
    const axis = size * 0.25;
    const rule = Math.max(size * 0.05, 0.5);
    const gap = size * 0.12;
    const width = Math.max(num.width, den.width) + size * 0.2;
    const numShift = axis + rule / 2 + gap + num.depth;
    const denShift = rule / 2 + gap + den.ascent - axis;
    return {
      width: width + size * 0.1,
      ascent: numShift + num.ascent,
      depth: denShift + den.depth,
      draw: (d, x, y, color) => {
        num.draw(d, x + (width - num.width) / 2, y + numShift, color);
        den.draw(d, x + (width - den.width) / 2, y - denShift, color);
        d.rect(x + size * 0.05, y + axis - rule / 2, width - size * 0.1, rule, color);
      },
    };
  }

  private root(body: MathBox, size: number, degree: MathBox | null): MathBox {
    const gap = size * 0.12;
    const rule = Math.max(size * 0.05, 0.5);
    const sign = size * 0.55;
    const lead = degree ? Math.max(0, degree.width - sign * 0.45) : 0;
    const ascent = body.ascent + gap + rule;
    const depth = body.depth + size * 0.08;
    return {
      width: lead + sign + body.width + size * 0.12,
      ascent: Math.max(ascent, degree ? ascent * 0.55 + degree.ascent + degree.depth : 0),
      depth,
      draw: (d, x, y, color) => {
        const left = x + lead;
        const top = y + ascent - rule / 2;
        const bottom = y - depth;
        const height = top - bottom;
        d.line(
          [
            [left, bottom + height * 0.42],
            [left + sign * 0.2, bottom + height * 0.5],
          ],
          rule,
          color,
        );
        d.line(
          [
            [left + sign * 0.2, bottom + height * 0.5],
            [left + sign * 0.45, bottom],
          ],
          rule * 1.8,
          color,
        );
        d.line(
          [
            [left + sign * 0.45, bottom],
            [left + sign, top],
            [left + sign + body.width + size * 0.08, top],
          ],
          rule,
          color,
        );
        body.draw(d, left + sign, y, color);
        degree?.draw(d, x, y + ascent * 0.55 + degree.depth, color);
      },
    };
  }

  private table(node: MathNode, style: Style): MathBox {
    const { size } = style;
    const rows = node.children.map((row) =>
      row.children.map((cell) =>
        this.row(cell.tag === 'mtd' ? cell.children : [cell], { size, display: false }),
      ),
    );
    const columns = Math.max(0, ...rows.map((r) => r.length));
    const widths = Array.from({ length: columns }, (_, c) =>
      Math.max(0, ...rows.map((r) => r[c]?.width ?? 0)),
    );
    const colGap = size * 0.8;
    const rowGap = size * 0.3;
    const heights = rows.map((r) => ({
      ascent: Math.max(size * 0.7, ...r.map((b) => b.ascent)),
      depth: Math.max(size * 0.25, ...r.map((b) => b.depth)),
    }));
    const total =
      heights.reduce((sum, h) => sum + h.ascent + h.depth, 0) + rowGap * Math.max(0, rows.length - 1);
    const axis = size * 0.25;
    const width = widths.reduce((sum, w) => sum + w, 0) + colGap * Math.max(0, columns - 1) + size * 0.2;
    return {
      width,
      ascent: axis + total / 2,
      depth: total / 2 - axis,
      draw: (d, x, y, color) => {
        let top = y + axis + total / 2;
        rows.forEach((row, r) => {
          const h = heights[r] ?? { ascent: 0, depth: 0 };
          const baseline = top - h.ascent;
          let at = x + size * 0.1;
          row.forEach((cell, c) => {
            const w = widths[c] ?? 0;
            cell.draw(d, at + (w - cell.width) / 2, baseline, color);
            at += w + colGap;
          });
          top = baseline - h.depth - rowGap;
        });
      },
    };
  }

  private accent(base: MathBox, mark: string, style: Style): MathBox | null {
    const { size } = style;
    const gap = size * 0.06;
    if (BARS.has(mark)) {
      const rule = Math.max(size * 0.05, 0.5);
      return {
        ...base,
        ascent: base.ascent + gap + rule,
        draw: (d, x, y, color) => {
          base.draw(d, x, y, color);
          d.rect(x, y + base.ascent + gap, base.width, rule, color);
        },
      };
    }
    const glyph = ACCENTS[mark];
    if (!glyph) return null;
    const over = this.glyphBox(glyph, this.faces.symbol, size * (glyph === '→' ? 0.6 : 0.9));
    return this.stack(base, null, { ...over, ascent: over.ascent * 0.5, depth: -gap }, size);
  }

  box(node: MathNode, style: Style): Part {
    const [a, b, c] = node.children;
    const at = (n: MathNode | undefined, s: Style) => (n ? this.box(n, s) : empty());
    const op = (n: MathNode | undefined) => (n?.tag === 'mo' ? n.text.replace(INVISIBLE, '').trim() : '');
    switch (node.tag) {
      case 'mi':
      case 'mn':
      case 'mo':
      case 'mtext':
      case 'ms':
        if (node.tag === 'mo' && NARY.has(op(node))) return this.nary(op(node), style);
        return this.token(node, style);
      case 'mspace': {
        const em = Number.parseFloat(node.attrs.width ?? '');
        return empty((Number.isFinite(em) ? em : 0.17) * style.size);
      }
      case 'mfrac': {
        const inner = style.display ? { size: style.size, display: false } : smaller(style, 0.8);
        return this.fraction(at(a, inner), at(b, inner), style.size);
      }
      case 'msup':
      case 'msub':
      case 'msubsup': {
        const script = smaller(style);
        const lower = node.tag === 'msup' ? undefined : b;
        const upper = node.tag === 'msup' ? b : node.tag === 'msubsup' ? c : undefined;
        if (NARY.has(op(a))) return this.nary(op(a), style, lower, upper);
        return this.scripts(
          at(a, style),
          lower ? at(lower, script) : null,
          upper ? at(upper, script) : null,
          style.size,
        );
      }
      case 'munder':
      case 'mover':
      case 'munderover': {
        const lower = node.tag === 'mover' ? undefined : b;
        const upper = node.tag === 'mover' ? b : node.tag === 'munderover' ? c : undefined;
        if (NARY.has(op(a))) return this.nary(op(a), style, lower, upper);
        const base = at(a, style);
        if (node.tag === 'mover' && upper) {
          const accent = this.accent(base, upper.text.replace(INVISIBLE, '').trim(), style);
          if (accent && (node.attrs.accent === 'true' || upper.tag === 'mo')) return accent;
        }
        const script = smaller(style);
        return this.stack(
          base,
          lower ? at(lower, script) : null,
          upper ? at(upper, script) : null,
          style.size,
        );
      }
      case 'msqrt':
        return this.root(this.row(node.children, style), style.size, null);
      case 'mroot':
        return this.root(at(a, style), style.size, at(b, smaller(smaller(style))));
      case 'mtable':
        return this.table(node, style);
      case 'mphantom': {
        const hidden = this.row(node.children, style);
        return { ...hidden, draw: () => undefined };
      }
      case 'semantics':
        return at(a, style);
      case 'annotation':
      case 'annotation-xml':
        return empty();
      default:
        return this.row(node.children, style);
    }
  }

  /** The box of an equation. LaTeX that MathLive could not convert is drawn as its source. */
  equation(mathml: string, latex: string, size: number, display: boolean): MathBox {
    const root = parseMathml(mathml);
    if (root.children.length === 0) {
      const face = hasGlyphs(this.faces.upright, latex) ? this.faces.upright : this.faces.symbol;
      return this.glyphBox(latex, face, size);
    }
    return this.row(root.children, { size, display });
  }
}
