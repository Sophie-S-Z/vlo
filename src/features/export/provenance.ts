import type { Block, ExportDoc, ExportSection, Run } from './model';

/*
 * The AI provenance page (spec F26, plan decision P8). An export option adds a last section that lists
 * the share of the text that carries the aiOrigin mark: for the whole export, for each item, and the
 * models that wrote it. Equations, footnote text and headings Vlo adds are not counted.
 */

export interface ItemShare {
  title: string;
  total: number;
  ai: number;
}

export interface Provenance {
  /** Characters of text in the export. */
  total: number;
  /** Characters of AI text. */
  ai: number;
  /** Each item that holds AI text, in reading order. */
  items: ItemShare[];
  /** Each provider and model, sorted. */
  models: string[];
}

function countRuns(runs: readonly Run[], into: { total: number; ai: number }, models: Set<string>): void {
  for (const run of runs) {
    if (run.type !== 'text') continue;
    into.total += run.text.length;
    if (run.ai !== undefined) {
      into.ai += run.text.length;
      models.add(run.ai);
    }
  }
}

function countBlocks(
  blocks: readonly Block[],
  into: { total: number; ai: number },
  models: Set<string>,
): void {
  for (const block of blocks) {
    if (block.type === 'paragraph') countRuns(block.runs, into, models);
    else if (block.type === 'list') for (const item of block.items) countBlocks(item, into, models);
    else if (block.type === 'quote') countBlocks(block.blocks, into, models);
    else if (block.type === 'stanza') for (const line of block.lines) countRuns(line.runs, into, models);
    // Headings count only when the writer wrote them in the text (levels 3 and 4).
    else if (block.type === 'heading' && block.level >= 3) countRuns(block.runs, into, models);
  }
}

export function provenanceOf(doc: ExportDoc): Provenance {
  const models = new Set<string>();
  const items: ItemShare[] = [];
  let total = 0;
  let ai = 0;
  for (const section of doc.sections) {
    if (section.form === null) continue;
    const count = { total: 0, ai: 0 };
    countBlocks(section.blocks, count, models);
    total += count.total;
    ai += count.ai;
    if (count.ai > 0) items.push({ title: section.title, ...count });
  }
  return { total, ai, items, models: [...models].sort((a, b) => a.localeCompare(b)) };
}

/** A share as a percent for people: "0%", "less than 1%", "12%" or "100%". */
export function percent(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return '0%';
  if (part >= whole) return '100%';
  const value = (part / whole) * 100;
  if (value < 1) return 'less than 1%';
  // A share above 99.5 but below the whole is not all of the text.
  return `${String(Math.min(99, Math.round(value)))}%`;
}

const text = (value: string): Run[] => [{ type: 'text', text: value, style: {} }];
const paragraph = (value: string): Block => ({ type: 'paragraph', runs: text(value) });

/** The provenance page as the last section of the export. */
export function provenanceSection(doc: ExportDoc, at: Date): ExportSection {
  const report = provenanceOf(doc);
  const blocks: Block[] = [{ type: 'heading', level: 2, runs: text('AI provenance') }];
  const date = at.toISOString().slice(0, 10);
  if (report.ai === 0) {
    blocks.push(
      paragraph(`No text in this export carries the Vlo AI mark. Vlo made this report on ${date}.`),
    );
  } else {
    blocks.push(
      paragraph(
        `${percent(report.ai, report.total)} of the text in this export carries the Vlo AI mark: ${report.ai.toLocaleString('en')} of ${report.total.toLocaleString('en')} characters. Vlo made this report on ${date}.`,
      ),
      paragraph(
        'Vlo marks the words that a writer inserts from the AI. Words that the writer types are the writer’s own.',
      ),
      { type: 'heading', level: 3, runs: text('Share of each item') },
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: report.items.map((item) => [
          paragraph(
            `${item.title}: ${percent(item.ai, item.total)} (${item.ai.toLocaleString('en')} characters)`,
          ),
        ]),
      },
      { type: 'heading', level: 3, runs: text('AI models') },
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: report.models.map((model) => [paragraph(model)]),
      },
    );
  }
  return { id: 'vlo-ai-provenance', title: 'AI provenance', form: 'prose', blocks };
}
