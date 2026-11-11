import { PDFDocument } from 'pdf-lib';
import type { ScriptRole } from '@/features/editor/scriptRoles';
import type { ScriptStyle } from '@/lib/db';
import { scriptParts, type ScriptLine } from '../fountain';
import type { ExportDoc, Run } from '../model';
import { Drawer, INK } from './draw';
import { FontSet } from './fonts';
import type { PdfOptions, PdfResult } from './pdf';

/*
 * The script PDF (roadmap 2 F63, plan Task M4). Courier Prime 12 pt on US Letter: 10 characters and 6
 * lines to the inch, 55 lines on a page, and each element at its standard place. A speech that breaks
 * across a page ends with "(MORE)" and goes on under the name with "(CONT'D)". A scene heading never ends
 * a page. A stage play puts the names in the center and the stage directions to the right, in italics.
 */

const INCH = 72;
/** The height of one line: 6 lines to the inch. */
export const LINE = 12;
/** The width of one Courier character at 12 pt: 10 characters to the inch. */
export const CHAR = 7.2;
export const PAGE_LINES = 55;
const PAGE: readonly [number, number] = [8.5 * INCH, 11 * INCH];
/** The baseline of the first line: 1 inch down, less the descent of the letters. */
const FIRST_BASELINE = PAGE[1] - INCH - 9;
const FONT = 'courier-prime';

export interface Column {
  /** From the left edge of the page, in points. */
  left: number;
  /** The most characters on a line. */
  chars: number;
  align: 'left' | 'center' | 'right';
  italic?: true;
}

const at = (inches: number, chars: number, more: Partial<Column> = {}): Column => ({
  left: inches * INCH,
  chars,
  align: 'left',
  ...more,
});

/** The standard screenplay places. The text runs from 1.5 to 7.5 inches. */
const SCREENPLAY: Readonly<Record<ScriptRole, Column>> = {
  heading: at(1.5, 60),
  action: at(1.5, 60),
  character: at(3.7, 38),
  parenthetical: at(3.1, 24),
  dialogue: at(2.5, 35),
  lyric: at(2.5, 35, { italic: true }),
  transition: at(1.5, 60, { align: 'right' }),
};

/** The common stage play places. */
const STAGE: Readonly<Record<ScriptRole, Column>> = {
  heading: at(1.5, 60, { align: 'center' }),
  action: at(3.9, 36, { italic: true }),
  character: at(1.5, 60, { align: 'center' }),
  parenthetical: at(3.9, 36, { italic: true }),
  dialogue: at(1.5, 60),
  lyric: at(1.5, 60, { italic: true }),
  transition: at(1.5, 60, { align: 'right' }),
};

export const COLUMNS: Readonly<Record<ScriptStyle, Readonly<Record<ScriptRole, Column>>>> = {
  screenplay: SCREENPLAY,
  stage: STAGE,
};

export interface Piece {
  text: string;
  bold?: true;
  italic?: true;
  underline?: true;
}

/** One printed line, with its line number on the page from 0. */
export interface PrintedLine {
  line: number;
  /** From the left edge of the page, in points. */
  x: number;
  pieces: Piece[];
}

const IN_SPEECH: ReadonlySet<ScriptRole> = new Set(['parenthetical', 'dialogue', 'lyric']);

/** The words of some runs in lines of at most `chars` characters. A longer word breaks. */
export function wrap(runs: readonly Run[], chars: number): Piece[][] {
  const words: Piece[] = [];
  for (const run of runs) {
    if (run.type !== 'text') continue;
    const { bold, italic, underline } = run.style;
    for (const text of run.text.split(/(\s+)/)) {
      if (text !== '')
        words.push({
          text,
          ...(bold ? { bold } : {}),
          ...(italic ? { italic } : {}),
          ...(underline ? { underline } : {}),
        });
    }
  }
  const lines: Piece[][] = [];
  let line: Piece[] = [];
  let length = 0;
  const end = () => {
    while (line.length > 0 && /^\s+$/.test(line[line.length - 1]?.text ?? '')) line.pop();
    if (line.length > 0) lines.push(line);
    line = [];
    length = 0;
  };
  for (const word of words) {
    if (/^\s+$/.test(word.text)) {
      if (length > 0) {
        line.push({ ...word, text: ' ' });
        length += 1;
      }
      continue;
    }
    if (length + word.text.length > chars) end();
    let rest = word.text;
    while (rest.length > chars) {
      lines.push([{ ...word, text: rest.slice(0, chars) }]);
      rest = rest.slice(chars);
    }
    line.push({ ...word, text: rest });
    length += rest.length;
  }
  end();
  return lines;
}

const lengthOf = (pieces: readonly Piece[]) => pieces.reduce((sum, p) => sum + p.text.length, 0);

function xOf(column: Column, pieces: readonly Piece[]): number {
  const free = (column.chars - lengthOf(pieces)) * CHAR;
  return column.left + (column.align === 'center' ? free / 2 : column.align === 'right' ? free : 0);
}

/** Each page of a script: its printed lines. The first page has no number, as in a printed script. */
export function layOutScript(doc: ExportDoc, style: ScriptStyle): PrintedLine[][] {
  const columns = COLUMNS[style];
  const lines: ScriptLine[] = scriptParts(doc).flatMap((part) => (part.kind === 'lines' ? part.lines : []));
  const pages: PrintedLine[][] = [[]];
  let used = 0;
  const page = () => pages[pages.length - 1] ?? [];
  const newPage = () => {
    pages.push([]);
    used = 0;
  };
  const put = (role: ScriptRole, rows: readonly Piece[][]) => {
    const column = columns[role];
    for (const pieces of rows) {
      page().push({
        line: used,
        x: xOf(column, pieces),
        pieces: column.italic ? pieces.map((p) => ({ ...p, italic: true })) : [...pieces],
      });
      used += 1;
    }
  };
  const rowsOf = (line: ScriptLine | undefined) => (line ? wrap(line.runs, columns[line.role].chars) : []);
  const gapOf = (line: ScriptLine, before: ScriptLine | undefined) =>
    used === 0 ||
    !before ||
    (IN_SPEECH.has(line.role) && (before.role === 'character' || IN_SPEECH.has(before.role)))
      ? 0
      : 1;
  const plain = (text: string): Piece[][] => [[{ text }]];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const rows = rowsOf(line);
    if (line.role === 'character') {
      // A speech: the name, then each parenthetical, dialogue and lyric line under it.
      const speech: { role: ScriptRole; rows: Piece[][] }[] = [];
      while (lines[i + 1] && IN_SPEECH.has(lines[i + 1]?.role ?? 'action')) {
        i += 1;
        const next = lines[i];
        if (next) speech.push({ role: next.role, rows: rowsOf(next) });
      }
      let gap = gapOf(line, lines[i - speech.length - 1]);
      let name = rows;
      let rest = speech.flatMap((s) => s.rows.map((row) => ({ role: s.role, row })));
      for (;;) {
        const need = gap + name.length + rest.length;
        if (used + need <= PAGE_LINES) break;
        // The speech breaks: the lines that fit, "(MORE)", then the name again on the next page.
        const room = PAGE_LINES - used - gap - name.length - 1;
        if (room >= 1) {
          used += gap;
          put('character', name);
          for (const { role, row } of rest.slice(0, room)) put(role, [row]);
          put('character', plain('(MORE)'));
          rest = rest.slice(room);
          const said = (name[0] ?? []).map((p) => p.text).join('');
          name = plain(said.includes("(CONT'D)") ? said : `${said} (CONT'D)`);
        } else if (used === 0) break;
        newPage();
        gap = 0;
      }
      used += gap;
      put('character', name);
      for (const { role, row } of rest) put(role, [row]);
      continue;
    }
    const gap = gapOf(line, lines[i - 1]);
    if (line.role === 'heading') {
      // A heading keeps the first line of what follows it on its page. For a speech, that is the name and
      // the lines that a break needs: one line and "(MORE)", or the whole speech when it is shorter.
      const next = lines[i + 1];
      let follow = next ? 1 + Math.min(rowsOf(next).length, 1) : 0;
      if (next?.role === 'character') {
        let said = 0;
        for (let j = i + 2; said < 2 && IN_SPEECH.has(lines[j]?.role ?? 'action'); j += 1) {
          said += rowsOf(lines[j]).length;
        }
        follow = 1 + rowsOf(next).length + Math.min(said, 2);
      }
      if (used > 0 && used + gap + rows.length + follow > PAGE_LINES) newPage();
    } else if (used + gap + 1 > PAGE_LINES) newPage();
    used += used === 0 ? 0 : gap;
    for (const row of rows) {
      if (used >= PAGE_LINES) newPage();
      put(line.role, [row]);
    }
  }
  return pages.filter((p, index) => index === 0 || p.length > 0);
}

/** The PDF of a script: a title page, then the pages with their numbers from page 2. */
export async function toScriptPdf(
  doc: ExportDoc,
  style: ScriptStyle,
  options: PdfOptions,
): Promise<PdfResult> {
  const pdf = await PDFDocument.create();
  const fonts = new FontSet(pdf, options.loadFile, new Map(), new Map(), FONT);
  const face = (piece: Piece) => fonts.face(FONT, piece.bold === true, piece.italic === true);
  const draw = async (lines: readonly PrintedLine[]) => {
    const d = new Drawer(pdf, pdf.addPage([...PAGE]));
    for (const { line, x, pieces } of lines) {
      const y = FIRST_BASELINE - line * LINE;
      let left = x;
      for (const piece of pieces) {
        d.text(piece.text, left, y, { face: await face(piece), size: 12, color: INK });
        if (piece.underline) d.rect(left, y - 1.5, piece.text.length * CHAR, 0.6, INK);
        left += piece.text.length * CHAR;
      }
    }
  };
  const center = (text: string, line: number): PrintedLine => ({
    line,
    x: (PAGE[0] - text.length * CHAR) / 2,
    pieces: [{ text }],
  });
  await draw([
    center(doc.title, 20),
    ...(doc.author ? [center('Written by', 23), center(doc.author, 25)] : []),
  ]);
  for (const [index, lines] of layOutScript(doc, style).entries()) {
    // The page number sits half an inch from the top, at the right edge of the text.
    const number = `${String(index + 1)}.`;
    await draw(
      index === 0
        ? lines
        : [...lines, { line: -3, x: 7.5 * INCH - number.length * CHAR, pieces: [{ text: number }] }],
    );
  }
  pdf.setTitle(doc.title);
  pdf.setLanguage(doc.language);
  if (doc.author) pdf.setAuthor(doc.author);
  pdf.setCreator('Vlo');
  pdf.setProducer('Vlo');
  return { bytes: await pdf.save(), drawnStyles: [] };
}
