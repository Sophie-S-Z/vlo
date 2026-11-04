import { localFontName, vloFont } from '@/features/editor/format/fonts';
import type { Block, ExportDoc, Run } from './model';

/*
 * The export notice (plan decisions 5 to 7): each look that a format drops or draws in a simpler way, in
 * plain words, so the writer knows what the file holds before they share it.
 */

export type ExportFormat = 'docx' | 'markdown';

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
          if (block.align || block.lineSpacing !== undefined || block.dropCap || block.firstLineIndent) {
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

function list(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/** The notices for one export, in the order the writer reads them. An empty list means nothing changes. */
export function exportNotices(doc: ExportDoc, format: ExportFormat): string[] {
  const looks = scan(doc);
  const notices: string[] = [];
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
    const vlo = [...looks.fonts].flatMap((value) => vloFont(value)?.label ?? []);
    const own = [...looks.fonts].flatMap((value) => localFontName(value) ?? []);
    const fonts = [...vlo, ...own];
    if (fonts.length > 0) {
      const one = fonts.length === 1;
      const free =
        vlo.length > 0 ? ` ${list(vlo)} ${vlo.length === 1 ? 'is' : 'are'} free from Google Fonts.` : '';
      notices.push(
        `The file names the ${one ? 'font' : 'fonts'} ${list(fonts)}. A computer without ${one ? 'it' : 'them'} shows a similar font.${free}`,
      );
    }
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
