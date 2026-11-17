import JSZip from 'jszip';
import { readDocx } from './docx';
import { readEpub } from './epub';
import { readFdx } from './fdx';
import { readFountain } from './fountain';
import { readHtml } from './html';
import { readMarkdown, readPlainText } from './markdown';
import { readOdt } from './odt';
import { outline, titleOfFile, titleOfName } from './outline';
import { readRtf } from './rtf';
import { readScrivener, type FileMap } from './scrivener';
import { ImportError, type ImportNode, type ImportSource } from './tree';

/*
 * Turns the files that the writer picked into one `ImportSource` (roadmap F34): a .scriv folder or its
 * zip, or Word, PDF, OpenDocument, RTF, EPUB, web page, Markdown, text, Fountain and Final Draft files,
 * alone, in a folder or in a zip. A PDF reader of its own loads only for a PDF. Folders become folders, in the
 * order of their names. Hidden folders, such as Obsidian's .obsidian, stay out.
 */

export interface PickedFile {
  /** The path inside the picked folder, or the file name. */
  path: string;
  read: () => Promise<Uint8Array>;
}

/**
 * The text of a text file, such as Markdown, RTF or a web page: UTF-16 when it starts with a byte order mark, else UTF-8. A file
 * that is not UTF-8 is most often from an older Windows editor, so it is read as Windows-1252.
 */
function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
const FOUNTAIN = /\.(fountain|spmd)$/i;

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function hidden(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.') || part === '__MACOSX');
}

async function unzip(file: PickedFile): Promise<PickedFile[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.read());
  } catch {
    throw new ImportError('Vlo cannot open this zip file. Pick the file again.');
  }
  // A Vlo backup holds project.json and the Yjs file of each item.
  if (zip.file('project.json') && zip.file(/^items\/[^/]+\.yjs$/).length > 0)
    throw new ImportError('This is a Vlo backup. Choose Import backup for it.');
  return Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => ({ path: entry.name, read: () => entry.async('uint8array') }));
}

/** What one file holds. A title or an author is what the file itself names. */
interface FileRead {
  nodes: ImportNode[];
  title?: string;
  author?: string;
}

/** The nodes of one file, or null for a kind of file that Vlo does not read. */
async function readFile(file: PickedFile, skipped: string[]): Promise<FileRead | null> {
  const name = file.path.slice(file.path.lastIndexOf('/') + 1);
  const text = async () => decodeText(await file.read());
  const withSkipped = <T extends { skipped: string[] }>({ skipped: left, ...rest }: T) => {
    skipped.push(...left);
    return rest;
  };
  if (/\.docx$/i.test(name)) return withSkipped(await readDocx(name, await file.read()));
  if (/\.odt$/i.test(name)) return withSkipped(await readOdt(name, await file.read()));
  if (/\.rtf$/i.test(name)) {
    const rtf = readRtf(await text());
    skipped.push(...rtf.skipped);
    return { nodes: outline(titleOfFile(name), rtf.html, '\n') };
  }
  if (/\.pdf$/i.test(name)) {
    const { readPdf } = await import('./pdf');
    return withSkipped(await readPdf(name, await file.read()));
  }
  if (/\.epub$/i.test(name)) return withSkipped(await readEpub(name, await file.read()));
  if (/\.(html?|xhtml)$/i.test(name)) return withSkipped(readHtml(name, await text()));
  if (/\.(md|markdown)$/i.test(name)) return { nodes: readMarkdown(name, await text()) };
  if (/\.txt$/i.test(name)) return { nodes: [readPlainText(name, await text())] };
  if (/\.fdx$/i.test(name)) return { nodes: readFdx(await text()) };
  if (FOUNTAIN.test(name)) return readFountain(name, await text());
  return null;
}

export async function readPicked(picked: readonly PickedFile[]): Promise<ImportSource> {
  const [first] = picked;
  if (!first) throw new ImportError('Pick a file or a folder to import.');
  let files = picked.filter((f) => !hidden(f.path));
  const [zip] = files;
  if (files.length === 1 && zip && /\.zip$/i.test(zip.path))
    files = (await unzip(zip)).filter((f) => !hidden(f.path));

  if (files.some((f) => /\.scrivx$/i.test(f.path))) {
    const map: FileMap = new Map(files.map((f) => [f.path, f.read]));
    return readScrivener(map);
  }

  // The folder that holds every file names the project. Loose files go in as they are.
  const parts = files.map((f) => f.path.split('/'));
  const top = parts.every((p) => p.length > 1 && p[0] === parts[0]?.[0]) ? (parts[0]?.[0] ?? '') : '';
  const root: ImportNode = { title: '', children: [] };
  const folders = new Map<string, ImportNode>([['', root]]);
  const folderOf = (path: string[]): ImportNode => {
    const key = path.join('/');
    let folder = folders.get(key);
    if (!folder) {
      folder = { title: titleOfName(path.at(-1) ?? ''), children: [] };
      folderOf(path.slice(0, -1)).children?.push(folder);
      folders.set(key, folder);
    }
    return folder;
  };

  const skipped: string[] = [];
  const reads: FileRead[] = [];
  let other = 0;
  const sorted = [...files].sort((a, b) => byName.compare(a.path, b.path));
  for (const file of sorted) {
    const path = file.path.split('/').slice(top === '' ? 0 : 1);
    const read = await readFile(file, skipped);
    if (read === null) {
      other += 1;
      continue;
    }
    reads.push(read);
    const { nodes } = read;
    // A file that splits into several items is a folder of its own when it sits beside other files.
    const node: ImportNode[] =
      nodes.length > 1 && sorted.length > 1
        ? [{ title: titleOfFile(path.at(-1) ?? ''), children: nodes }]
        : nodes;
    folderOf(path.slice(0, -1)).children?.push(...node);
  }
  if (other > 0) skipped.push(other === 1 ? '1 other file' : `${String(other)} other files`);
  const nodes = root.children ?? [];
  if (reads.length === 0)
    throw new ImportError(
      'Vlo found no file that it can import. Vlo reads Word, PDF, OpenDocument, RTF, EPUB, web page, Markdown, text, Fountain and Final Draft files.',
    );
  if (nodes.length === 0) throw new ImportError('Vlo found no text in these files.');
  // One file keeps the title and the author that it names, such as an EPUB's or a Fountain title page's.
  const [named] = reads.length === 1 ? reads : [];
  const title =
    named?.title ??
    (top !== '' ? titleOfName(top) : picked.length === 1 ? titleOfFile(first.path) : 'Imported writing');
  return { title, ...(named?.author ? { author: named.author } : {}), nodes, skipped };
}
