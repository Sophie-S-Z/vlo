import type { NoteContent } from '@/features/editor/format/notes';
import type { TextFill } from '@/features/editor/format/fill';
import type { ScriptRole } from '@/features/editor/scriptRoles';
import type { BookSettings, ScriptStyle } from '@/lib/db';
import type { EditorForm } from '@/features/library/templates';

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

/** A waiting suggestion on a text, kept only by a Word export with tracked changes (F45). */
export interface TextChange {
  kind: 'insert' | 'delete';
  /** Who made it. Empty for the writer. */
  by: string;
  at: number;
}

/** The writer's comment on a text, kept only by a Word export with comments (F45). */
export interface TextComment {
  id: string;
  text: string;
  by: string;
  at: number;
}

/** What a Word export keeps for an editor (F45). Every other export keeps neither. */
export interface ExportReview {
  changes: boolean;
  comments: boolean;
}

export const NO_REVIEW: ExportReview = { changes: false, comments: false };

export type Run =
  /**
   * `person` is the id of the person when the text is a marked private name. `ai` names the provider and
   * the model when the text carries the aiOrigin mark.
   */
  | {
      type: 'text';
      text: string;
      style: RunStyle;
      person?: string;
      ai?: string;
      change?: TextChange;
      comment?: TextComment;
      /** A citation (F64): the key of its source and the page. The build gives it the text of the style. */
      cite?: { key: string; page: string };
    }
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
  /** Each line after the first starts 2 em in, as in a reference list (F64). */
  hanging?: true;
  dropCap?: true;
  /** The element of a script line (F63). The text of a capital role is in capitals already. */
  role?: ScriptRole;
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

/** An image in the text (Phase 16). The bytes are in `ExportDoc.images`, by the image's id. */
export interface ImageBlock {
  type: 'image';
  id: string;
  alt: string;
  decorative: boolean;
  caption: string;
  /** Percent of the text width. */
  width: number;
  align: 'left' | 'center' | 'right';
}

/** The stored copy of an image, as an export embeds it. */
export interface ExportImage {
  type: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  data: Uint8Array;
}

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | QuoteBlock
  | StanzaBlock
  | { type: 'sceneBreak' }
  | { type: 'math'; latex: string }
  | ImageBlock;

export type ExportForm = EditorForm;

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
  /** The language of the writing, as a BCP 47 tag (F38). */
  language: string;
  sections: ExportSection[];
  /** Book layout: a trim size, chapter openings and front and back matter (F51). Only a PDF and an EPUB read it. */
  book?: BookSettings;
  /** The layout of an export that holds only script scenes (F63). A PDF then uses the script layout. */
  script?: ScriptStyle;
  /** How many citations name a source that the project no longer has (F64). */
  missingSources?: number;
  /** The bytes of each image in the text, by id (Phase 16). An image with no entry is not on this device. */
  images?: Readonly<Record<string, ExportImage>>;
}

/** The image blocks of some blocks, in reading order. */
export function imagesOf(blocks: readonly Block[]): ImageBlock[] {
  return blocks.flatMap((block): ImageBlock[] => {
    if (block.type === 'image') return [block];
    if (block.type === 'list') return block.items.flatMap(imagesOf);
    if (block.type === 'quote') return imagesOf(block.blocks);
    return [];
  });
}

/**
 * A file name for each image of the export that has its bytes, in reading order, such as "image-1.jpg".
 * Markdown, EPUB and the walk-away copy use them.
 */
export function imageNames(doc: ExportDoc): Map<string, string> {
  const names = new Map<string, string>();
  for (const section of doc.sections)
    for (const block of imagesOf(section.blocks)) {
      const image = doc.images?.[block.id];
      if (!image || names.has(block.id)) continue;
      names.set(block.id, `image-${String(names.size + 1)}.${image.type === 'image/png' ? 'png' : 'jpg'}`);
    }
  return names;
}

/** The text that stands for an image where a format shows no image, such as "[Image: The harbour]". */
export function imageStandIn(block: ImageBlock): string {
  const words = block.caption || (block.decorative ? '' : block.alt);
  return words === '' ? '[Image]' : `[Image: ${words}]`;
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

/**
 * The name of the bookmark at the start of an item's section in a Word export (F45). Word allows 40
 * characters, and a UUID gives 36.
 */
export function bookmarkName(itemId: string): string {
  return `vlo_${itemId.replace(/-/g, '')}`;
}

/** The paragraphs of plain text. A blank line starts a new paragraph, and a single line break stays a break. */
export function textBlocks(body: string): ParagraphBlock[] {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => ({
      type: 'paragraph',
      runs: paragraph
        .split('\n')
        .flatMap((line, i): Run[] => [
          ...(i > 0 ? [{ type: 'break' } as const] : []),
          { type: 'text', text: line, style: {} },
        ]),
    }));
}

/** Every run of some blocks, in reading order. */
export function runsOf(blocks: readonly Block[]): Run[] {
  return blocks.flatMap((block): Run[] => {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        return block.runs;
      case 'list':
        return block.items.flatMap(runsOf);
      case 'quote':
        return runsOf(block.blocks);
      case 'stanza':
        return block.lines.flatMap((line) => line.runs);
      default:
        return [];
    }
  });
}

/** The footnotes of a document in order. Their numbers count from 1 across the whole export. */
export function footnotesOf(doc: ExportDoc): { number: number; note: NoteContent }[] {
  return doc.sections.flatMap((section) =>
    runsOf(section.blocks).flatMap((run) =>
      run.type === 'footnote' ? [{ number: run.number, note: run.note }] : [],
    ),
  );
}
