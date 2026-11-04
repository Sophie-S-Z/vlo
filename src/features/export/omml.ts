import {
  MathFraction,
  MathIntegral,
  MathLimitLower,
  MathLimitUpper,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSubSuperScript,
  MathSum,
  MathSuperScript,
  type MathComponent,
} from 'docx';
import { linearMath, type MathNode } from './mathml';

/*
 * Word equations (OMML) from MathLive's MathML, built with the docx math parts. Word can then edit each
 * equation as an equation. A part that docx has no class for, such as a matrix, becomes its plain-text form
 * inside the equation.
 */

/** The invisible operators MathLive places between parts: function application and times. */
const INVISIBLE = /[⁡-⁤]/g;

/** Wrappers that only group or style their children. */
const GROUPS = new Set(['math', 'mrow', 'mstyle', 'mpadded', 'menclose', 'merror', 'mfenced']);

interface Nary {
  kind: 'sum' | 'integral';
  lower?: MathNode;
  upper?: MathNode;
}

/** A sum or an integral sign, with its limits, when `node` is one. */
function naryOf(node: MathNode): Nary | null {
  const sign = (n: MathNode | undefined): Nary['kind'] | null => {
    if (n?.tag !== 'mo') return null;
    const text = n.text.trim();
    if (text === '∑') return 'sum';
    if (text === '∫') return 'integral';
    return null;
  };
  const [base, first, second] = node.children;
  const bare = sign(node);
  if (bare) return { kind: bare };
  const kind = sign(base);
  if (!kind) return null;
  switch (node.tag) {
    case 'msubsup':
    case 'munderover':
      return { kind, ...(first ? { lower: first } : {}), ...(second ? { upper: second } : {}) };
    case 'msub':
    case 'munder':
      return { kind, ...(first ? { lower: first } : {}) };
    case 'msup':
    case 'mover':
      return { kind, ...(first ? { upper: first } : {}) };
    default:
      return null;
  }
}

/** The parts of a row. A sum or an integral takes the next part as its body. */
function row(nodes: readonly MathNode[]): MathComponent[] {
  const out: MathComponent[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (!node) continue;
    const nary = naryOf(node);
    if (nary) {
      const body = nodes[i + 1];
      if (body) i += 1;
      const options = {
        children: body ? part(body) : [],
        ...(nary.lower ? { subScript: part(nary.lower) } : {}),
        ...(nary.upper ? { superScript: part(nary.upper) } : {}),
      };
      out.push(nary.kind === 'sum' ? new MathSum(options) : new MathIntegral(options));
      continue;
    }
    out.push(...part(node));
  }
  return out;
}

function token(text: string, normalText = false): MathComponent[] {
  const clean = text.replace(INVISIBLE, '');
  if (clean === '') return [];
  return [normalText ? new MathRun({ text: clean, normalText: true }) : new MathRun(clean)];
}

function part(node: MathNode): MathComponent[] {
  const [a, b, c] = node.children;
  const of = (n: MathNode | undefined) => (n ? part(n) : []);
  switch (node.tag) {
    case 'mi':
    case 'mn':
    case 'mo':
    case 'ms':
      return token(node.text);
    case 'mtext':
      return token(node.text, true);
    case 'mspace':
      // Word draws no plain space inside an equation, so a thin space keeps the gap.
      return [new MathRun(' ')];
    case 'mfrac':
      return [new MathFraction({ numerator: of(a), denominator: of(b) })];
    case 'msup':
      return [new MathSuperScript({ children: of(a), superScript: of(b) })];
    case 'msub':
      return [new MathSubScript({ children: of(a), subScript: of(b) })];
    case 'msubsup':
      return [new MathSubSuperScript({ children: of(a), subScript: of(b), superScript: of(c) })];
    case 'msqrt':
      return [new MathRadical({ children: row(node.children) })];
    case 'mroot':
      return [new MathRadical({ children: of(a), degree: of(b) })];
    case 'munder':
      return [new MathLimitLower({ children: of(a), limit: of(b) })];
    case 'mover':
      return [new MathLimitUpper({ children: of(a), limit: of(b) })];
    case 'munderover':
      return [
        new MathLimitUpper({
          children: [new MathLimitLower({ children: of(a), limit: of(b) })],
          limit: of(c),
        }),
      ];
    case 'mtable':
      return token(linearMath(node));
    case 'semantics':
      return of(a);
    case 'mphantom':
    case 'annotation':
    case 'annotation-xml':
      return [];
    default:
      if (GROUPS.has(node.tag)) return row(node.children);
      return [...row(node.children), ...token(node.text)];
  }
}

/** The Word equation parts of a parsed MathML tree. An empty list means the tree held nothing to draw. */
export function ommlOf(root: MathNode): MathComponent[] {
  return row(root.children);
}
