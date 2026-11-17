import type { ScriptRole } from '@/features/editor/scriptRoles';
import { escapeHtml } from './outline';
import { ImportError, type ImportNode } from './tree';

/*
 * Final Draft scripts (.fdx, roadmap 2 F63). Each Paragraph of the Content has an element as its Type,
 * and each scene heading starts a scene, as in a Fountain file. Bold, italic and underline stay. The
 * title page, the revisions and the page layout stay out.
 */

const ROLES: Readonly<Record<string, ScriptRole>> = {
  'scene heading': 'heading',
  shot: 'heading',
  action: 'action',
  general: 'action',
  character: 'character',
  parenthetical: 'parenthetical',
  dialogue: 'dialogue',
  transition: 'transition',
  lyrics: 'lyric',
};

interface Line {
  role: ScriptRole;
  html: string;
  text: string;
}

function lineOf(paragraph: Element): Line {
  let html = '';
  let text = '';
  for (const part of Array.from(paragraph.children)) {
    if (part.tagName !== 'Text') continue;
    const words = part.textContent;
    const style = (part.getAttribute('Style') ?? '').split('+');
    let out = escapeHtml(words);
    if (style.includes('Underline')) out = `<u>${out}</u>`;
    if (style.includes('Italic')) out = `<em>${out}</em>`;
    if (style.includes('Bold')) out = `<strong>${out}</strong>`;
    html += out;
    text += words;
  }
  return { role: ROLES[(paragraph.getAttribute('Type') ?? '').toLowerCase()] ?? 'action', html, text };
}

export function readFdx(source: string): ImportNode[] {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const content = doc.getElementsByTagName('Content')[0];
  if (doc.getElementsByTagName('parsererror').length > 0 || !content)
    throw new ImportError('This file is not a Final Draft script. Save it as .fdx, then import it.');
  const scenes: { title: string; lines: Line[] }[] = [];
  for (const paragraph of Array.from(content.children)) {
    if (paragraph.tagName !== 'Paragraph') continue;
    const line = lineOf(paragraph);
    if (line.text.trim() === '') continue;
    const last = scenes.at(-1);
    if (!last || line.role === 'heading')
      scenes.push({ title: line.role === 'heading' ? line.text.trim() : 'Opening', lines: [line] });
    else last.lines.push(line);
  }
  if (scenes.length === 0) throw new ImportError('This Final Draft file has no script in it.');
  return scenes.map(({ title, lines }) => ({
    title,
    text: {
      html: lines.map((l) => `<p data-role="${l.role}">${l.html}</p>`).join(''),
      poem: `${lines.map((l) => l.text).join('\n')}\n`,
    },
  }));
}
