import type { NoteContent } from '@/features/editor/format/notes';
import { textDirection } from '@/lib/language';
import {
  boxedItems,
  checkBox,
  footnotesOf,
  imageStandIn,
  repeatsTitle,
  tableParagraphs,
  type Block,
  type ExportDoc,
  type ImageBlock,
  type Run,
  type RunStyle,
} from './model';
import { tableHtml } from './htmlTable';
import { xmlText } from './xml';

/*
 * Web copies (roadmap F52, plan Task J2). A poem keeps each line break and each indent when the writer
 * pastes it into Substack, Medium, a blog or AO3. Web editors join runs of spaces and drop spaces at the
 * start of a line, so each space at a line start and each space after another space becomes U+00A0.
 *
 * The HTML uses only tags that AO3 keeps, with no style, class or span, so one HTML serves both targets:
 * the blog target puts it on the clipboard as rich text, and the AO3 target as text for AO3's HTML field.
 * The project title stays out, because each site has its own title field.
 *
 * The same code makes two files: a web page (.html) with the title and the images inside, and a plain
 * text file (.txt), whose poem lines keep their spaces as plain spaces.
 */

export type WebTarget = 'blog' | 'ao3';

/** How a platform's editor takes the HTML (Phase 17 Publish). The default suits a blog and AO3. */
export interface WebOptions {
  /**
   * The tag of a heading at each export level: 1 for a part, 2 for an item title, more for a heading in
   * the text. "strong" makes a bold paragraph, for an editor with no headings.
   */
  heading?: (level: number) => 'h2' | 'h3' | 'h4' | 'strong';
  /** Keeps center and right alignment. An editor that drops it gets plain paragraphs. */
  align?: boolean;
  /** The address of an image, or null for a line that names it. A paste takes no image, so a copy has none. */
  image?: (block: ImageBlock) => string | null;
}

const DEFAULT_OPTIONS: Required<WebOptions> = {
  // Each site's own title is the h1, so parts and chapters start at h2.
  heading: (level) => (level <= 1 ? 'h2' : level === 2 ? 'h3' : 'h4'),
  align: true,
  image: () => null,
};

const NBSP = '\u00a0';

/** A link that a site keeps: web and mail addresses only. */
function safeLink(url: string): string | null {
  return /^(https?:|mailto:)/i.test(url) ? url : null;
}

/** Keeps every space of a poem line: a space at the start or after a space becomes a no-break space. */
class Spaces {
  private lastWasSpace = true;

  keep(text: string): string {
    let out = '';
    for (const char of text) {
      const space = char === ' ';
      out += space && this.lastWasSpace ? NBSP : char;
      this.lastWasSpace = space || char === NBSP;
    }
    return out;
  }
}

function wrap(html: string, style: RunStyle): string {
  // Spaces stay outside the tags, so a site does not move them into the styled words.
  const lead = /^[\s\u00a0]*/.exec(html)?.[0] ?? '';
  const trail = /[\s\u00a0]*$/.exec(html.slice(lead.length))?.[0] ?? '';
  let out = html.slice(lead.length, html.length - trail.length);
  if (out === '') return html;
  if (style.superscript) out = `<sup>${out}</sup>`;
  if (style.subscript) out = `<sub>${out}</sub>`;
  if (style.underline) out = `<u>${out}</u>`;
  if (style.strike) out = `<s>${out}</s>`;
  if (style.italic) out = `<em>${out}</em>`;
  if (style.bold) out = `<strong>${out}</strong>`;
  const link = style.link ? safeLink(style.link) : null;
  if (link) out = `<a href="${xmlText(link)}">${out}</a>`;
  return lead + out + trail;
}

function inline(runs: readonly Run[], spaces: Spaces | null): string {
  let out = '';
  for (const run of runs) {
    if (run.type === 'text') out += wrap(xmlText(spaces ? spaces.keep(run.text) : run.text), run.style);
    else if (run.type === 'break') out += spaces ? ' ' : '<br>';
    else if (run.type === 'math') out += xmlText(`$${run.latex}$`);
    else out += `<sup>${String(run.number)}</sup>`;
  }
  return out;
}

function blockHtml(block: Block, options: Required<WebOptions>): string {
  const alignAttr = (align: string | undefined) =>
    options.align && (align === 'center' || align === 'right') ? ` align="${align}"` : '';
  const center = alignAttr('center');
  switch (block.type) {
    case 'paragraph':
      return `<p${alignAttr(block.align)}>${inline(block.runs, null)}</p>`;
    case 'heading': {
      const tag = options.heading(block.level);
      if (tag === 'strong')
        return `<p${alignAttr(block.align)}><strong>${inline(block.runs, null)}</strong></p>`;
      return `<${tag}${alignAttr(block.align)}>${inline(block.runs, null)}</${tag}>`;
    }
    case 'sceneBreak':
      return `<p${center}>*&#160;&#160;*&#160;&#160;*</p>`;
    // A web page has no pages, and AO3 keeps no style for a print break.
    case 'pageBreak':
      return '';
    case 'math':
      return `<p${center}>${xmlText(`$$${block.latex}$$`)}</p>`;
    case 'image': {
      const src = options.image(block);
      // A site takes no image from the clipboard, so the copy names the image where it stands.
      if (src === null) return `<p${center}><i>${xmlText(imageStandIn(block))}</i></p>`;
      const alt = block.decorative ? '' : block.alt;
      const caption = block.caption === '' ? '' : `<figcaption>${xmlText(block.caption)}</figcaption>`;
      return `<figure><img src="${src}" alt="${xmlText(alt)}" style="width:${String(block.width)}%">${caption}</figure>`;
    }
    case 'table':
      return tableHtml(block, (cell) => cell.paragraphs.map((b) => blockHtml(b, options)).join(''), false);
    case 'quote':
      return `<blockquote>${block.blocks.map((b) => blockHtml(b, options)).join('')}</blockquote>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const start = block.ordered && block.start !== 1 ? ` start="${String(block.start)}"` : '';
      // A checklist item starts with its box. AO3 keeps no style, so the bullet stays.
      const items = boxedItems(block)
        .map((item) => `<li>${item.map((b) => blockHtml(b, options)).join('')}</li>`)
        .join('');
      return `<${tag}${start}>${items}</${tag}>`;
    }
    case 'stanza':
      // One paragraph for each stanza, so a site keeps the space between stanzas.
      return `<p>${block.lines.map((line) => inline(line.runs, new Spaces())).join('<br>')}</p>`;
  }
}

function noteHtml(note: NoteContent): string {
  return note
    .map((run) => {
      const marks = new Set(run.marks?.map((m) => m.type));
      return wrap(xmlText(run.text), {
        ...(marks.has('bold') ? { bold: true } : {}),
        ...(marks.has('italic') ? { italic: true } : {}),
        ...(marks.has('underline') ? { underline: true } : {}),
        ...(marks.has('strike') ? { strike: true } : {}),
        ...(marks.has('superscript') ? { superscript: true } : {}),
        ...(marks.has('subscript') ? { subscript: true } : {}),
      });
    })
    .join('');
}

/** The HTML of a web copy: the blocks in reading order, then the notes as a numbered list. */
export function toWebHtml(doc: ExportDoc, options: WebOptions = {}): string {
  const full = { ...DEFAULT_OPTIONS, ...options };
  const parts: string[] = [];
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (block.type !== 'pageBreak' && !repeatsTitle(doc, section, block))
        parts.push(blockHtml(block, full));
    }
  }
  const notes = footnotesOf(doc);
  if (notes.length > 0) {
    parts.push('<hr>', `<ol>${notes.map((n) => `<li>${noteHtml(n.note)}</li>`).join('')}</ol>`);
  }
  return parts.join('\n');
}

/** The plain text of a block. With `nbsp`, each space that a web editor would drop is a no-break space. */
function blockText(block: Block, nbsp: boolean): string {
  const poemSpaces = () => (nbsp ? new Spaces() : null);
  const runs = (list: readonly Run[], spaces: Spaces | null) =>
    list
      .map((run) =>
        run.type === 'text'
          ? spaces
            ? spaces.keep(run.text)
            : run.text
          : run.type === 'break'
            ? spaces
              ? ' '
              : '\n'
            : run.type === 'math'
              ? `$${run.latex}$`
              : `[${String(run.number)}]`,
      )
      .join('');
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return runs(block.runs, null);
    case 'sceneBreak':
      return '*  *  *';
    case 'pageBreak':
      return '';
    case 'math':
      return `$$${block.latex}$$`;
    case 'image':
      return imageStandIn(block);
    case 'table':
      return tableParagraphs(block)
        .map((b) => blockText(b, nbsp))
        .join('\n');
    case 'quote':
      return block.blocks.map((b) => blockText(b, nbsp)).join('\n\n');
    case 'list':
      return block.items
        .map((item, i) => {
          const done = block.checked?.[i];
          const marker = block.ordered
            ? `${String(block.start + i)}.`
            : done === undefined
              ? '-'
              : checkBox(done);
          return `${marker} ${item.map((b) => blockText(b, nbsp)).join(' ')}`;
        })
        .join('\n');
    case 'stanza':
      return block.lines.map((line) => runs(line.runs, poemSpaces())).join('\n');
  }
}

/** The blocks and the notes as plain text, with a blank line between blocks. */
function textParts(doc: ExportDoc, nbsp: boolean): string[] {
  const parts: string[] = [];
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (block.type !== 'pageBreak' && !repeatsTitle(doc, section, block))
        parts.push(blockText(block, nbsp));
    }
  }
  const notes = footnotesOf(doc);
  if (notes.length > 0) {
    parts.push(
      notes.map((n) => `[${String(n.number)}] ${n.note.map((run) => run.text).join('')}`).join('\n'),
    );
  }
  return parts;
}

/** The plain text that goes on the clipboard beside the HTML, for an app that takes no rich text. */
export function toWebText(doc: ExportDoc): string {
  return textParts(doc, true).join('\n\n');
}

/** A plain text file: the title, the author, the text and the notes. Any app opens it. */
export function toPlainText(doc: ExportDoc): string {
  return `${[doc.title, ...(doc.author ? [doc.author] : []), ...textParts(doc, false)].join('\n\n')}\n`;
}

/** The bytes as base64, for a data address. */
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const PAGE_STYLE =
  'body{max-width:40em;margin:3em auto;padding:0 1em;font-family:Georgia,serif;line-height:1.6}h1,h2,h3,h4{line-height:1.25}figure{margin:2em 0;text-align:center}img{max-width:100%;height:auto}figcaption{font-style:italic}';

/** A web page that opens in any browser, with the title, the author and each image that is on this device. */
export function toHtmlFile(doc: ExportDoc): string {
  const body = toWebHtml(doc, {
    image: (block) => {
      const image = doc.images?.[block.id];
      return image ? `data:${image.type};base64,${base64(image.data)}` : null;
    },
  });
  const author = doc.author ? `\n<p>${xmlText(doc.author)}</p>` : '';
  return `<!doctype html>
<html lang="${xmlText(doc.language)}" dir="${textDirection(doc.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${xmlText(doc.title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<header>
<h1>${xmlText(doc.title)}</h1>${author}
</header>
${body}
</body>
</html>
`;
}
