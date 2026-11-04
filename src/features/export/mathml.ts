/*
 * A small reader for the MathML that MathLive writes. The export worker has no DOMParser, and MathLive's
 * MathML is plain, well-formed XML: elements, attributes, text and character references.
 */

export interface MathNode {
  tag: string;
  attrs: Record<string, string>;
  children: MathNode[];
  /** The text of a token element such as mi, mn, mo or mtext. */
  text: string;
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (all, ref: string) => {
    if (ref.startsWith('#x')) return String.fromCodePoint(parseInt(ref.slice(2), 16));
    if (ref.startsWith('#')) return String.fromCodePoint(parseInt(ref.slice(1), 10));
    return NAMED[ref] ?? all;
  });
}

/** Parses MathML into a tree under one root `math` node. Unknown or broken input gives an empty root. */
export function parseMathml(xml: string): MathNode {
  const root: MathNode = { tag: 'math', attrs: {}, children: [], text: '' };
  const stack: MathNode[] = [root];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (let m = tag.exec(xml); m !== null; m = tag.exec(xml)) {
    const top = stack[stack.length - 1];
    if (!top) break;
    const [, closing, name, attrText, selfClosing, text] = m;
    if (text !== undefined) {
      top.text += decodeEntities(text);
      continue;
    }
    if (!name) continue;
    if (closing) {
      if (stack.length > 1 && top.tag === name) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    const attr = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    for (let a = attr.exec(attrText ?? ''); a !== null; a = attr.exec(attrText ?? '')) {
      attrs[a[1] ?? ''] = decodeEntities(a[2] ?? a[3] ?? '');
    }
    const node: MathNode = { tag: name, attrs, children: [], text: '' };
    if (name === 'math') {
      Object.assign(root.attrs, attrs);
      if (!selfClosing) stack.push(root);
      continue;
    }
    top.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

/** The invisible operators MathLive places between parts: function application and times. */
const INVISIBLE = /[\u2061-\u2064]/g;

/**
 * A plain-text form of an equation, for a format or a part that cannot draw it: x², a/b, √x.
 * It reads well enough to check a value, and the LaTeX stays the exact source.
 */
export function linearMath(node: MathNode): string {
  const all = (nodes: readonly MathNode[]) => nodes.map(linearMath).join('');
  const group = (n: MathNode | undefined) => {
    if (!n) return '';
    const text = linearMath(n);
    // One character, or a group in brackets, needs no brackets of its own.
    return /^.?$/su.test(text) || /^\(.*\)$/.test(text) ? text : `(${text})`;
  };
  const [a, b, c] = node.children;
  switch (node.tag) {
    case 'mi':
    case 'mn':
    case 'mo':
    case 'mtext':
    case 'ms':
      return node.text.replace(INVISIBLE, '');
    case 'mspace':
      return ' ';
    case 'mfrac':
      return `${group(a)}/${group(b)}`;
    case 'msup':
      return `${linearMath(a ?? node)}^${group(b)}`;
    case 'msub':
      return `${linearMath(a ?? node)}_${group(b)}`;
    case 'msubsup':
      return `${linearMath(a ?? node)}_${group(b)}^${group(c)}`;
    case 'msqrt':
      return `√${group({ ...node, tag: 'mrow' })}`;
    case 'mroot':
      return `${linearMath(b ?? node)}√${group(a)}`;
    case 'munder':
      return `${linearMath(a ?? node)}_${group(b)}`;
    case 'mover':
      return `${linearMath(a ?? node)}${linearMath(b ?? node)}`;
    case 'munderover':
      return `${linearMath(a ?? node)}_${group(b)}^${group(c)}`;
    case 'mtable':
      return node.children.map((row) => row.children.map(linearMath).join(' ')).join('; ');
    default:
      return all(node.children) + node.text.replace(INVISIBLE, '');
  }
}
