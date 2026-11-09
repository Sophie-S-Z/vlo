/*
 * Standard manuscript format for novels (spec section 9): 12 pt, double spacing, 1 inch margins, a header
 * with the surname, a short title and the page number, a first page with the writer's name, contact lines
 * and a rounded word count, chapters that start a third of the way down a new page, and "#" scene breaks.
 * Word and PDF both read these helpers, so both formats say the same thing.
 */

import { countUnit, countWords } from '@/lib/wordcount';
import type { Block, ExportDoc, Run, RunStyle } from './model';

export interface ManuscriptDetails {
  /** The writer's name as it goes on the first page and the byline. */
  name: string;
  /** Contact lines: address, email and phone, one per line. */
  contact: string;
  /** Use Courier Prime, the typewriter look, instead of the project font. */
  typewriter: boolean;
}

export interface ManuscriptSetup extends ManuscriptDetails {
  /** The words in the export, before rounding. */
  words: number;
}

/** The last word of the writer's name, for the page header. */
export function surnameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

/** A short form of the title for the page header: up to four words, in capitals. */
export function shortTitle(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter((w) => w !== '');
  let out = '';
  for (const word of words) {
    const next = out === '' ? word : `${out} ${word}`;
    if (next.length > 24 && out !== '') break;
    out = next;
    if (out.split(' ').length >= 4) break;
  }
  return out.toUpperCase();
}

/**
 * The word count for the first page: rounded to the nearest 1,000, or to the nearest 100 under 1,000, so
 * a short piece never reads as 0 words.
 */
export function roundedWords(words: number, language: string): string {
  const step = words < 950 ? 100 : 1000;
  const rounded = Math.max(step, Math.round(words / step) * step);
  return `about ${rounded.toLocaleString('en-US')} ${countUnit(language)}`;
}

/** The header text of each page after the first, without the page number. */
export function headerText(name: string, title: string): string {
  return `${surnameOf(name)} / ${shortTitle(title)} / `;
}

/** The words in the text of an export, for the first page. Folder titles and equations do not count. */
export function exportWords(doc: ExportDoc): number {
  let words = 0;
  const runs = (list: readonly Run[]) => {
    words += countWords(
      list.map((run) => (run.type === 'text' ? run.text : run.type === 'break' ? '\n' : ' ')).join(''),
      doc.language,
    );
  };
  const visit = (blocks: readonly Block[]) => {
    for (const block of blocks) {
      if (block.type === 'paragraph' || block.type === 'heading') runs(block.runs);
      else if (block.type === 'list') block.items.forEach(visit);
      else if (block.type === 'quote') visit(block.blocks);
      else if (block.type === 'stanza') {
        for (const line of block.lines) runs(line.runs);
      }
    }
  };
  for (const section of doc.sections) if (section.form !== null) visit(section.blocks);
  return words;
}

/** A run style in standard manuscript format: bold, italic, underline, strike and scripts stay. */
function plainStyle(style: RunStyle): RunStyle {
  return {
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    ...(style.strike ? { strike: true } : {}),
    ...(style.superscript ? { superscript: true } : {}),
    ...(style.subscript ? { subscript: true } : {}),
  };
}

function plainRuns(runs: readonly Run[]): Run[] {
  return runs.map((run) =>
    run.type === 'text' || run.type === 'math' ? { ...run, style: plainStyle(run.style) } : run,
  );
}

function plainBlocks(blocks: readonly Block[]): Block[] {
  return blocks.map((block): Block => {
    switch (block.type) {
      case 'paragraph':
        // One alignment, one spacing, an indent on every first line and no drop caps.
        return { type: 'paragraph', runs: plainRuns(block.runs) };
      case 'heading':
        return { type: 'heading', level: block.level, runs: plainRuns(block.runs) };
      case 'list':
        return { ...block, items: block.items.map(plainBlocks) };
      case 'quote':
        return { type: 'quote', blocks: plainBlocks(block.blocks) };
      case 'stanza':
        return {
          type: 'stanza',
          lines: block.lines.map((line) => ({ ...line, runs: plainRuns(line.runs) })),
        };
      default:
        return block;
    }
  });
}

/** The export in standard manuscript format: every word in one font and size, in black, with no links. */
export function plainDoc(doc: ExportDoc, font: string): ExportDoc {
  return { ...doc, font, sections: doc.sections.map((s) => ({ ...s, blocks: plainBlocks(s.blocks) })) };
}
