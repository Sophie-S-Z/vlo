import { appFile } from '@/lib/net';
import { hasTemplate } from '@/features/library/templates';
import type { NameCheck, PrivatePerson } from '@/lib/privacy';
import { exportFileName, type BuildInput } from './build';
import { checkOwnFonts, ownFontsOf, type FontCheck, type FontSwap } from './fontCheck';
import type { ManuscriptDetails, ManuscriptSetup } from './manuscript';
import type { ExportDoc } from './model';
import { exportNotices, type ExportFormat } from './notices';
import type { LoadFile } from './pdf/fonts';
import { safeExportTree } from './safeTree';

/*
 * One export from start to end: the export tree, the share-safe aliases, the check of the writer's own
 * fonts, then the file. The export worker runs this, so a long book never stops the page. Each format's
 * code loads only when the writer picks it.
 */

export interface ExportRequest extends Omit<BuildInput, 'updates'> {
  format: ExportFormat;
  /** Each item's Yjs update, by item id. */
  updates: [string, Uint8Array][];
  /** The project's people, for share-safe export. */
  people: PrivatePerson[];
  shareSafe: boolean;
  /** Standard manuscript format, with the writer's details. Only a novel in Word or PDF uses it. */
  manuscript?: ManuscriptDetails;
  /** Adds the AI provenance page (F26) as the last section, dated at this time in milliseconds. */
  provenance?: { at: number };
  /**
   * Plain text in place of the items, with no title, such as a packet's cover letter (F53). `name` names
   * the file.
   */
  text?: { name: string; body: string };
}

export interface ExportFile {
  bytes: Uint8Array;
  /** The file name with its extension. */
  name: string;
  type: string;
  notices: string[];
  /** The plain text beside the HTML of a web copy, for an app that takes no rich text (F52). */
  text?: string;
}

export const FORMAT_FILE: Readonly<Record<ExportFormat, { extension: string; type: string }>> = {
  docx: {
    extension: 'docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  pdf: { extension: 'pdf', type: 'application/pdf' },
  epub: { extension: 'epub', type: 'application/epub+zip' },
  markdown: { extension: 'md', type: 'text/markdown;charset=utf-8' },
  web: { extension: 'html', type: 'text/html;charset=utf-8' },
};

/** True for the formats that embed fonts, so the writer's own fonts need a check. */
export function embedsFonts(format: ExportFormat): boolean {
  return format === 'pdf' || format === 'epub';
}

/** True when the export uses standard manuscript format: a novel, in Word or PDF, with the switch on. */
export function usesManuscript(request: Pick<ExportRequest, 'project' | 'format' | 'manuscript'>): boolean {
  return (
    request.manuscript !== undefined &&
    hasTemplate(request.project, 'novel') &&
    (request.format === 'docx' || request.format === 'pdf')
  );
}

export interface PreparedExport {
  format: ExportFormat;
  /** The file name without its extension. */
  name: string;
  doc: ExportDoc;
  manuscript: ManuscriptSetup | undefined;
  /** The writer's own fonts that the file would embed, by stored value. */
  ownFonts: string[];
  /** The unmarked and changed private names, for the check before a share-safe export. */
  names: NameCheck;
}

/** Builds the export tree and lists the own fonts that the file needs. */
export function prepareExport(request: ExportRequest): PreparedExport {
  // Only a Word file keeps tracked changes and comments (F45).
  const { review, ...rest } = request;
  const { doc, words, names } = safeExportTree(
    request.format === 'docx' && review ? { ...rest, review } : rest,
  );
  // The word count of standard manuscript format counts the writer's text, not the report page.
  const manuscript =
    usesManuscript(request) && request.manuscript ? { ...request.manuscript, words } : undefined;
  let ownFonts: string[] = [];
  if (embedsFonts(request.format)) {
    // Standard manuscript format sets every word in one font: the typewriter font or the project font.
    ownFonts = manuscript
      ? manuscript.typewriter
        ? []
        : ownFontsOf(doc).filter((v) => v === doc.font)
      : ownFontsOf(doc);
  }
  const name = exportFileName(request.text?.name ?? doc.title);
  return { format: request.format, name, doc, manuscript, ownFonts, names };
}

/** Sorts the own fonts by whether they may go in the file. Bytes are null for a font Vlo cannot read. */
export function checkFonts(
  prepared: PreparedExport,
  bytes: ReadonlyMap<string, Uint8Array | null>,
): FontCheck {
  return checkOwnFonts(prepared.ownFonts, bytes);
}

export interface MakeOptions {
  loadFile?: LoadFile;
}

/** Makes the file. `fonts` comes from `checkFonts`, after the writer agreed to any swap. */
export async function makeExport(
  prepared: PreparedExport,
  fonts: FontCheck = { own: new Map(), swaps: [] },
  options: MakeOptions = {},
): Promise<ExportFile> {
  const { doc, format, manuscript, name } = prepared;
  const loadFile = options.loadFile ?? appFile;
  const swaps = new Map(fonts.swaps.map((s) => [s.value, s.standIn]));
  const file = FORMAT_FILE[format];
  let bytes: Uint8Array;
  let drawnStyles: { font: string; style: 'bold' | 'italic' }[] = [];
  let text: string | undefined;
  if (format === 'docx') {
    const { toDocx } = await import('./docx');
    bytes = await toDocx(doc, manuscript ? { manuscript } : {});
  } else if (format === 'pdf') {
    const { toPdf } = await import('./pdf/pdf');
    const result = await toPdf(doc, {
      loadFile,
      own: fonts.own,
      swaps,
      ...(manuscript ? { manuscript } : {}),
    });
    bytes = result.bytes;
    drawnStyles = result.drawnStyles;
  } else if (format === 'epub') {
    const { toEpub } = await import('./epub');
    const result = await toEpub(doc, { loadFile, own: fonts.own, swaps });
    bytes = result.bytes;
    drawnStyles = result.drawnStyles;
  } else if (format === 'web') {
    const { toWebHtml, toWebText } = await import('./web');
    bytes = new TextEncoder().encode(toWebHtml(doc));
    text = toWebText(doc);
  } else {
    const { toMarkdown } = await import('./markdown');
    bytes = new TextEncoder().encode(toMarkdown(doc));
  }
  return {
    bytes,
    name: `${name}.${file.extension}`,
    type: file.type,
    notices: exportNotices(doc, format, {
      swaps: fonts.swaps,
      drawnStyles,
      ...(manuscript ? { manuscriptFont: manuscript.typewriter ? 'courier-prime' : doc.font } : {}),
    }),
    ...(text === undefined ? {} : { text }),
  };
}

/** One export in one call, for tests and scripts: the own fonts get the bytes given here. */
export async function runExport(
  request: ExportRequest,
  ownFontBytes: ReadonlyMap<string, Uint8Array | null> = new Map(),
  options: MakeOptions = {},
): Promise<ExportFile> {
  const prepared = prepareExport(request);
  return makeExport(prepared, checkFonts(prepared, ownFontBytes), options);
}

export type { FontSwap };
