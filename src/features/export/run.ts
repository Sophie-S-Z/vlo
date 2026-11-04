import type { Alias } from '@/lib/privacy';
import { shareSafe } from '@/lib/privacy';
import { buildExportDoc, exportFileName, type BuildInput } from './build';
import { exportNotices, type ExportFormat } from './notices';

/*
 * One export from start to end: the export tree, the share-safe aliases, then the file. The export worker
 * runs this, so a long book never stops the page. Each format's code loads only when the writer picks it.
 */

export interface ExportRequest extends Omit<BuildInput, 'updates'> {
  format: ExportFormat;
  /** Each item's Yjs update, by item id. */
  updates: [string, Uint8Array][];
  aliases: Alias[];
  shareSafe: boolean;
}

export interface ExportFile {
  bytes: Uint8Array;
  /** The file name with its extension. */
  name: string;
  type: string;
  notices: string[];
}

export const FORMAT_FILE: Readonly<Record<ExportFormat, { extension: string; type: string }>> = {
  docx: {
    extension: 'docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  markdown: { extension: 'md', type: 'text/markdown;charset=utf-8' },
};

export async function runExport(request: ExportRequest): Promise<ExportFile> {
  const built = buildExportDoc({ ...request, updates: new Map(request.updates) });
  const doc = shareSafe(built, request.aliases, request.shareSafe);
  const file = FORMAT_FILE[request.format];
  let bytes: Uint8Array;
  if (request.format === 'docx') {
    const { toDocx } = await import('./docx');
    bytes = await toDocx(doc);
  } else {
    const { toMarkdown } = await import('./markdown');
    bytes = new TextEncoder().encode(toMarkdown(doc));
  }
  return {
    bytes,
    name: `${exportFileName(doc.title)}.${file.extension}`,
    type: file.type,
    notices: exportNotices(doc, request.format),
  };
}
