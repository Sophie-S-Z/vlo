import { toMarkdownBody } from '@/features/export/markdown';
import type { ExportDoc } from '@/features/export/model';
import { toWebHtml, toWebText } from '@/features/export/web';
import type { Platform } from './platforms';

/*
 * The body of a post for one platform (Phase 17 Publish). The export worker makes it from the prepared
 * export tree, so a long piece never stops the page. The title and the subtitle stay out: the writer can
 * change them in the dialog, and the dialog puts them where the platform wants them.
 */

export interface PostBody {
  /** The rich text, for a "rich" platform, or the HTML itself for an "html" platform. */
  html: string;
  /** The plain text beside the rich text, for an app that takes no rich text. */
  text: string;
  /** The Markdown, for a "markdown" platform. */
  markdown: string;
}

export function postBody(doc: ExportDoc, platform: Platform): PostBody {
  if (platform.body === 'markdown')
    return { html: '', text: '', markdown: toMarkdownBody(doc, platform.notes ?? 'list') };
  return { html: toWebHtml(doc, platform.web), text: toWebText(doc), markdown: '' };
}

/** What goes on the clipboard for the body, with the title first where the platform reads it from the body. */
export function bodyCopy(platform: Platform, body: PostBody, title: string): { text: string; html?: string } {
  if (platform.body === 'markdown') {
    const heading = title.trim() === '' ? '' : `# ${title.trim()}\n\n`;
    return { text: platform.titleInBody ? heading + body.markdown : body.markdown };
  }
  if (platform.body === 'html') return { text: body.html };
  return { text: body.text, html: body.html };
}

/** The characters that the platform counts: the text that it shows, or the HTML or Markdown that it stores. */
export function bodyLength(platform: Platform, body: PostBody): number {
  const text =
    platform.body === 'markdown' ? body.markdown : platform.body === 'html' ? body.html : body.text;
  // The platforms count code points, as Array.from does.
  return Array.from(text).length;
}

/** Each limit that the copy goes over, as a sentence. */
export function overLimits(platform: Platform, body: PostBody, title: string): string[] {
  const out: string[] = [];
  const titleLength = Array.from(title.trim()).length;
  const bodyChars = bodyLength(platform, body);
  const n = (value: number) => value.toLocaleString('en-US');
  if (platform.limits?.title !== undefined && titleLength > platform.limits.title)
    out.push(
      `${platform.name} takes a title of at most ${n(platform.limits.title)} characters. This title has ${n(titleLength)}.`,
    );
  if (platform.limits?.body !== undefined && bodyChars > platform.limits.body)
    out.push(
      `${platform.name} takes at most ${n(platform.limits.body)} characters in one post. This copy has ${n(bodyChars)}, so post it in parts.`,
    );
  return out;
}
