import JSZip from 'jszip';
import { htmlBlocks, htmlNodes, skippedList, type HtmlBlock, type Skipped } from './html';
import { titleOfFile } from './outline';
import { ImportError, type ImportNode } from './tree';

/*
 * EPUB e-books (roadmap F34). META-INF/container.xml names the package file, and its spine gives the
 * chapters in reading order. The book's title and author come from its metadata. The chapters go through
 * the web page reader as one text, so the headings split the book into folders and items. DRM books
 * cannot be read.
 */

const NOT_EPUB = 'Vlo cannot open this EPUB file. Check that it is a whole .epub file with no DRM.';

function xml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new ImportError(NOT_EPUB);
  return doc;
}

const byName = (doc: Document | Element, name: string) => Array.from(doc.getElementsByTagNameNS('*', name));

/** A path inside the zip, from a link that is relative to the file at `from`. */
function resolve(from: string, href: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const part of decodeURIComponent(href.split('#')[0] ?? '').split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

export async function readEpub(
  name: string,
  bytes: Uint8Array,
): Promise<{ title: string; author?: string; nodes: ImportNode[]; skipped: string[] }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ImportError(NOT_EPUB);
  }
  const read = async (path: string) => {
    const text = await zip.file(path)?.async('string');
    if (text === undefined) throw new ImportError(NOT_EPUB);
    return text;
  };
  // An e-book may hide its fonts, which is no problem. Hidden chapters are DRM.
  const encryption = await zip.file('META-INF/encryption.xml')?.async('string');
  if (encryption !== undefined && /URI="[^"]*\.x?html?"/i.test(encryption))
    throw new ImportError('This EPUB has DRM, so Vlo cannot read it. Import a copy without DRM.');
  const container = xml(await read('META-INF/container.xml'));
  const opfPath = byName(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw new ImportError(NOT_EPUB);
  const opf = xml(await read(opfPath));

  const meta = (tag: string) => byName(opf, tag)[0]?.textContent.trim() ?? '';
  const title = meta('title') || titleOfFile(name);
  const author = meta('creator');
  const manifest = new Map(
    byName(opf, 'item').map((item) => [
      item.getAttribute('id') ?? '',
      { href: item.getAttribute('href') ?? '', nav: /\bnav\b/.test(item.getAttribute('properties') ?? '') },
    ]),
  );

  const skipped: Skipped = new Map();
  const blocks: HtmlBlock[] = [];
  for (const ref of byName(opf, 'itemref')) {
    const item = manifest.get(ref.getAttribute('idref') ?? '');
    if (!item || item.nav || ref.getAttribute('linear') === 'no') continue;
    const page = new DOMParser().parseFromString(await read(resolve(opfPath, item.href)), 'text/html');
    blocks.push(...htmlBlocks(page.body, skipped));
  }
  const nodes = htmlNodes(title, blocks);
  if (nodes.length === 0) throw new ImportError('This EPUB has no text in it.');
  return { title, ...(author ? { author } : {}), nodes, skipped: skippedList(skipped) };
}
