import JSZip from 'jszip';
import { cleanLanguage, DEFAULT_LANGUAGE, textDirection } from '@/lib/language';
import MarkdownIt from 'markdown-it';
import { flattenTree } from '@/features/binder/tree';
import { DEFAULT_FONT } from '@/features/editor/format/fonts';
import { projectDef } from '@/features/library/templates';
import type { Backup } from '@/features/backup/file';
import { exportFileName } from './build';
import { toMarkdown } from './markdown';
import type { Block, ExportDoc, ExportSection, HeadingBlock } from './model';
import { itemBlocks, noteCounter, updateToJson } from './read';

/*
 * The walkaway export (roadmap F33): all the writing in one zip that needs no Vlo to read. Each project
 * has a folder, each item a Markdown file in binder order, and each folder of the binder a folder in the
 * zip. Notes come too, because the zip is the writer's own copy. Each project's index.html shows the
 * whole project in any browser, with no script and no other file. The research files go in a Research
 * folder, and each clipping is a text file with its link.
 */

const STYLE =
  'body{max-width:40rem;margin:2rem auto;padding:0 1rem;font:1.125rem/1.6 Georgia,serif;color:#1f1d1a;background:#fffdf8}' +
  'h1,h2,h3,h4{line-height:1.25}a{color:#7a3b12}hr{border:0;text-align:center}hr::after{content:"* * *"}';

// Markdown export escapes the writer's text, so only the tags it writes itself, such as <u>, are HTML.
const markdown = new MarkdownIt({ html: true });
const escape = markdown.utils.escapeHtml;

function page(title: string, body: string, language = DEFAULT_LANGUAGE): string {
  return `<!doctype html>
<html lang="${escape(language)}" dir="${textDirection(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function heading(level: HeadingBlock['level'], text: string): Block {
  return { type: 'heading', level, runs: [{ type: 'text', text, style: {} }] };
}

/** Each binder row of a project with its path in the zip, its text blocks and its depth. */
function rows(backup: Backup): { path: string; depth: number; title: string; body: Block[] | null }[] {
  const def = projectDef(backup.project);
  const notes = noteCounter();
  const nodes = flattenTree(backup.items);
  const siblings = new Map<string | null, number>();
  for (const node of nodes) siblings.set(node.parentId, (siblings.get(node.parentId) ?? 0) + 1);
  const folderPath = new Map<string | null, string>([[null, '']]);
  const seen = new Map<string | null, number>();
  return nodes.map(({ item, depth, parentId }) => {
    const n = (seen.get(parentId) ?? 0) + 1;
    seen.set(parentId, n);
    const width = Math.max(2, String(siblings.get(parentId) ?? 0).length);
    const name = `${String(n).padStart(width, '0')} ${exportFileName(item.title)}`;
    const parent = folderPath.get(parentId) ?? '';
    folderPath.set(item.id, `${parent}${name}/`);
    const form = def.editorKind(item.kind);
    if (form === null) return { path: `${parent}${name}/`, depth, title: item.title, body: null };
    const update = backup.updates.get(item.id);
    const body = update ? itemBlocks(updateToJson(update), form, notes) : [];
    return { path: `${parent}${name}.md`, depth, title: item.title, body };
  });
}

/** The research files of a project, each with a name that no other file in the folder has. */
function researchFiles(zip: JSZip, backup: Backup): void {
  const used = new Set<string>();
  for (const { info, data } of backup.research) {
    const name = exportFileName(info.name);
    const dot = name.lastIndexOf('.');
    const [stem, ext] =
      info.clip || dot <= 0 ? [name, info.clip ? '.txt' : ''] : [name.slice(0, dot), name.slice(dot)];
    let file = `${stem}${ext}`;
    for (let n = 2; used.has(file.toLowerCase()); n += 1) file = `${stem} (${String(n)})${ext}`;
    used.add(file.toLowerCase());
    if (info.clip) {
      const link = info.clip.url ? `\n\nLink: ${info.clip.url}\n` : '\n';
      zip.file(`Research/${file}`, `${info.clip.text}${link}`);
    } else if (data) zip.file(`Research/${file}`, data, { compression: 'STORE' });
  }
}

function projectFiles(zip: JSZip, backup: Backup): void {
  const base = {
    font: backup.project.settings.font ?? DEFAULT_FONT,
    paper: 'letter' as const,
    language: cleanLanguage(backup.project.settings.language) ?? DEFAULT_LANGUAGE,
    ...(backup.project.authorName ? { author: backup.project.authorName } : {}),
  };
  const sections: ExportSection[] = [];
  for (const row of rows(backup)) {
    const level = Math.min(row.depth + 2, 4) as HeadingBlock['level'];
    sections.push({ id: row.path, title: row.title, form: null, blocks: [heading(level, row.title)] });
    if (row.body === null) continue;
    sections.push({ id: `${row.path}#text`, title: row.title, form: 'prose', blocks: row.body });
    const doc: ExportDoc = {
      ...base,
      title: row.title,
      sections: [{ id: row.path, title: row.title, form: 'prose', blocks: row.body }],
    };
    zip.file(row.path, toMarkdown(doc));
  }
  const whole: ExportDoc = { ...base, title: backup.project.title, sections };
  zip.file('index.html', page(backup.project.title, markdown.render(toMarkdown(whole)), base.language));
  researchFiles(zip, backup);
}

/** The zip of every project given, with a top index.html that links each project's page. */
export async function walkawayZip(backups: readonly Backup[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const used = new Set<string>();
  const links: string[] = [];
  for (const backup of backups) {
    const title = exportFileName(backup.project.title);
    let folder = title;
    for (let n = 2; used.has(folder); n += 1) folder = `${title} (${String(n)})`;
    used.add(folder);
    const target = zip.folder(folder);
    if (target) projectFiles(target, backup);
    links.push(
      `<li><a href="${encodeURIComponent(folder)}/index.html">${escape(backup.project.title)}</a></li>`,
    );
  }
  zip.file('index.html', page('My writing', `<h1>My writing</h1>\n<ul>\n${links.join('\n')}\n</ul>`));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
