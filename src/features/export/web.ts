import type { NoteContent } from '@/features/editor/format/notes';
import {
  footnotesOf,
  imageStandIn,
  repeatsTitle,
  type Block,
  type ExportDoc,
  type Run,
  type RunStyle,
} from './model';

/*
 * Web copies (roadmap F52, plan Task J2). A poem keeps each line break and each indent when the writer
 * pastes it into Substack, Medium, a blog or AO3. Web editors join runs of spaces and drop spaces at the
 * start of a line, so each space at a line start and each space after another space becomes U+00A0.
 *
 * The HTML uses only tags that AO3 keeps, with no style, class or span, so one HTML serves both targets:
 * the blog target puts it on the clipboard as rich text, and the AO3 target as text for AO3's HTML field.
 * The project title stays out, because each site has its own title field.
 */

export type WebTarget = 'blog' | 'ao3';

const NBSP = '\u00a0';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
  if (link) out = `<a href="${escapeHtml(link)}">${out}</a>`;
  return lead + out + trail;
}

function inline(runs: readonly Run[], spaces: Spaces | null): string {
  let out = '';
  for (const run of runs) {
    if (run.type === 'text') out += wrap(escapeHtml(spaces ? spaces.keep(run.text) : run.text), run.style);
    else if (run.type === 'break') out += spaces ? ' ' : '<br>';
    else if (run.type === 'math') out += escapeHtml(`$${run.latex}$`);
    else out += `<sup>${String(run.number)}</sup>`;
  }
  return out;
}

function alignAttr(align: string | undefined): string {
  return align === 'center' || align === 'right' ? ` align="${align}"` : '';
}

function blockHtml(block: Block): string {
  switch (block.type) {
    case 'paragraph':
      return `<p${alignAttr(block.align)}>${inline(block.runs, null)}</p>`;
    case 'heading': {
      // Each site's own title is the h1, so parts and chapters start at h2.
      const level = Math.min(block.level + 1, 4);
      return `<h${String(level)}${alignAttr(block.align)}>${inline(block.runs, null)}</h${String(level)}>`;
    }
    case 'sceneBreak':
      return '<p align="center">*&#160;&#160;*&#160;&#160;*</p>';
    case 'math':
      return `<p align="center">${escapeHtml(`$$${block.latex}$$`)}</p>`;
    // A site takes no image from the clipboard, so the copy names the image where it stands.
    case 'image':
      return `<p align="center"><i>${escapeHtml(imageStandIn(block))}</i></p>`;
    case 'quote':
      return `<blockquote>${block.blocks.map(blockHtml).join('')}</blockquote>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const start = block.ordered && block.start !== 1 ? ` start="${String(block.start)}"` : '';
      const items = block.items.map((item) => `<li>${item.map(blockHtml).join('')}</li>`).join('');
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
      return wrap(escapeHtml(run.text), {
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
export function toWebHtml(doc: ExportDoc): string {
  const parts: string[] = [];
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (!repeatsTitle(doc, section, block)) parts.push(blockHtml(block));
    }
  }
  const notes = footnotesOf(doc);
  if (notes.length > 0) {
    parts.push('<hr>', `<ol>${notes.map((n) => `<li>${noteHtml(n.note)}</li>`).join('')}</ol>`);
  }
  return parts.join('\n');
}

function blockText(block: Block): string {
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
    case 'math':
      return `$$${block.latex}$$`;
    case 'image':
      return imageStandIn(block);
    case 'quote':
      return block.blocks.map(blockText).join('\n\n');
    case 'list':
      return block.items
        .map(
          (item, i) =>
            `${block.ordered ? `${String(block.start + i)}.` : '-'} ${item.map(blockText).join(' ')}`,
        )
        .join('\n');
    case 'stanza':
      return block.lines.map((line) => runs(line.runs, new Spaces())).join('\n');
  }
}

/** The plain text that goes on the clipboard beside the HTML, for an app that takes no rich text. */
export function toWebText(doc: ExportDoc): string {
  const parts: string[] = [];
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (!repeatsTitle(doc, section, block)) parts.push(blockText(block));
    }
  }
  const notes = footnotesOf(doc);
  if (notes.length > 0) {
    parts.push(
      notes.map((n) => `[${String(n.number)}] ${n.note.map((run) => run.text).join('')}`).join('\n'),
    );
  }
  return parts.join('\n\n');
}
