import type { JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { nodeText } from './leafText';

/*
 * The one place that maps between poem documents and plain text. Exporters reuse it (Phase 2).
 * Plain text keeps every space. A blank line separates stanzas. A hanging indent is layout, so plain
 * text cannot carry it: parsed lines start with `hanging: 0`.
 */

export interface PoemLineData {
  text: string;
  /** Hanging indent in em: wrapped parts of the line sit this far right of its first part. */
  hanging: number;
}

/** Stanzas of lines. */
export type PoemData = PoemLineData[][];

export function parsePoemText(text: string): PoemData {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n');
  const poem: PoemData = [];
  let stanza: PoemLineData[] = [];
  for (const line of lines) {
    if (line === '') {
      if (stanza.length > 0) poem.push(stanza);
      stanza = [];
    } else {
      stanza.push({ text: line, hanging: 0 });
    }
  }
  if (stanza.length > 0) poem.push(stanza);
  return poem;
}

/** Lines end with a line feed. Stanzas are separated by one blank line. */
export function poemDataToText(poem: PoemData): string {
  if (poem.length === 0) return '';
  return `${poem.map((stanza) => stanza.map((line) => line.text).join('\n')).join('\n\n')}\n`;
}

/** Reads a poem editor document (doc > stanza > poemLine). An equation reads as its LaTeX between $ signs. */
export function poemDataFromDoc(doc: ProseMirrorNode): PoemData {
  const poem: PoemData = [];
  doc.forEach((stanza) => {
    const lines: PoemLineData[] = [];
    stanza.forEach((line) => {
      lines.push({ text: nodeText(line), hanging: Number(line.attrs.hanging) || 0 });
    });
    poem.push(lines);
  });
  return poem;
}

/** The TipTap JSON for a poem, for loading text into the poem editor. */
export function poemDataToJSON(poem: PoemData): JSONContent {
  const stanzas = poem.length > 0 ? poem : [[{ text: '', hanging: 0 }]];
  return {
    type: 'doc',
    content: stanzas.map((stanza) => ({
      type: 'stanza',
      content: stanza.map((line) => ({
        type: 'poemLine',
        attrs: { hanging: line.hanging },
        ...(line.text === '' ? {} : { content: [{ type: 'text', text: line.text }] }),
      })),
    })),
  };
}
