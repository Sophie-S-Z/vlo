import type { Block, ExportDoc, Run } from './model';

/*
 * LaTeX to MathML for the formats that carry equations. MathLive's server build converts with no page, so
 * it runs in the export worker. Its code loads only when the export has an equation.
 */

export type LatexToMathml = (latex: string) => string;

/** True when any block or run of the export is an equation. */
export function hasMath(doc: ExportDoc): boolean {
  const inRuns = (runs: readonly Run[]) => runs.some((r) => r.type === 'math');
  const visit = (blocks: readonly Block[]): boolean =>
    blocks.some((block) => {
      switch (block.type) {
        case 'math':
          return true;
        case 'paragraph':
        case 'heading':
          return inRuns(block.runs);
        case 'list':
          return block.items.some(visit);
        case 'quote':
          return visit(block.blocks);
        case 'stanza':
          return block.lines.some((line) => inRuns(line.runs));
        default:
          return false;
      }
    });
  return doc.sections.some((s) => visit(s.blocks));
}

/** The converter for an export: MathLive when the export has an equation, else one that gives nothing. */
export async function mathmlFor(doc: ExportDoc): Promise<LatexToMathml> {
  if (!hasMath(doc)) return () => '';
  const { convertLatexToMathMl } = await import('mathlive/ssr');
  return (latex) => convertLatexToMathMl(latex);
}
