import type { NoteContent } from '@/features/editor/format/notes';
import type { TextFill } from '@/features/editor/format/fill';

/*
 * The export tree (plan Part B). Every exporter reads this one tree, never the editor or the Yjs
 * document, so each format sees the same text, the same marks and the same aliases. Colors are plain
 * #rrggbb values for the Paper theme, because paper is white.
 */

export interface RunStyle {
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  superscript?: true;
  subscript?: true;
  /** A #rrggbb text color. */
  color?: string;
  /** A #rrggbb highlight color. */
  highlight?: string;
  /** A Vlo font id, or "local:" and an installed font's name. */
  font?: string;
  /** The size as a multiple of the text size, such as 1.25. */
  size?: number;
  /** A gradient, metallic, prismatic or glowing fill. */
  fill?: TextFill;
  /** A web address for a link. */
  link?: string;
}

export type Run =
  | { type: 'text'; text: string; style: RunStyle }
  | { type: 'break' }
  | { type: 'math'; latex: string; style: RunStyle }
  | { type: 'footnote'; number: number; note: NoteContent };

export type Align = 'left' | 'center' | 'right' | 'justify';

export interface ParagraphBlock {
  type: 'paragraph';
  runs: Run[];
  align?: Align;
  /** A Word-style line spacing multiple: 1, 1.15, 1.5 or 2. */
  lineSpacing?: number;
  firstLineIndent?: true;
  dropCap?: true;
}

export interface HeadingBlock {
  type: 'heading';
  /** 1 for a part or section, 2 for a chapter or item title, 3 and 4 for headings in the text. */
  level: 1 | 2 | 3 | 4;
  runs: Run[];
  align?: Align;
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  start: number;
  /** Each list item holds its own blocks. */
  items: Block[][];
}

export interface QuoteBlock {
  type: 'quote';
  blocks: Block[];
}

export interface PoemLine {
  runs: Run[];
  /** Hanging indent in em: wrapped parts of the line sit this far right of its first part. */
  hanging: number;
}

export interface StanzaBlock {
  type: 'stanza';
  lines: PoemLine[];
}

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | QuoteBlock
  | StanzaBlock
  | { type: 'sceneBreak' }
  | { type: 'math'; latex: string };

export type ExportForm = 'prose' | 'poem';

/** One part of the export: a folder title, or an item with its text. */
export interface ExportSection {
  id: string;
  title: string;
  form: ExportForm | null;
  /** The blocks in reading order. A folder's blocks hold only its heading. */
  blocks: Block[];
}

export type Paper = 'letter' | 'a4';

export interface ExportDoc {
  title: string;
  author?: string;
  /** The project's manuscript font. */
  font: string;
  /** The sheet size for formats with pages. A pageless project uses Letter. */
  paper: Paper;
  sections: ExportSection[];
}

/**
 * True for the title heading of an export that holds one item: the export title already names it, so
 * each format leaves it out.
 */
export function repeatsTitle(doc: ExportDoc, section: ExportSection, block: Block): boolean {
  return (
    block.type === 'heading' && block.level === 2 && doc.sections.length === 1 && section.title === doc.title
  );
}

/** The plain text of some runs, for headings, searches and checks. Equations read as LaTeX. */
export function runsText(runs: readonly Run[]): string {
  return runs
    .map((run) => {
      if (run.type === 'text') return run.text;
      if (run.type === 'break') return '\n';
      if (run.type === 'math') return `$${run.latex}$`;
      return '';
    })
    .join('');
}

/** The footnotes of a document in order. Their numbers count from 1 across the whole export. */
export function footnotesOf(doc: ExportDoc): { number: number; note: NoteContent }[] {
  const notes: { number: number; note: NoteContent }[] = [];
  const visit = (blocks: readonly Block[]) => {
    for (const block of blocks) {
      if (block.type === 'paragraph' || block.type === 'heading') collect(block.runs);
      else if (block.type === 'list') block.items.forEach(visit);
      else if (block.type === 'quote') visit(block.blocks);
      else if (block.type === 'stanza') for (const line of block.lines) collect(line.runs);
    }
  };
  const collect = (runs: readonly Run[]) => {
    for (const run of runs) if (run.type === 'footnote') notes.push({ number: run.number, note: run.note });
  };
  for (const section of doc.sections) visit(section.blocks);
  return notes;
}
