import {
  AlignmentType,
  Bookmark,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  DeletedTextRun,
  Document,
  DropCapType,
  ExternalHyperlink,
  FootnoteReferenceRun,
  FrameAnchorType,
  FrameWrap,
  Header,
  HeadingLevel,
  InsertedTextRun,
  LevelFormat,
  LineRuleType,
  Math as MathBlock,
  MathRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Tab,
  TabStopType,
  TextRun,
  type ICommentOptions,
  type IRunOptions,
  type NumberingDefinition,
  type ParagraphChild,
} from 'docx';
import JSZip from 'jszip';
import type { TextFill } from '@/features/editor/format/fill';
import { localFontName, vloFont } from '@/features/editor/format/fonts';
import type { NoteContent } from '@/features/editor/format/notes';
import { textDirection } from '@/lib/language';
import { mathmlFor, type LatexToMathml } from './latex';
import { headerText, plainDoc, roundedWords, type ManuscriptSetup } from './manuscript';
import { parseMathml } from './mathml';
import {
  repeatsTitle,
  runsOf,
  type Align,
  type Block,
  type ExportDoc,
  type Run,
  type RunStyle,
} from './model';
import { ommlOf } from './omml';

export type { LatexToMathml } from './latex';

/*
 * Word export (spec section 9). Every text run keeps its spaces (docx writes xml:space="preserve"). A poem
 * line is one paragraph with a hanging indent, an empty paragraph separates stanzas, and a scene break is a
 * centered "#". Footnotes are Word footnotes. Each equation is a Word equation, built from MathLive's
 * MathML. A gradient becomes a Word gradient text fill (w14:textFill, Word 2010 and later), and its first
 * color is the plain color for readers that have no text fills, such as Google Docs and LibreOffice.
 * Each section starts with the bookmark `vlo_<item id>`, so "Import an editor's changes" finds its item.
 * A run with a change is a Word tracked change, and a run with a comment is in a Word comment's range (F45).
 */

/** Word sizes are in half-points. The text size is 12 pt. */
const TEXT_SIZE = 24;
/** One em at the text size, in twentieths of a point (twips). */
const EM = 240;
const INCH = 1440;
/** The indent of each list level and each quote. */
const STEP = 720;

/** Converts LaTeX to MathML. The export loads MathLive's converter only when the export has math. */

export interface DocxOptions {
  /** A converter for tests. By default the export loads MathLive's converter, which needs no DOM. */
  toMathml?: LatexToMathml;
  /** Standard manuscript format, for a novel. */
  manuscript?: ManuscriptSetup;
}

/** Double spacing in standard manuscript format, in 240ths of a line. */
const DOUBLE = 480;

/** The Word name of a stored font value: the font's own name, which Word looks for on the computer. */
export function wordFontName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return vloFont(value)?.label ?? localFontName(value) ?? undefined;
}

const ALIGNMENT: Readonly<Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]>> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
];

const BULLETS = ['•', '◦', '▪'];

/** The marker style that names a text fill. It never reaches the file: `applyFills` swaps it for the fill. */
const FILL_STYLE = 'VloFill';

function hex(color: string): string {
  return color.replace('#', '').toUpperCase();
}

/** The DrawingML text fill for a Vlo fill. CSS 90deg runs left to right, which is 0 in DrawingML. */
export function textFillXml(fill: TextFill): string {
  const angle = (((fill.angle - 90) % 360) + 360) % 360;
  const stops = fill.stops
    .map((s) => `<w14:gs w14:pos="${String(s.at * 1000)}"><w14:srgbClr w14:val="${hex(s.color)}"/></w14:gs>`)
    .join('');
  const gradient = `<w14:textFill><w14:gradFill><w14:gsLst>${stops}</w14:gsLst><w14:lin w14:ang="${String(angle * 60000)}" w14:scaled="0"/></w14:gradFill></w14:textFill>`;
  if (fill.look !== 'glow') return gradient;
  const glow = fill.stops[0]?.color ?? '#ffffff';
  // A glow is a soft halo of the first color around the letters, as in the editor.
  return `<w14:glow w14:rad="101600"><w14:srgbClr w14:val="${hex(glow)}"><w14:alpha w14:val="40000"/></w14:srgbClr></w14:glow>${gradient}`;
}

interface Context {
  /** The fills in the export, by the number in their marker style. */
  fills: TextFill[];
  toMathml: LatexToMathml;
  /** The next list number for Word, so each list starts again at its own first number. */
  nextList: () => number;
  /** Standard manuscript format: double spacing, indented first lines, chapters on new pages. */
  manuscript: boolean;
  /** In standard manuscript format, the space above a chapter title, so it starts a third down the page. */
  chapterDrop: number;
  /** The name of a change or a comment with no author: the writer. */
  writer: string;
  /** The last Word id of a tracked change. */
  revision: number;
  /** The Word comments, in the order their ranges start. */
  comments: ICommentOptions[];
  /** The characters of each comment that this section has yet to write. The range ends with the last. */
  commentLeft: Map<string, number>;
  /** The Word id of each comment whose range started in this section. */
  commentWord: Map<string, number>;
}

/** The Word name of a section's bookmark. Word allows 40 characters, and a UUID gives 36. */
export function bookmarkName(itemId: string): string {
  return `vlo_${itemId.replace(/-/g, '')}`;
}

type TextRunModel = Extract<Run, { type: 'text' }>;

/** The characters of each comment in some blocks. */
function commentLengths(blocks: readonly Block[]): Map<string, number> {
  const lengths = new Map<string, number>();
  for (const run of runsOf(blocks)) {
    if (run.type === 'text' && run.comment)
      lengths.set(run.comment.id, (lengths.get(run.comment.id) ?? 0) + run.text.length);
  }
  return lengths;
}

/**
 * A text run as Word parts: a tracked change if it has one, in a link if it has one, and in its comment's
 * range if it has one. A comment's range starts with its first run and ends after its last run in the
 * section, so it can hold more than one paragraph.
 */
function textParts(run: TextRunModel, ctx: Context, extra: IRunOptions = {}): ParagraphChild[] {
  const options = { text: run.text, ...runOptions(run.style, ctx), ...extra };
  const change = run.change;
  let part: ParagraphChild = new TextRun(options);
  if (change) {
    ctx.revision += 1;
    const tracked = {
      ...options,
      id: ctx.revision,
      author: change.by || ctx.writer,
      date: new Date(change.at).toISOString(),
    };
    part = change.kind === 'insert' ? new InsertedTextRun(tracked) : new DeletedTextRun(tracked);
  }
  if (run.style.link) part = new ExternalHyperlink({ link: run.style.link, children: [part] });
  const comment = run.comment;
  if (!comment) return [part];
  const out: ParagraphChild[] = [];
  let word = ctx.commentWord.get(comment.id);
  if (word === undefined) {
    word = ctx.comments.length;
    ctx.commentWord.set(comment.id, word);
    ctx.comments.push({
      id: word,
      author: comment.by || ctx.writer,
      date: new Date(comment.at),
      children: comment.text.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] })),
    });
    out.push(new CommentRangeStart(word));
  }
  out.push(part);
  const left = (ctx.commentLeft.get(comment.id) ?? 0) - run.text.length;
  ctx.commentLeft.set(comment.id, left);
  if (left <= 0) {
    out.push(new CommentRangeEnd(word), new TextRun({ children: [new CommentReference(word)] }));
  }
  return out;
}

function runOptions(style: RunStyle, ctx: Context): IRunOptions {
  const font = wordFontName(style.font);
  let fillStyle: string | undefined;
  if (style.fill) {
    ctx.fills.push(style.fill);
    fillStyle = `${FILL_STYLE}${String(ctx.fills.length - 1)}`;
  }
  const color = style.fill?.stops[0]?.color ?? style.color;
  return {
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italics: true } : {}),
    ...(style.underline ? { underline: {} } : {}),
    ...(style.strike ? { strike: true } : {}),
    ...(style.superscript ? { superScript: true } : {}),
    ...(style.subscript ? { subScript: true } : {}),
    ...(color ? { color: hex(color) } : {}),
    ...(style.highlight
      ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(style.highlight) } }
      : {}),
    ...(font ? { font } : {}),
    ...(style.size !== undefined ? { size: Math.round(TEXT_SIZE * style.size) } : {}),
    ...(fillStyle ? { style: fillStyle } : style.link ? { style: 'Hyperlink' } : {}),
  };
}

function equation(latex: string, ctx: Context): MathBlock {
  const parts = ommlOf(parseMathml(ctx.toMathml(latex)));
  // MathLive cannot read every command. Word reads LaTeX typed into an equation, so the source stays there.
  return new MathBlock({ children: parts.length > 0 ? parts : [new MathRun(latex)] });
}

function noteRuns(note: NoteContent): TextRun[] {
  return note.map((run) => {
    const marks = new Set(run.marks?.map((m) => m.type));
    const options: IRunOptions = {
      text: run.text,
      ...(marks.has('bold') ? { bold: true } : {}),
      ...(marks.has('italic') ? { italics: true } : {}),
      ...(marks.has('underline') ? { underline: {} } : {}),
      ...(marks.has('strike') ? { strike: true } : {}),
      ...(marks.has('superscript') ? { superScript: true } : {}),
      ...(marks.has('subscript') ? { subScript: true } : {}),
    };
    return new TextRun(options);
  });
}

function inline(runs: readonly Run[], ctx: Context): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const run of runs) {
    if (run.type === 'text') {
      out.push(...textParts(run, ctx));
    } else if (run.type === 'break') {
      out.push(new TextRun({ break: 1 }));
    } else if (run.type === 'math') {
      out.push(equation(run.latex, ctx));
    } else {
      out.push(new FootnoteReferenceRun({ children: [new Paragraph({ children: noteRuns(run.note) })] }));
    }
  }
  return out;
}

interface Place {
  /** The left indent from lists and quotes, in twips. */
  left: number;
  /** True for a part or chapter title, which starts a new page in standard manuscript format. */
  folder?: boolean;
  /** Set for the first paragraph of a list item. */
  numbering?: { reference: string; level: number; instance: number };
}

/** The first letter of a paragraph that opens with a drop cap, and the runs after it. */
function splitDropCap(runs: readonly Run[]): { letter: TextRunModel; rest: Run[] } | null {
  const [first, ...others] = runs;
  if (first?.type !== 'text' || /^\s/.test(first.text)) return null;
  const letter = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(first.text)][0]
    ?.segment;
  if (!letter) return null;
  const tail = first.text.slice(letter.length);
  return {
    letter: { ...first, text: letter },
    rest: tail === '' ? others : [{ ...first, text: tail }, ...others],
  };
}

function blockParagraphs(block: Block, place: Place, ctx: Context): Paragraph[] {
  const indent = place.left > 0 ? { left: place.left } : undefined;
  const numbering = place.numbering ? { numbering: place.numbering } : {};
  switch (block.type) {
    case 'paragraph': {
      if (ctx.manuscript) {
        const firstLine = place.numbering ? {} : { firstLine: STEP };
        return [
          new Paragraph({
            ...numbering,
            indent: { ...indent, ...firstLine },
            children: inline(block.runs, ctx),
          }),
        ];
      }
      const options = {
        ...numbering,
        ...(block.align ? { alignment: ALIGNMENT[block.align] } : {}),
        ...(block.lineSpacing !== undefined
          ? { spacing: { line: Math.round(EM * block.lineSpacing), lineRule: LineRuleType.AUTO } }
          : {}),
      };
      const firstLine = block.firstLineIndent ? { firstLine: 2 * EM } : {};
      const paragraphIndent = indent || block.firstLineIndent ? { indent: { ...indent, ...firstLine } } : {};
      const drop = block.dropCap && !place.numbering ? splitDropCap(block.runs) : null;
      if (drop) {
        // Word draws a drop cap as a framed paragraph that holds the letter, three lines tall. Word's own
        // drop caps set the letter a little under the height of the lines it spans.
        const letterPoints = 3 * (TEXT_SIZE / 2) * (block.lineSpacing ?? 1.15) * 0.95;
        const cap = new Paragraph({
          frame: {
            type: 'absolute',
            position: { x: 0, y: 0 },
            anchor: { horizontal: FrameAnchorType.TEXT, vertical: FrameAnchorType.TEXT },
            dropCap: DropCapType.DROP,
            lines: 3,
            wrap: FrameWrap.AROUND,
          },
          spacing: { after: 0, line: Math.round(letterPoints * 20), lineRule: LineRuleType.EXACT },
          children: textParts(drop.letter, ctx, { size: Math.round(letterPoints * 2) }),
        });
        return [cap, new Paragraph({ ...options, ...paragraphIndent, children: inline(drop.rest, ctx) })];
      }
      return [new Paragraph({ ...options, ...paragraphIndent, children: inline(block.runs, ctx) })];
    }
    case 'heading':
      if (ctx.manuscript) {
        return [
          new Paragraph({
            heading: HEADINGS[block.level - 1] ?? HeadingLevel.HEADING_2,
            alignment: block.level <= 2 ? AlignmentType.CENTER : AlignmentType.LEFT,
            ...(place.folder
              ? { pageBreakBefore: true, spacing: { before: ctx.chapterDrop, after: DOUBLE } }
              : {}),
            ...(indent ? { indent } : {}),
            children: inline(block.runs, ctx),
          }),
        ];
      }
      return [
        new Paragraph({
          heading: HEADINGS[block.level - 1] ?? HeadingLevel.HEADING_2,
          ...(block.align ? { alignment: ALIGNMENT[block.align] } : {}),
          ...(indent ? { indent } : {}),
          ...numbering,
          children: inline(block.runs, ctx),
        }),
      ];
    case 'sceneBreak':
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          ...(ctx.manuscript ? {} : { spacing: { before: EM, after: EM } }),
          children: [new TextRun('#')],
        }),
      ];
    case 'math':
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          ...(indent ? { indent } : {}),
          ...numbering,
          children: [equation(block.latex, ctx)],
        }),
      ];
    case 'quote':
      return blocksParagraphs(block.blocks, { ...place, left: place.left + STEP }, ctx);
    case 'list': {
      const instance = ctx.nextList();
      const reference = block.ordered ? `vlo-ordered-${String(block.start)}` : 'vlo-bullet';
      const level = Math.min(Math.round(place.left / STEP), 8);
      return block.items.flatMap((item) => {
        const inner: Place = { left: (level + 1) * STEP };
        const [first, ...rest] = item;
        const head = first
          ? blockParagraphs(first, { ...inner, numbering: { reference, level, instance } }, ctx)
          : [new Paragraph({ numbering: { reference, level, instance }, children: [] })];
        return [...head, ...blocksParagraphs(rest, inner, ctx)];
      });
    }
    case 'stanza':
      return block.lines.map((line) => {
        const hanging = Math.round(line.hanging * EM);
        return new Paragraph({
          style: 'VloPoemLine',
          ...(hanging > 0 || place.left > 0
            ? { indent: { left: place.left + hanging, ...(hanging > 0 ? { hanging } : {}) } }
            : {}),
          children: inline(line.runs, ctx),
        });
      });
  }
}

function blocksParagraphs(blocks: readonly Block[], place: Place, ctx: Context): Paragraph[] {
  const out: Paragraph[] = [];
  blocks.forEach((block, i) => {
    // An empty paragraph separates two stanzas, so the poem keeps its breaks in every reader.
    if (block.type === 'stanza' && blocks[i - 1]?.type === 'stanza') {
      out.push(new Paragraph({ style: 'VloPoemLine', children: [] }));
    }
    out.push(...blockParagraphs(block, place, ctx));
  });
  return out;
}

/** The list definitions: one bullet list, and one numbered list for each first number in the export. */
function numberingConfig(doc: ExportDoc): NumberingDefinition[] {
  const starts = new Set<number>();
  const visit = (blocks: readonly Block[]) => {
    for (const block of blocks) {
      if (block.type === 'list') {
        if (block.ordered) starts.add(block.start);
        block.items.forEach(visit);
      } else if (block.type === 'quote') visit(block.blocks);
    }
  };
  doc.sections.forEach((s) => {
    visit(s.blocks);
  });
  const levels = (ordered: boolean, start: number) =>
    Array.from({ length: 9 }, (_, level) => ({
      level,
      format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
      text: ordered ? `%${String(level + 1)}.` : (BULLETS[level % BULLETS.length] ?? '•'),
      alignment: AlignmentType.LEFT,
      ...(ordered && level === 0 ? { start } : {}),
      style: { paragraph: { indent: { left: (level + 1) * STEP, hanging: STEP / 2 } } },
    }));
  return [
    { reference: 'vlo-bullet', levels: levels(false, 1) },
    ...[...starts].map((start) => ({
      reference: `vlo-ordered-${String(start)}`,
      levels: levels(true, start),
    })),
  ];
}

/** Swaps each fill marker style in the document for its Word text fill. */
async function applyFills(bytes: Uint8Array, fills: readonly TextFill[]): Promise<Uint8Array> {
  if (fills.length === 0) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file('word/document.xml');
  if (!file) return bytes;
  const xml = await file.async('string');
  const marker = new RegExp(`<w:rStyle w:val="${FILL_STYLE}(\\d+)"/>([\\s\\S]*?)</w:rPr>`, 'g');
  // The w14 parts close the run properties, after every w: part (ECMA-376 and MS-DOCX order).
  const out = xml.replace(marker, (all, index: string, rest: string) => {
    const fill = fills[Number(index)];
    return fill ? `${rest}${textFillXml(fill)}</w:rPr>` : all;
  });
  zip.file('word/document.xml', out);
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** The language of every run and, for right-to-left writing, the direction of every paragraph (F38). */
function languageStyle(language: string) {
  const rtl = textDirection(language) === 'rtl';
  const cjk = ['zh', 'ja', 'ko'].includes(language.split('-')[0] ?? '');
  return {
    run: {
      language: rtl ? { bidirectional: language } : cjk ? { eastAsia: language } : { value: language },
      ...(rtl ? { rightToLeft: true } : {}),
    },
    paragraph: rtl ? { bidirectional: true } : {},
  };
}

/** The heading, run and paragraph styles: Vlo's look, or plain 12 pt text for standard manuscript format. */
function styles(font: string, manuscript: boolean, language: string) {
  const ink = '1F1D1B';
  const lang = languageStyle(language);
  if (manuscript) {
    const plain = { font, size: TEXT_SIZE, color: '000000' };
    const heading = {
      run: { ...plain, bold: false },
      paragraph: { spacing: { before: 0, after: 0 }, keepNext: true },
    };
    return {
      default: {
        document: {
          run: { ...plain, ...lang.run },
          paragraph: { spacing: { before: 0, after: 0, line: DOUBLE }, ...lang.paragraph },
        },
        title: { run: plain, paragraph: { alignment: AlignmentType.CENTER } },
        heading1: heading,
        heading2: heading,
        heading3: { ...heading, run: { ...plain, bold: true } },
        heading4: { ...heading, run: { ...plain, bold: true, italics: true } },
        hyperlink: { run: plain },
      },
      paragraphStyles: [
        {
          id: 'VloPoemLine',
          name: 'Poem Line',
          basedOn: 'Normal',
          paragraph: { spacing: { after: 0, line: DOUBLE } },
        },
      ],
    };
  }
  return {
    default: {
      document: {
        run: { font, size: TEXT_SIZE, ...lang.run },
        paragraph: { spacing: { after: 160, line: 276 }, ...lang.paragraph },
      },
      title: {
        run: { font, size: 56, color: ink },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 2 * EM, after: EM } },
      },
      heading1: {
        run: { font, size: 40, bold: true, color: ink },
        paragraph: { spacing: { before: 3 * EM, after: EM }, keepNext: true },
      },
      heading2: {
        run: { font, size: 32, bold: true, color: ink },
        paragraph: { spacing: { before: 2 * EM, after: EM }, keepNext: true },
      },
      heading3: {
        run: { font, size: 28, bold: true, color: ink },
        paragraph: { spacing: { before: EM, after: EM / 2 }, keepNext: true },
      },
      heading4: {
        run: { font, size: 24, bold: true, italics: true, color: ink },
        paragraph: { spacing: { before: EM, after: EM / 2 }, keepNext: true },
      },
      hyperlink: { run: { color: '2F5D8A', underline: {} } },
    },
    paragraphStyles: [
      {
        id: 'VloPoemLine',
        name: 'Poem Line',
        basedOn: 'Normal',
        paragraph: { spacing: { after: 0, line: 276 } },
      },
    ],
  };
}

/**
 * The first page in standard manuscript format: the name and the word count on one line, the contact lines
 * under the name, then the title and byline in the middle of the page.
 */
function manuscriptOpening(
  doc: ExportDoc,
  setup: ManuscriptSetup,
  textWidth: number,
  textHeight: number,
): Paragraph[] {
  const single = { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO };
  const contact = setup.contact
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const top = [
    new Paragraph({
      spacing: single,
      tabStops: [{ type: TabStopType.RIGHT, position: textWidth }],
      children: [
        new TextRun(setup.name),
        new TextRun({ children: [new Tab(), roundedWords(setup.words, doc.language)] }),
      ],
    }),
    ...contact.map((line) => new Paragraph({ spacing: single, children: [new TextRun(line)] })),
  ];
  // The title sits half way down the text area, under the lines above it.
  const above = (1 + contact.length) * 240;
  return [
    ...top,
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { before: Math.max(EM, Math.round(textHeight / 2 - above)), after: 0, line: DOUBLE },
      children: [new TextRun(doc.title)],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(`by ${setup.name}`)] }),
  ];
}

/** The Word file of an export. */
export async function toDocx(source: ExportDoc, options: DocxOptions = {}): Promise<Uint8Array> {
  const setup = options.manuscript;
  const doc = setup ? plainDoc(source, setup.typewriter ? 'courier-prime' : source.font) : source;
  const toMathml = options.toMathml ?? (await mathmlFor(doc));
  const page =
    doc.paper === 'a4'
      ? { width: 11906, height: 16838 }
      : { width: Math.round(8.5 * INCH), height: 11 * INCH };
  const textWidth = page.width - 2 * INCH;
  const textHeight = page.height - 2 * INCH;
  let list = 0;
  const ctx: Context = {
    fills: [],
    toMathml,
    nextList: () => (list += 1),
    manuscript: setup !== undefined,
    chapterDrop: Math.round(textHeight / 3),
    writer: setup?.name ?? doc.author ?? 'Writer',
    revision: 0,
    comments: [],
    commentLeft: new Map(),
    commentWord: new Map(),
  };
  const font = wordFontName(doc.font) ?? 'Newsreader';

  const children: Paragraph[] = [];
  if (setup) {
    children.push(...manuscriptOpening(doc, setup, textWidth, textHeight));
  } else {
    children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(doc.title)] }));
    if (doc.author) {
      const authorRun: IRunOptions = { text: doc.author, italics: true };
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 2 * EM },
          children: [new TextRun(authorRun)],
        }),
      );
    }
  }
  for (const [index, section] of doc.sections.entries()) {
    const blocks = section.blocks.filter((block) => !repeatsTitle(doc, section, block));
    ctx.commentLeft = commentLengths(blocks);
    ctx.commentWord = new Map();
    const paragraphs = blocksParagraphs(
      blocks,
      { left: 0, ...(section.form === null ? { folder: true } : {}) },
      ctx,
    );
    // In standard manuscript format the text starts on the page after the title page.
    if (setup && index === 0 && section.form !== null) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    const mark = new Bookmark({ id: bookmarkName(section.id), children: [] });
    // docx types addRunToFront for runs, but it puts any part of a paragraph before the first run.
    paragraphs[0]?.addRunToFront(mark.end as never).addRunToFront(mark.start as never);
    children.push(...paragraphs);
  }

  const document = new Document({
    title: doc.title,
    ...(setup ? { creator: setup.name } : doc.author ? { creator: doc.author } : {}),
    styles: styles(font, setup !== undefined, doc.language),
    numbering: { config: numberingConfig(doc) },
    ...(ctx.comments.length > 0 ? { comments: { children: ctx.comments } } : {}),
    sections: [
      {
        properties: {
          page: {
            size: page,
            margin: { top: INCH, right: INCH, bottom: INCH, left: INCH, header: INCH / 2 },
            ...(setup ? { pageNumbers: { start: 0 } } : {}),
          },
          ...(setup ? { titlePage: true } : {}),
        },
        ...(setup
          ? {
              headers: {
                first: new Header({ children: [] }),
                default: new Header({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      spacing: { before: 0, after: 0, line: 240 },
                      children: [
                        new TextRun(headerText(setup.name, doc.title)),
                        new TextRun({ children: [PageNumber.CURRENT] }),
                      ],
                    }),
                  ],
                }),
              },
            }
          : {}),
        children,
      },
    ],
  });
  const bytes = new Uint8Array(await Packer.toArrayBuffer(document));
  return applyFills(bytes, ctx.fills);
}
