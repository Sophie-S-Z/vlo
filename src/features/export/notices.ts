import { localFontName, vloFont } from '@/features/editor/format/fonts';
import type { FontSwap } from './fontCheck';
import type { Block, ExportDoc, Run } from './model';

/*
 * The export notice (plan decisions 5 to 7): each look that a format drops or draws in a simpler way, in
 * plain words, so the writer knows what the file holds before they share it.
 */

/**
 * `web` is a copy for a web editor (F52), which goes to the clipboard and not to a file. `fountain` and
 * `fdx` are script files (F63).
 */
export type ExportFormat = 'docx' | 'pdf' | 'epub' | 'markdown' | 'web' | 'fountain' | 'fdx';

export interface NoticeExtras {
  /** Own fonts that the file swaps for a Vlo font. */
  swaps?: readonly FontSwap[];
  /** Fonts whose bold or italic the file draws from the upright letters. */
  drawnStyles?: readonly { font: string; style: 'bold' | 'italic' }[];
  /** For standard manuscript format: the one font that sets every word. */
  manuscriptFont?: string;
}

interface Looks {
  fonts: Set<string>;
  color: boolean;
  highlight: boolean;
  size: boolean;
  fills: Set<string>;
  shimmer: boolean;
  math: boolean;
  layout: boolean;
  hanging: boolean;
}

function scan(doc: ExportDoc): Looks {
  const looks: Looks = {
    fonts: new Set([doc.font]),
    color: false,
    highlight: false,
    size: false,
    fills: new Set(),
    shimmer: false,
    math: false,
    layout: false,
    hanging: false,
  };
  const runs = (list: readonly Run[]) => {
    for (const run of list) {
      if (run.type === 'math') looks.math = true;
      if (run.type !== 'text') continue;
      const { style } = run;
      if (style.font) looks.fonts.add(style.font);
      if (style.color) looks.color = true;
      if (style.highlight) looks.highlight = true;
      if (style.size !== undefined) looks.size = true;
      if (style.fill) {
        looks.fills.add(style.fill.look);
        if (style.fill.shimmer) looks.shimmer = true;
      }
    }
  };
  const blocks = (list: readonly Block[]) => {
    for (const block of list) {
      switch (block.type) {
        case 'paragraph':
          // A script line's place comes from its role, so it is not the writer's layout.
          if (
            (block.align && !block.role) ||
            block.lineSpacing !== undefined ||
            block.dropCap ||
            block.firstLineIndent
          ) {
            looks.layout = true;
          }
          runs(block.runs);
          break;
        case 'heading':
          if (block.align) looks.layout = true;
          runs(block.runs);
          break;
        case 'list':
          block.items.forEach(blocks);
          break;
        case 'quote':
          blocks(block.blocks);
          break;
        case 'stanza':
          for (const line of block.lines) {
            if (line.hanging > 0) looks.hanging = true;
            runs(line.runs);
          }
          break;
        case 'math':
          looks.math = true;
          break;
        case 'sceneBreak':
          break;
      }
    }
  };
  for (const section of doc.sections) blocks(section.blocks);
  return looks;
}

/** Every font value the export uses: the project font and each font in the text. */
export function usedFonts(doc: ExportDoc): string[] {
  return [...scan(doc).fonts];
}

function list(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/** For Word, which names fonts and does not hold them: the fonts the file names. */
function fontNameNotice(values: readonly string[]): string[] {
  const vlo = values.flatMap((value) => vloFont(value)?.label ?? []);
  const own = values.flatMap((value) => localFontName(value) ?? []);
  const fonts = [...vlo, ...own];
  if (fonts.length === 0) return [];
  const one = fonts.length === 1;
  const free =
    vlo.length > 0 ? ` ${list(vlo)} ${vlo.length === 1 ? 'is' : 'are'} free from Google Fonts.` : '';
  return [
    `The file names the ${one ? 'font' : 'fonts'} ${list(fonts)}. A computer without ${one ? 'it' : 'them'} shows a similar font.${free}`,
  ];
}

function drawnNotices(drawn: NoticeExtras['drawnStyles'], format: ExportFormat): string[] {
  const out: string[] = [];
  for (const style of ['italic', 'bold'] as const) {
    const fonts = (drawn ?? []).filter((d) => d.style === style).map((d) => d.font);
    if (fonts.length === 0) continue;
    const one = fonts.length === 1;
    const whose = one ? 'its' : 'their';
    const change = style === 'italic' ? `${whose} upright letters` : `${whose} letters`;
    const how =
      format === 'pdf'
        ? `The PDF ${style === 'italic' ? 'slants' : 'thickens'} ${change}.`
        : `E-readers ${style === 'italic' ? 'slant' : 'thicken'} ${change}.`;
    out.push(`${list(fonts)} ${one ? 'has' : 'have'} no ${style}. ${how}`);
  }
  return out;
}

/** The notices for one export, in the order the writer reads them. An empty list means nothing changes. */
export function exportNotices(doc: ExportDoc, format: ExportFormat, extras: NoticeExtras = {}): string[] {
  const looks = scan(doc);
  const notices: string[] = [];
  const missing = doc.missingSources ?? 0;
  if (missing > 0)
    notices.push(
      missing === 1
        ? 'A citation names a source that this project does not have now. It shows “[missing source]”.'
        : `${String(missing)} citations name sources that this project does not have now. They show “[missing source]”.`,
    );
  for (const swap of extras.swaps ?? []) {
    notices.push(
      `${swap.name} is not in the file. ${swap.reason} The file uses ${swap.standInName} in its place.`,
    );
  }
  if (extras.manuscriptFont !== undefined) {
    if (
      looks.color ||
      looks.highlight ||
      looks.size ||
      looks.fills.size > 0 ||
      looks.fonts.size > 1 ||
      looks.layout
    ) {
      notices.push(
        'Standard manuscript format sets every word in one font and size, in black, with double spacing. Colors, highlights, sizes and alignment stay in Vlo.',
      );
    }
    if (looks.shimmer) notices.push('Shimmer moves only in Vlo. The file keeps each shimmering word still.');
    if (format === 'docx') notices.push(...fontNameNotice([extras.manuscriptFont]));
    notices.push(...drawnNotices(extras.drawnStyles, format));
    return notices;
  }
  if (looks.shimmer) notices.push('Shimmer moves only in Vlo. The file keeps each shimmering word still.');
  if (format === 'docx') {
    if (looks.fills.size > 0) {
      notices.push(
        'Word shows each gradient. Google Docs and LibreOffice show the first color of each gradient.',
      );
    }
    if (looks.fills.has('metallic') || looks.fills.has('prismatic')) {
      notices.push('Metallic and prismatic words keep their colors as a gradient, without the sheen.');
    }
    notices.push(...fontNameNotice([...looks.fonts]));
  } else if (format === 'pdf' && doc.script) {
    if (looks.color || looks.highlight || looks.size || looks.fills.size > 0 || looks.fonts.size > 1) {
      notices.push(
        'A script PDF sets every word in Courier Prime 12 pt, in black. Colors, highlights, fonts and sizes stay in Vlo.',
      );
    }
  } else if (format === 'pdf') {
    if (looks.fills.has('metallic') || looks.fills.has('prismatic')) {
      notices.push('Metallic and prismatic words keep their colors as a gradient, without the sheen.');
    }
    notices.push(...drawnNotices(extras.drawnStyles, format));
  } else if (format === 'epub') {
    notices.push(
      'Each e-reader sets its own page size, and many let the reader pick the font and text size. Line ends and pages differ from Vlo.',
    );
    if (looks.fills.size > 0) {
      notices.push(
        'An e-reader that cannot fill text with a gradient shows the first color of each gradient.',
      );
    }
    if (looks.fills.has('metallic') || looks.fills.has('prismatic')) {
      notices.push('Metallic and prismatic words keep their colors as a gradient, without the sheen.');
    }
    if (looks.math)
      notices.push('Equations are MathML. An e-reader without MathML shows their symbols in one line.');
    notices.push(...drawnNotices(extras.drawnStyles, format));
  } else if (format === 'web') {
    if (looks.color || looks.highlight || looks.size || looks.fills.size > 0 || looks.fonts.size > 1) {
      notices.push('Web editors set their own colors, fonts and sizes. Those words keep only their text.');
    }
    if (looks.hanging)
      notices.push('Web editors have no hanging indents. Poem lines keep their leading spaces.');
    if (looks.math) notices.push('Equations stay as LaTeX between $ signs.');
  } else if (format === 'fountain' || format === 'fdx') {
    if (looks.color || looks.highlight || looks.size || looks.fills.size > 0 || looks.fonts.size > 1) {
      notices.push(
        `${format === 'fdx' ? 'A Final Draft file' : 'Fountain'} keeps bold, italic and underline. Words with other formats keep only their text.`,
      );
    }
    if (doc.sections.some((s) => s.form !== null && s.form !== 'script'))
      notices.push('Text that is not a script, such as a page of prose, goes in as action.');
    if (looks.math) notices.push('Equations stay as LaTeX between $ signs.');
  } else {
    if (looks.color || looks.size || looks.fills.size > 0 || looks.fonts.size > 1) {
      notices.push('Markdown has no colors, fonts or text sizes. Those words keep only their text.');
    }
    if (looks.highlight) notices.push('Each highlight becomes a <mark> tag, which most apps show in yellow.');
    if (looks.layout)
      notices.push('Markdown has no alignment, line spacing, first-line indents or drop caps.');
    if (looks.hanging) notices.push('Markdown has no hanging indents. Poem lines keep their leading spaces.');
    if (looks.math)
      notices.push('Equations stay as LaTeX between $ signs. Many Markdown apps show them as math.');
  }
  return notices;
}
