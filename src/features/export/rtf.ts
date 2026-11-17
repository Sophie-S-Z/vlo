import { localFontName, vloFont } from '@/features/editor/format/fonts';
import type { NoteContent } from '@/features/editor/format/notes';
import { imageStandIn, repeatsTitle, type Block, type ExportDoc, type Run } from './model';

/*
 * RTF export (.rtf). Word, Pages, TextEdit, LibreOffice, Scrivener and most writing apps open it. The file
 * keeps bold, italic, underline, strike, superscript, subscript, links, alignment, line spacing, indents,
 * lists, quotes, footnotes and images. Each heading has its outline level, so Word and Vlo read it as a
 * heading. Each stanza is one paragraph with a line break after each line, so every space stays.
 */

/** Twips: 1440 to the inch. 12 pt text is 24 half-points. */
const INCH = 1440;
const EM = 240;
const STEP = 720;
const TEXT_SIZE = 24;
const HEADING_SIZES: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = { 1: 40, 2: 32, 3: 28, 4: 24, 5: 22 };
const ALIGN = { left: '\\ql', center: '\\qc', right: '\\qr', justify: '\\qj' } as const;

/** The text in RTF: the control characters are escaped, and each character past ASCII is a \uN. */
export function rtfText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const char = text[i] ?? '';
    if (char === '\\' || char === '{' || char === '}') out += `\\${char}`;
    else if (char === '\t') out += '\\tab ';
    else if (char === '\n') out += '\\line ';
    else if (code > 127) out += `\\u${String(code > 32767 ? code - 65536 : code)}?`;
    else out += char;
  }
  return out;
}

const MARKS = {
  bold: '\\b',
  italic: '\\i',
  underline: '\\ul',
  strike: '\\strike',
  superscript: '\\super',
  subscript: '\\sub',
} as const;
type Mark = keyof typeof MARKS;

function styled(text: string, on: (mark: Mark) => boolean, link?: string): string {
  const codes = (Object.keys(MARKS) as Mark[]).filter(on).map((mark) => MARKS[mark]);
  const run = codes.length > 0 ? `{${codes.join('')} ${text}}` : text;
  return link && /^(https?:|mailto:)/i.test(link)
    ? `{\\field{\\*\\fldinst{HYPERLINK "${rtfText(link).replace(/"/g, '%22')}"}}{\\fldrslt{\\ul ${run}}}}`
    : run;
}

function noteRtf(note: NoteContent): string {
  return note
    .map((run) => {
      const marks = new Set<string>(run.marks?.map((m) => m.type));
      return styled(rtfText(run.text), (mark) => marks.has(mark));
    })
    .join('');
}

interface Context {
  doc: ExportDoc;
  /** The width of the text between the margins, in twips. */
  width: number;
}

function inline(runs: readonly Run[]): string {
  return runs
    .map((run) => {
      if (run.type === 'text')
        return styled(rtfText(run.text), (mark) => run.style[mark] === true, run.style.link);
      if (run.type === 'break') return '\\line ';
      if (run.type === 'math') return rtfText(`$${run.latex}$`);
      // \chftn is the number that the app gives the note.
      return `{\\super\\chftn}{\\footnote\\pard\\plain\\fs20{\\super\\chftn} ${noteRtf(run.note)}}`;
    })
    .join('');
}

function paragraph(props: string, body: string): string {
  return `{\\pard\\plain\\f0\\fs${String(TEXT_SIZE)}\\sa120${props} ${body}\\par}\n`;
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function blockRtf(block: Block, left: number, ctx: Context): string {
  const indent = left > 0 ? `\\li${String(left)}` : '';
  switch (block.type) {
    case 'paragraph': {
      const first = block.hanging
        ? `\\li${String(left + STEP)}\\fi-${String(STEP)}`
        : block.firstLineIndent
          ? `${indent}\\fi${String(2 * EM)}`
          : indent;
      const spacing = block.lineSpacing ? `\\sl${String(Math.round(EM * block.lineSpacing))}\\slmult1` : '';
      return paragraph(`${ALIGN[block.align ?? 'left']}${first}${spacing}`, inline(block.runs));
    }
    case 'heading':
      return paragraph(
        `${ALIGN[block.align ?? 'left']}${indent}\\outlinelevel${String(block.level - 1)}\\keepn\\sb240\\b\\fs${String(HEADING_SIZES[block.level])}${block.level >= 4 ? '\\i' : ''}`,
        inline(block.runs),
      );
    case 'sceneBreak':
      return paragraph('\\qc', '*\\~\\~*\\~\\~*');
    case 'pageBreak':
      return '\\page\n';
    case 'math':
      return paragraph('\\qc', rtfText(`$$${block.latex}$$`));
    case 'image': {
      const image = ctx.doc.images?.[block.id];
      if (!image) return paragraph(`\\qc${indent}`, `{\\i ${rtfText(imageStandIn(block))}}`);
      const width = Math.round((ctx.width * block.width) / 100);
      const height = Math.round((width * image.height) / image.width);
      const pict = `{\\pict${image.type === 'image/png' ? '\\pngblip' : '\\jpegblip'}\\picw${String(image.width)}\\pich${String(image.height)}\\picwgoal${String(width)}\\pichgoal${String(height)}\n${hex(image.data)}}`;
      const caption = block.caption === '' ? '' : paragraph('\\qc', `{\\i ${rtfText(block.caption)}}`);
      return paragraph('\\qc\\keepn', pict) + caption;
    }
    case 'quote':
      return block.blocks.map((b) => blockRtf(b, left + STEP, ctx)).join('');
    case 'list':
      return block.items
        .map((item, i) => {
          const inner = left + STEP;
          const done = block.checked?.[i];
          // A checklist item has its box (U+2610 or U+2611) in place of the bullet.
          const marker = block.ordered
            ? `${String(block.start + i)}.`
            : done === undefined
              ? '\\u8226?'
              : done
                ? '\\u9745?'
                : '\\u9744?';
          const [first, ...rest] = item;
          const head =
            first?.type === 'paragraph'
              ? paragraph(`\\li${String(inner)}\\fi-360`, `${marker}\\tab ${inline(first.runs)}`)
              : paragraph(`\\li${String(inner)}\\fi-360`, marker) +
                (first ? blockRtf(first, inner, ctx) : '');
          return head + rest.map((b) => blockRtf(b, inner, ctx)).join('');
        })
        .join('');
    case 'stanza':
      // One paragraph for each stanza, so an app keeps the space between stanzas and every space in a line.
      return paragraph(indent, block.lines.map((line) => inline(line.runs)).join('\\line '));
  }
}

export function toRtf(doc: ExportDoc): string {
  const [paperWidth, paperHeight] = doc.paper === 'a4' ? [11906, 16838] : [12240, 15840];
  const font = vloFont(doc.font)?.label ?? localFontName(doc.font) ?? 'Times New Roman';
  const ctx: Context = { doc, width: paperWidth - 2 * INCH };
  const parts = [
    `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fnil ${rtfText(font)};}}`,
    `{\\info{\\title ${rtfText(doc.title)}}${doc.author ? `{\\author ${rtfText(doc.author)}}` : ''}}`,
    `\\paperw${String(paperWidth)}\\paperh${String(paperHeight)}\\margl${String(INCH)}\\margr${String(INCH)}\\margt${String(INCH)}\\margb${String(INCH)}\\ftnbj\n`,
    // The title is a Heading 1, as the "#" line of a Markdown export.
    paragraph('\\qc\\outlinelevel0\\sa240\\b\\fs48', rtfText(doc.title)),
    ...(doc.author ? [paragraph('\\qc\\sa480', rtfText(doc.author))] : []),
  ];
  for (const section of doc.sections)
    for (const block of section.blocks)
      if (!repeatsTitle(doc, section, block)) parts.push(blockRtf(block, 0, ctx));
  return `${parts.join('')}}\n`;
}
