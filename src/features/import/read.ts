import JSZip from 'jszip';
import { readDocx } from './docx';
import { readFountain } from './fountain';
import { readMarkdown, readPlainText } from './markdown';
import { titleOfFile, titleOfName } from './outline';
import { readScrivener, type FileMap } from './scrivener';
import { ImportError, type ImportNode, type ImportSource } from './tree';

/*
 * Turns the files that the writer picked into one `ImportSource` (roadmap F34): a .scriv folder or its
 * zip, or Word, Markdown, Fountain and text files, alone, in a folder or in a zip. Folders become folders, in the
 * order of their names. Hidden folders, such as Obsidian's .obsidian, stay out.
 */

export interface PickedFile {
  /** The path inside the picked folder, or the file name. */
  path: string;
  read: () => Promise<Uint8Array>;
}

/**
 * The text of a Markdown or text file: UTF-16 when it starts with a byte order mark, else UTF-8. A file
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

/** The nodes of one file, or null for a kind of file that Vlo does not read. */
async function fileNodes(file: PickedFile, skipped: string[]): Promise<ImportNode[] | null> {
  const name = file.path.slice(file.path.lastIndexOf('/') + 1);
  if (/\.docx$/i.test(name)) {
    const docx = await readDocx(name, await file.read());
    skipped.push(...docx.skipped);
    return docx.nodes;
  }
  if (/\.(md|markdown)$/i.test(name)) return readMarkdown(name, decodeText(await file.read()));
  if (/\.txt$/i.test(name)) return [readPlainText(name, decodeText(await file.read()))];
  if (FOUNTAIN.test(name)) return readFountain(name, decodeText(await file.read())).nodes;
  return null;
}

export async function readPicked(picked: readonly PickedFile[]): Promise<ImportSource> {
  const [first] = picked;
  if (!first) throw new ImportError('Pick a file or a folder to import.');
  let files = picked.filter((f) => !hidden(f.path));
  const [zip] = files;
  if (files.length === 1 && zip && /\.zip$/i.test(zip.path))
    files = (await unzip(zip)).filter((f) => !hidden(f.path));

  // One Fountain file keeps the title and the author of its title page.
  const [only] = files;
  if (files.length === 1 && only && FOUNTAIN.test(only.path)) {
    const { title, author, nodes } = readFountain(only.path, decodeText(await only.read()));
    if (nodes.length === 0) throw new ImportError('This Fountain file has no script in it.');
    return { title, ...(author ? { author } : {}), nodes, skipped: [] };
  }

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
  let other = 0;
  const sorted = [...files].sort((a, b) => byName.compare(a.path, b.path));
  for (const file of sorted) {
    const path = file.path.split('/').slice(top === '' ? 0 : 1);
    const nodes = await fileNodes(file, skipped);
    if (nodes === null) {
      other += 1;
      continue;
    }
    // A file that splits into several items is a folder of its own when it sits beside other files.
    const node: ImportNode[] =
      nodes.length > 1 && sorted.length > 1
        ? [{ title: titleOfFile(path.at(-1) ?? ''), children: nodes }]
        : nodes;
    folderOf(path.slice(0, -1)).children?.push(...node);
  }
  if (other > 0) skipped.push(other === 1 ? '1 other file' : `${String(other)} other files`);
  const nodes = root.children ?? [];
  if (nodes.length === 0)
    throw new ImportError('Vlo found no Word, Markdown, Fountain or text file to import.');
  const title =
    top !== '' ? titleOfName(top) : picked.length === 1 ? titleOfFile(first.path) : 'Imported writing';
  return { title, nodes, skipped };
}
