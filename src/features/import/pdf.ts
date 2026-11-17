import { getDocument, GlobalWorkerOptions, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { escapeHtml, outline, SCENE_BREAK, SCENE_BREAK_HTML, titleOfFile } from './outline';
import { ImportError, type ImportNode } from './tree';

/*
 * PDF files (roadmap F34). A PDF holds lines of text at places on a page, not paragraphs, so Vlo puts
 * the lines back together. PDF.js, in its own worker, gives the text of each page. Lines that sit close
 * together make one paragraph, and a paragraph continues on the next page. A wider gap, an indented line
 * or a line that stops short starts a new paragraph. Short lines in a group are verse, so each one keeps
 * its line break. Large text is a heading, and the page numbers and the running heads stay out.
 *
 * A PDF does not say which words are bold or italic, so the text comes in plain. A scan of pages holds
 * pictures of text and no text, so Vlo cannot read it.
 */

/** One line of a page, in PDF points from the bottom left corner. */
export interface PdfLine {
  text: string;
  x: number;
  y: number;
  right: number;
  size: number;
}

/** The lines of a page from the text pieces of PDF.js, in the order that the page draws them. */
export function pageLines(items: readonly TextItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let line: PdfLine | null = null;
  let ended = false;
  for (const item of items) {
    const [a = 0, b = 0, , , x = 0, y = 0] = item.transform as number[];
    const size = Math.hypot(a, b) || item.height;
    if (item.str !== '') {
      if (!line || ended || Math.abs(y - line.y) > line.size * 0.5) {
        line = { text: '', x, y, right: x, size };
        lines.push(line);
      } else if (x - line.right > size * 0.15 && !/\s$/.test(line.text) && !/^\s/.test(item.str)) {
        line.text += ' ';
      }
      line.text += item.str;
      line.right = Math.max(line.right, x + item.width);
      line.size = Math.max(line.size, size);
      ended = false;
    }
    if (item.hasEOL) ended = true;
  }
  return lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text !== '');
}

const PAGE_NUMBER = /^(page\s+)?\d+(\s*(of|\/)\s*\d+)?$/i;

/** Takes out page numbers and the running heads and feet that repeat at the top or bottom of most pages. */
function withoutPageFurniture(pages: PdfLine[][]): PdfLine[][] {
  const key = (line: PdfLine | undefined) => line?.text.replace(/\d+/g, '#').toLowerCase() ?? '';
  const counts = new Map<string, number>();
  for (const page of pages)
    for (const k of new Set([key(page[0]), key(page.at(-1))])) counts.set(k, (counts.get(k) ?? 0) + 1);
  const repeats = (line: PdfLine) => pages.length >= 3 && (counts.get(key(line)) ?? 0) >= pages.length / 2;
  return pages.map((page) =>
    page.filter(
      (line, i) => !((i === 0 || i === page.length - 1) && (PAGE_NUMBER.test(line.text) || repeats(line))),
    ),
  );
}

/** The value that comes up most often, for the size of the body text. */
function mostCommon(values: readonly number[]): number {
  const counts = new Map<number, number>();
  let best = values[0] ?? 12;
  for (const value of values) {
    const n = (counts.get(value) ?? 0) + 1;
    counts.set(value, n);
    if (n > (counts.get(best) ?? 0)) best = value;
  }
  return best;
}

function median(values: number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

interface Placed extends PdfLine {
  /** The left edge and the right edge of the text on this line's page. */
  left: number;
  edge: number;
  /** The gap above the line is wider than the gap between the lines of a paragraph. */
  gap: boolean;
}

/**
 * The HTML of the pages, and the title when the first heading is the only one of its size. Headings
 * become Heading 1, 2 and 3 by size, from the largest.
 */
export function pdfHtml(pages: PdfLine[][]): { html: string; title?: string } {
  const clean = withoutPageFurniture(pages);
  const all = clean.flat();
  const body = mostCommon(all.flatMap((l) => Array<number>(l.text.length).fill(Math.round(l.size * 2) / 2)));
  const isHeading = (line: PdfLine) => line.size >= body * 1.25 && line.text.length <= 150;
  const gaps = clean.flatMap((page) =>
    page.slice(1).flatMap((line, i) => {
      const above = page[i];
      const gap = above ? above.y - line.y : 0;
      return above && !isHeading(line) && !isHeading(above) && gap > 0 ? [gap] : [];
    }),
  );
  const lineGap = median(gaps) ?? body * 1.2;

  const placed: Placed[] = clean.flatMap((page) => {
    const text = page.filter((l) => !isHeading(l));
    const left = Math.min(...text.map((l) => l.x));
    const edge = Math.max(...text.map((l) => l.right));
    return page.map((line, i) => {
      const above = page[i - 1];
      // Large text has wider lines, so a heading on two lines stays one heading.
      const gap = above !== undefined && above.y - line.y > Math.max(lineGap, line.size * 1.2) * 1.5;
      return { ...line, left, edge, gap };
    });
  });

  // Group the lines into headings and runs of text with no wide gap.
  const groups: { heading: boolean; lines: Placed[] }[] = [];
  for (const line of placed) {
    const heading = isHeading(line);
    const last = groups.at(-1);
    const same = last?.lines[0];
    if (last && same && last.heading === heading && !line.gap && (!heading || same.size === line.size))
      last.lines.push(line);
    else groups.push({ heading, lines: [line] });
  }

  const sizes = [...new Set(groups.filter((g) => g.heading).map((g) => Math.round(g.lines[0]?.size ?? 0)))];
  sizes.sort((a, b) => b - a);
  const [first] = groups;
  let title: string | undefined;
  if (
    first?.heading &&
    groups.filter((g) => g.heading && g.lines[0]?.size === first.lines[0]?.size).length === 1
  ) {
    title = first.lines.map((l) => l.text).join(' ');
    groups.shift();
    sizes.splice(sizes.indexOf(Math.round(first.lines[0]?.size ?? 0)), 1);
  }

  const short = (line: Placed) => line.right < line.edge - line.size * 3;
  const indented = (line: Placed | undefined) => line !== undefined && line.x - line.left > line.size * 0.8;
  const out: string[] = [];
  for (const { heading, lines } of groups) {
    if (heading) {
      const level = Math.min(sizes.indexOf(Math.round(lines[0]?.size ?? 0)) + 1, 3);
      out.push(`<h${String(level)}>${escapeHtml(lines.map((l) => l.text).join(' '))}</h${String(level)}>`);
      continue;
    }
    // Verse: most lines stop short and start at the margin. In prose, a short line ends a paragraph, and
    // most paragraphs that fit on one line, such as lines of dialogue, start with a first-line indent.
    const ended = lines.slice(0, -1);
    if (ended.filter(short).length > ended.length / 2 && lines.filter(indented).length < lines.length / 2) {
      const verse = lines.map((l) => {
        const indent = Math.max(0, Math.round((l.x - l.left) / (l.size * 0.5)));
        return '\u00a0'.repeat(Math.min(indent, 40)) + escapeHtml(l.text);
      });
      out.push(`<p>${verse.join('<br>')}</p>`);
      continue;
    }
    let paragraph = '';
    const end = () => {
      if (paragraph === '') return;
      out.push(SCENE_BREAK.test(paragraph) ? SCENE_BREAK_HTML : `<p>${escapeHtml(paragraph)}</p>`);
      paragraph = '';
    };
    lines.forEach((line, i) => {
      const above = lines[i - 1];
      if (above && (short(above) || indented(line))) end();
      if (paragraph === '') paragraph = line.text;
      // A word that the line end split with a hyphen comes back together.
      else if (/\p{L}-$/u.test(paragraph) && /^\p{Ll}/u.test(line.text))
        paragraph = paragraph.slice(0, -1) + line.text;
      else paragraph += ` ${line.text}`;
    });
    end();
  }
  return { html: out.join(''), ...(title ? { title } : {}) };
}

export async function readPdf(
  name: string,
  bytes: Uint8Array,
): Promise<{ title?: string; nodes: ImportNode[]; skipped: string[] }> {
  // One worker serves every PDF. A test has no Worker, and PDF.js then reads on the main thread.
  if (typeof Worker !== 'undefined' && !GlobalWorkerOptions.workerPort)
    GlobalWorkerOptions.workerPort = new Worker(new URL('./pdf.worker.ts', import.meta.url), {
      type: 'module',
    });
  const task = getDocument({
    // PDF.js takes the buffer, so it gets a copy.
    data: bytes.slice(),
    verbosity: VerbosityLevel.ERRORS,
  });
  try {
    const doc = await task.promise.catch((e: unknown) => {
      throw new ImportError(
        e instanceof Error && e.name === 'PasswordException'
          ? 'This PDF has a password. Save a copy without the password, then import it.'
          : 'Vlo cannot open this PDF file. Pick the file again.',
      );
    });
    const pages: PdfLine[][] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(pageLines(content.items.filter((item): item is TextItem => 'str' in item)));
      page.cleanup();
    }
    if (pages.every((page) => page.length === 0))
      throw new ImportError(
        'This PDF has no text that Vlo can read. A scan of pages holds pictures of the words, not the words.',
      );
    const { html, title } = pdfHtml(pages);
    return {
      ...(title ? { title } : {}),
      nodes: outline(title ?? titleOfFile(name), html, '\n\n'),
      skipped: ['the page layout and the bold and italic of the PDF'],
    };
  } finally {
    await task.destroy();
  }
}
