/*
 * Equations (plan Task A6). Vlo stores each equation as LaTeX. The writer builds it with buttons and a
 * symbol keyboard, so the LaTeX stays hidden until the writer asks to see it.
 */

/** An equation inside a line of text. Prose and poems have it. */
export const MATH_INLINE = 'mathInline';
/** An equation on its own line. Prose only, because a poem line keeps its layout. */
export const MATH_BLOCK = 'mathBlock';

/** Longer LaTeX is cut, so one paste cannot slow the editor down. */
export const MAX_LATEX_LENGTH = 4000;

/** Clean LaTeX from a stored or pasted attribute: a string without control characters, within the limit. */
export function cleanLatex(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Tabs and line breaks are spaces in LaTeX. Other control characters have no meaning there.
  return (
    value
      .replace(/[\t\n\r]/g, ' ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, MAX_LATEX_LENGTH)
  );
}

/** The plain-text form for search, backups and plain-text copies: $...$ in a line, $$...$$ on its own. */
export function mathText(latex: string, display: boolean): string {
  const clean = cleanLatex(latex).trim();
  if (clean === '') return '';
  return display ? `$$${clean}$$` : `$${clean}$`;
}

export interface MathTemplate {
  id: string;
  /** The button's name for screen readers and its tooltip. */
  label: string;
  /** What the button inserts. `#@` takes the selected part of the equation, and `#?` is an empty box. */
  insert: string;
  /** What the button shows. */
  preview: string;
}

export interface MathTemplateGroup {
  label: string;
  templates: readonly MathTemplate[];
}

/** The equation parts a writer adds with one press. The symbol keyboard has the rest. */
export const MATH_TEMPLATES: readonly MathTemplateGroup[] = [
  {
    label: 'Basics',
    templates: [
      { id: 'fraction', label: 'Fraction', insert: '\\frac{#@}{#?}', preview: '\\frac{a}{b}' },
      { id: 'power', label: 'Power', insert: '#@^{#?}', preview: 'x^{n}' },
      { id: 'index', label: 'Subscript', insert: '#@_{#?}', preview: 'x_{i}' },
      { id: 'sqrt', label: 'Square root', insert: '\\sqrt{#@}', preview: '\\sqrt{x}' },
      { id: 'root', label: 'Root', insert: '\\sqrt[#?]{#@}', preview: '\\sqrt[n]{x}' },
      { id: 'parens', label: 'Brackets', insert: '\\left(#@\\right)', preview: '\\left(x\\right)' },
      { id: 'abs', label: 'Absolute value', insert: '\\left|#@\\right|', preview: '\\left|x\\right|' },
      { id: 'times', label: 'Times', insert: '\\times', preview: '\\times' },
      { id: 'divide', label: 'Divide', insert: '\\div', preview: '\\div' },
      { id: 'plus-minus', label: 'Plus or minus', insert: '\\pm', preview: '\\pm' },
      { id: 'not-equal', label: 'Not equal', insert: '\\ne', preview: '\\ne' },
      { id: 'about', label: 'About equal', insert: '\\approx', preview: '\\approx' },
    ],
  },
  {
    label: 'Calculus',
    templates: [
      { id: 'sum', label: 'Sum', insert: '\\sum_{#?}^{#?}#?', preview: '\\sum_{i=1}^{n}' },
      { id: 'product', label: 'Product', insert: '\\prod_{#?}^{#?}#?', preview: '\\prod_{i=1}^{n}' },
      {
        id: 'integral',
        label: 'Integral',
        insert: '\\int_{#?}^{#?}#?\\,\\mathrm{d}x',
        preview: '\\int_{a}^{b}',
      },
      { id: 'limit', label: 'Limit', insert: '\\lim_{#?\\to#?}#?', preview: '\\lim_{x\\to 0}' },
      {
        id: 'derivative',
        label: 'Derivative',
        insert: '\\frac{\\mathrm{d}#?}{\\mathrm{d}#?}',
        preview: '\\frac{\\mathrm{d}y}{\\mathrm{d}x}',
      },
      { id: 'infinity', label: 'Infinity', insert: '\\infty', preview: '\\infty' },
    ],
  },
  {
    label: 'Matrices',
    templates: [
      {
        id: 'matrix-2',
        label: 'Matrix, 2 by 2',
        insert: '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}',
        preview: '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}',
      },
      {
        id: 'matrix-3',
        label: 'Matrix, 3 by 3',
        insert: '\\begin{pmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}',
        preview: '\\begin{pmatrix}a&b&c\\\\d&e&f\\\\g&h&i\\end{pmatrix}',
      },
      {
        id: 'vector',
        label: 'Column vector',
        insert: '\\begin{pmatrix}#?\\\\#?\\end{pmatrix}',
        preview: '\\begin{pmatrix}x\\\\y\\end{pmatrix}',
      },
      {
        id: 'cases',
        label: 'Cases',
        insert: '\\begin{cases}#?&#?\\\\#?&#?\\end{cases}',
        preview: '\\begin{cases}a&x>0\\\\b&x\\le 0\\end{cases}',
      },
    ],
  },
  {
    label: 'Chemistry',
    templates: [
      { id: 'element', label: 'Element symbol', insert: '\\mathrm{#?}', preview: '\\mathrm{Na}' },
      { id: 'count', label: 'Atom count', insert: '_{#?}', preview: '\\mathrm{H}_{2}' },
      { id: 'charge', label: 'Charge', insert: '^{#?}', preview: '\\mathrm{Ca}^{2+}' },
      { id: 'yields', label: 'Reaction arrow', insert: '\\longrightarrow', preview: '\\longrightarrow' },
      {
        id: 'equilibrium',
        label: 'Equilibrium arrows',
        insert: '\\rightleftharpoons',
        preview: '\\rightleftharpoons',
      },
      {
        id: 'heat',
        label: 'Heat over arrow',
        insert: '\\xrightarrow{\\Delta}',
        preview: '\\xrightarrow{\\Delta}',
      },
    ],
  },
];
