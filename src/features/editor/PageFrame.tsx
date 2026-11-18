import type { Editor } from '@tiptap/core';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { PageFormat, PageSetup } from '@/lib/db';
import {
  pageBreaks,
  pageTextHeight,
  PAGE_SIZES,
  sheetMargins,
  sheetZoom,
  type BlockBox,
} from './format/page';

/*
 * Page format (plan Task A7, decision 8). In Letter or A4 the text sits on one sheet with the margins of the
 * page setup (Phase 19, Task F3). After each typing pause Vlo measures the text and draws a line at each page
 * end, with the page number above it at the foot of a page, or below it at the top of the next page. The
 * header line shows in the top margin of the first page, and the footer line in the bottom margin of the
 * last page. The lines sit outside ProseMirror, so they never touch the document. Pageless shows the text
 * with no sheet.
 */

/** The typing pause before the page-end lines come back. */
export const PAGE_LINES_PAUSE_MS = 600;
/** The name of the performance measure for each page-end measure. */
export const PAGE_LINES_MEASURE = 'vlo-page-lines';

/** Blocks that move whole to the next page. Every other block can split between two lines. */
const WHOLE = '[data-math-block], [data-scene-break], [data-page-break], hr, img, figure';

function lineHeight(element: Element): number | null {
  if (element.matches(WHOLE)) return null;
  const style = getComputedStyle(element);
  const line = parseFloat(style.lineHeight);
  if (Number.isFinite(line) && line > 0) return line;
  // A line height of "normal" is about 1.2 times the font size.
  const size = parseFloat(style.fontSize);
  return Number.isFinite(size) && size > 0 ? size * 1.2 : null;
}

/** The page setup of a sheet, with the text of its header line and footer line (empty for none). */
export interface SheetSetup {
  setup: PageSetup;
  header: string;
  footer: string;
}

function sameBreaks(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - (b[i] ?? NaN)) < 0.5);
}

interface PageFrameProps {
  editor: Editor;
  format: PageFormat;
  sheet: SheetSetup;
  /** The writer's page zoom in percent. */
  zoom: number;
  /** A value that changes when the text's layout can change outside the document, such as a new font. */
  layoutKey: string;
  /** Receives the page count, or null when no sheet shows. */
  onPages?: ((pages: number | null) => void) | undefined;
  children: ReactNode;
}

export function PageFrame({
  editor,
  format,
  sheet: { setup, header, footer },
  zoom,
  layoutKey,
  onPages,
  children,
}: PageFrameProps) {
  const outer = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const lines = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [breaks, setBreaks] = useState<number[]>([]);
  const size = format === 'pageless' ? null : PAGE_SIZES[format];
  const scale = size && available !== null ? sheetZoom(available, size, zoom) : null;
  const layout = size !== null && scale !== null ? { size, scale } : null;
  const sheet = layout !== null;
  const narrow = size !== null && available !== null && scale === null;
  const margins = sheetMargins(setup);
  const { top: marginTop, right: marginRight, bottom: marginBottom, left: marginLeft } = margins;

  useLayoutEffect(() => {
    const element = outer.current;
    if (!element) return;
    setAvailable(element.clientWidth);
    const observer = new ResizeObserver(() => {
      setAvailable(element.clientWidth);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // A change to the text hides the lines at once. They come back after a typing pause.
  useEffect(() => {
    if (format === 'pageless' || scale === null) return;
    const pageHeight = pageTextHeight(PAGE_SIZES[format], { top: marginTop, bottom: marginBottom }) * scale;
    const measure = () => {
      const box = text.current;
      if (!box || editor.isDestroyed) return;
      const started = performance.now();
      const base = box.getBoundingClientRect().top;
      const blocks: BlockBox[] = [];
      const elements = [
        ...Array.from(editor.view.dom.children),
        ...Array.from(box.querySelectorAll('[data-vlo-notes] > h2, [data-vlo-notes] li')),
      ];
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        blocks.push({
          top: rect.top - base,
          bottom: rect.bottom - base,
          line: lineHeight(element),
          ...(element.matches('[data-page-break]') ? { breakAfter: true } : {}),
        });
      }
      const next = pageBreaks(blocks, pageHeight);
      performance.clearMeasures(PAGE_LINES_MEASURE);
      performance.measure(PAGE_LINES_MEASURE, { start: started, end: performance.now() });
      setBreaks((old) => (sameBreaks(old, next) ? old : next));
      if (lines.current) delete lines.current.dataset.stale;
    };
    let timer = 0;
    const later = (delay: number) => {
      if (lines.current) lines.current.dataset.stale = '';
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, delay);
    };
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) later(PAGE_LINES_PAUSE_MS);
    };
    // A font that finishes loading changes line heights.
    const onFonts = () => {
      later(0);
    };
    editor.on('transaction', onTransaction);
    document.fonts.addEventListener('loadingdone', onFonts);
    // The first measure waits for the next frame, so the sheet has its size.
    const frame = requestAnimationFrame(() => {
      later(0);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      editor.off('transaction', onTransaction);
      document.fonts.removeEventListener('loadingdone', onFonts);
    };
  }, [editor, format, scale, layoutKey, marginTop, marginBottom]);

  const pages = sheet ? breaks.length + 1 : null;
  useEffect(() => {
    onPages?.(pages);
  }, [onPages, pages]);

  const lastBreak = breaks.at(-1) ?? 0;
  const px = (value: number) => `${String(value * (layout?.scale ?? 1))}px`;
  const sheetStyle: CSSProperties | undefined = layout
    ? ({
        '--vlo-zoom': String(layout.scale),
        width: px(layout.size.width),
        padding: `${px(marginTop)} ${px(marginRight)} ${px(marginBottom)} ${px(marginLeft)}`,
      } as CSSProperties)
    : undefined;
  // The paper reaches the end of the last page.
  const textStyle: CSSProperties | undefined = layout
    ? { minHeight: `${String(lastBreak + pageTextHeight(layout.size, margins) * layout.scale)}px` }
    : undefined;
  const { numbers } = setup;
  const edges = { left: `-${px(marginLeft)}`, right: `-${px(marginRight)}` };

  return (
    <div
      ref={outer}
      className="vlo-page-area"
      data-page={sheet ? format : 'pageless'}
      style={sheet ? undefined : ({ '--vlo-zoom': String(zoom / 100) } as CSSProperties)}
    >
      {narrow && (
        <p className="mb-3 text-sm text-muted">
          This window is too narrow for the page view, so the text shows without pages. Exports keep the page
          size.
        </p>
      )}
      <div
        className={sheet ? 'vlo-sheet' : undefined}
        style={sheetStyle}
        data-vlo-sheet={sheet ? '' : undefined}
        // A pointer shortcut only. Keyboard writers are already in the text.
        role="presentation"
        onMouseDown={(event) => {
          // A press on the empty paper below the text puts the caret at the end of the text.
          if (!sheet || (event.target !== event.currentTarget && event.target !== text.current)) return;
          event.preventDefault();
          editor.commands.focus('end');
        }}
      >
        <div ref={text} className="relative" style={textStyle}>
          {children}
          {sheet && (
            <div ref={lines} aria-hidden="true" className="vlo-page-lines" data-stale="">
              <PageLine
                place="top"
                style={{ top: `-${px(marginTop / 2)}` }}
                text={header}
                number={numbers === 'top-right' ? 1 : null}
              />
              {breaks.map((top, i) => (
                <div
                  key={i}
                  className="vlo-page-end"
                  data-page-end={String(i + 1)}
                  style={{ ...edges, top: `${String(top)}px` }}
                >
                  {numbers !== 'none' && (
                    <span
                      className="vlo-page-number"
                      data-place={numbers === 'top-right' ? 'top' : 'bottom'}
                      style={{ right: px(marginRight / 3) }}
                    >
                      {numbers === 'top-right' ? i + 2 : i + 1}
                    </span>
                  )}
                </div>
              ))}
              <PageLine
                place="bottom"
                style={{ bottom: `-${px(marginBottom / 2)}` }}
                text={footer}
                number={numbers === 'bottom-center' ? breaks.length + 1 : null}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The header line in the top margin of the first page, or the footer line in the bottom margin of the last
 * page. The text starts at the left edge of the text, as in the exports. The number sits at the right of
 * the header line, or in the center of the footer line.
 */
function PageLine({
  place,
  style,
  text,
  number,
}: {
  place: 'top' | 'bottom';
  style: CSSProperties;
  text: string;
  number: number | null;
}) {
  if (text === '' && number === null) return null;
  return (
    <div className="vlo-page-line" data-page-line={place} style={style}>
      <span className="truncate">{text}</span>
      {number !== null && <span className="vlo-page-line-number">{number}</span>}
    </div>
  );
}
