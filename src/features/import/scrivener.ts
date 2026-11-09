import { readRtf } from './rtf';
import { ImportError, type ImportNode } from './tree';

/*
 * Scrivener projects (roadmap F34): a .scriv folder, or a zip of one. The .scrivx file lists the binder.
 * Scrivener 3 keeps each text in Files/Data/<UUID>/content.rtf with synopsis.txt beside it. Scrivener 2
 * keeps Files/Docs/<ID>.rtf and <ID>_synopsis.txt. The Draft becomes the binder, and every other top
 * folder, such as Research, becomes notes. The Trash stays out.
 */

/** The files of a folder or a zip, by their path inside it. */
export type FileMap = ReadonlyMap<string, () => Promise<Uint8Array>>;

const utf8 = new TextDecoder();

export async function readScrivener(
  files: FileMap,
): Promise<{ title: string; nodes: ImportNode[]; skipped: string[] }> {
  const scrivx = [...files.keys()].find((path) => /\.scrivx$/i.test(path));
  if (!scrivx) throw new ImportError('This folder has no Scrivener project in it. Pick the .scriv folder.');
  const base = scrivx.slice(0, scrivx.lastIndexOf('/') + 1);
  const xml = new DOMParser().parseFromString(utf8.decode(await files.get(scrivx)?.()), 'application/xml');
  const binder = xml.getElementsByTagName('Binder')[0];
  if (!binder || xml.getElementsByTagName('parsererror').length > 0)
    throw new ImportError('The Scrivener project file is damaged.');

  const read = async (path: string): Promise<string | null> => {
    const file = files.get(base + path);
    return file ? utf8.decode(await file()) : null;
  };
  const left = { pictures: false, layout: false, other: 0 };

  const node = async (item: Element, note: boolean): Promise<ImportNode | null> => {
    const type = item.getAttribute('Type') ?? '';
    const id = item.getAttribute('UUID') ?? item.getAttribute('ID') ?? '';
    const own = (tag: string) => Array.from(item.children).find((c) => c.tagName === tag);
    const title = (own('Title')?.textContent ?? '').trim() || 'Untitled';
    const rtf = (await read(`Files/Data/${id}/content.rtf`)) ?? (await read(`Files/Docs/${id}.rtf`));
    const synopsis = (
      (await read(`Files/Data/${id}/synopsis.txt`)) ?? (await read(`Files/Docs/${id}_synopsis.txt`))
    )?.trim();
    const children: ImportNode[] = [];
    for (const kid of Array.from(own('Children')?.children ?? []))
      if (kid.tagName === 'BinderItem') {
        const child = await node(kid, note);
        if (child) children.push(child);
      }
    if (
      !['Text', 'Folder', 'DraftFolder', 'ResearchFolder'].includes(type) &&
      !rtf &&
      children.length === 0
    ) {
      left.other += 1;
      return null;
    }
    const text = rtf ? readRtf(rtf) : null;
    if (text) {
      left.pictures ||= text.skipped.some((s) => s.includes('picture'));
      left.layout ||= text.skipped.includes('table layout');
    }
    return {
      title,
      ...(synopsis ? { synopsis } : {}),
      ...(text && text.text.trim() !== '' ? { text: { html: text.html, poem: text.text } } : {}),
      ...(children.length > 0 || type.endsWith('Folder') ? { children } : {}),
      ...(note ? { note: true as const } : {}),
    };
  };

  const nodes: ImportNode[] = [];
  for (const top of Array.from(binder.children)) {
    if (top.tagName !== 'BinderItem' || top.getAttribute('Type') === 'TrashFolder') continue;
    const draft = top.getAttribute('Type') === 'DraftFolder';
    const placed = await node(top, !draft);
    if (!placed) continue;
    // The Draft's own children are the top of the binder.
    if (draft) nodes.unshift(...(placed.children ?? []));
    else nodes.push(placed);
  }
  const name = scrivx.slice(base.length).replace(/\.scrivx$/i, '');
  return {
    title: name || 'Scrivener project',
    nodes,
    skipped: [
      ...(left.pictures ? ['pictures'] : []),
      ...(left.layout ? ['table layout'] : []),
      ...(left.other > 0 ? [`${String(left.other)} PDF, image or web files`] : []),
    ],
  };
}
