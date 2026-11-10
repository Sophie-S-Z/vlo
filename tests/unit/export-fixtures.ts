import { readFileSync } from 'node:fs';
import { getSchema, type JSONContent } from '@tiptap/core';
import { prosemirrorJSONToYDoc } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { scriptExtensions } from '@/features/editor/extensions/script';
import type { ScriptRole } from '@/features/editor/scriptRoles';
import { parsePoemText, poemDataToJSON } from '@/features/editor/poemText';
import { buildExportDoc, type ExportScope } from '@/features/export/build';
import type { ExportDoc } from '@/features/export/model';
import type { EditorForm } from '@/features/library/templates';
import type { Item, ItemKind, Project, Template } from '@/lib/db';
import { YFRAGMENT } from '@/lib/ydocs';

/* Builds export input from editor JSON, through the same schema and Yjs format that the editor writes. */

export const proseSchema = getSchema(proseExtensions(new Y.Doc()));
export const poemSchema = getSchema(poemExtensions(new Y.Doc(), { tabSpaces: 4 }));
export const scriptSchema = getSchema(scriptExtensions(new Y.Doc()));
const SCHEMAS = { prose: proseSchema, poem: poemSchema, script: scriptSchema };

export function updateOf(json: JSONContent, form: EditorForm): Uint8Array {
  const doc = prosemirrorJSONToYDoc(SCHEMAS[form], json, YFRAGMENT);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

export const POEM_TEXT = readFileSync('tests/fixtures/poem.txt', 'utf8');
export const MEMOIR_TEXT = readFileSync('tests/fixtures/memoir.md', 'utf8');

export function poemUpdate(text = POEM_TEXT): Uint8Array {
  return updateOf(poemDataToJSON(parsePoemText(text)), 'poem');
}

export function proseUpdate(paragraphs: readonly string[]): Uint8Array {
  return updateOf(
    {
      type: 'doc',
      content: paragraphs.map((text) => ({
        type: 'paragraph',
        ...(text === '' ? {} : { content: [{ type: 'text', text }] }),
      })),
    },
    'prose',
  );
}

/** A script of [role, text] lines. */
export function scriptUpdate(lines: readonly (readonly [ScriptRole, string])[]): Uint8Array {
  return updateOf(
    {
      type: 'doc',
      content: lines.map(([role, text]) => ({
        type: 'scriptLine',
        attrs: { role },
        ...(text === '' ? {} : { content: [{ type: 'text', text }] }),
      })),
    },
    'script',
  );
}

let order = 0;
export function item(id: string, kind: ItemKind, title: string, parentId: string | null = null): Item {
  order += 1;
  return {
    id,
    projectId: 'p1',
    parentId,
    kind,
    title,
    status: 'draft',
    order: `a${String(order).padStart(4, '0')}`,
    wordCount: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

export function project(
  template: Template,
  extra: { authorName?: string; settings?: Partial<Project['settings']> } = {},
): Pick<Project, 'title' | 'templates' | 'authorName' | 'settings'> {
  return {
    title: 'Salt Year',
    templates: [template],
    ...(extra.authorName ? { authorName: extra.authorName } : {}),
    settings: {
      snapshotEveryMinutes: 10,
      aliasAiRequests: true,
      streaksEnabled: false,
      restDays: [],
      ...extra.settings,
    },
  };
}

/** A one-item export of `json`. */
export function singleDoc(
  json: JSONContent,
  form: 'prose' | 'poem',
  template: Template = form === 'poem' ? 'poetry' : 'memoir',
): ExportDoc {
  const kind: ItemKind = form === 'poem' ? 'poem' : 'memory';
  const items = [item('i1', kind, 'The Kettle')];
  const scope: ExportScope = { kind: 'item', itemId: 'i1' };
  return buildExportDoc({
    project: project(template),
    items,
    scope,
    updates: new Map([['i1', updateOf(json, form)]]),
  });
}

/** Rich prose with every mark and node the export carries. */
export const RICH_PROSE: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { dropCap: true, textAlign: 'justify', lineSpacing: 1.5, firstLineIndent: true },
      content: [
        { type: 'text', text: 'Once  the ' },
        { type: 'text', text: 'tide', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' turned', marks: [{ type: 'italic' }, { type: 'underline' }] },
        { type: 'text', text: ', ' },
        { type: 'text', text: 'gone', marks: [{ type: 'strike' }] },
        { type: 'text', text: ' H' },
        { type: 'text', text: '2', marks: [{ type: 'subscript' }] },
        { type: 'text', text: 'O x' },
        { type: 'text', text: '2', marks: [{ type: 'superscript' }] },
        {
          type: 'text',
          text: ' rose',
          marks: [{ type: 'textStyle', attrs: { color: 'var(--vlo-text-rose)' } }],
        },
        { type: 'text', text: ' marked', marks: [{ type: 'highlight', attrs: { color: null } }] },
        {
          type: 'text',
          text: ' big',
          marks: [{ type: 'textStyle', attrs: { fontSize: '1.5em', font: 'eb-garamond' } }],
        },
        {
          type: 'text',
          text: ' gold',
          marks: [
            {
              type: 'textFill',
              attrs: {
                fill: {
                  stops: [
                    { color: '#b8860b', at: 0 },
                    { color: '#ffd700', at: 50 },
                    { color: '#8b6508', at: 100 },
                  ],
                  angle: 90,
                  look: 'metallic',
                  shimmer: true,
                  speed: 6,
                },
              },
            },
          ],
        },
        {
          type: 'text',
          text: ' site',
          marks: [{ type: 'link', attrs: { href: 'https://example.org/a b' } }],
        },
        { type: 'text', text: ' bad', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
        {
          type: 'footnote',
          attrs: {
            content: [
              { type: 'text', text: 'A note with ', marks: [] },
              { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            ],
          },
        },
        { type: 'text', text: ' and ' },
        { type: 'mathInline', attrs: { latex: '\\frac{a}{b}' } },
        { type: 'hardBreak' },
        { type: 'text', text: 'next line' },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 2, textAlign: 'center' },
      content: [{ type: 'text', text: 'Harbor' }],
    },
    {
      type: 'orderedList',
      attrs: { start: 3 },
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inner' }] }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted words' }] }],
    },
    { type: 'sceneBreak' },
    { type: 'mathBlock', attrs: { latex: '\\sum_{i=1}^{n} i^2' } },
    { type: 'paragraph' },
  ],
};

/** Reads a file under public/, as the export worker does on the site. */
export function loadPublicFile(path: string): Promise<Uint8Array> {
  return Promise.resolve(new Uint8Array(readFileSync(`public/${path}`)));
}

/** A copy of a TrueType font with another OS/2 fsType, the field that says whether it may be embedded. */
export function withFsType(bytes: Uint8Array, fsType: number): Uint8Array {
  const copy = new Uint8Array(bytes);
  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  const tables = view.getUint16(4);
  for (let i = 0; i < tables; i += 1) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(...copy.slice(record, record + 4));
    if (tag === 'OS/2') {
      // version, xAvgCharWidth, usWeightClass and usWidthClass come first: 8 bytes.
      view.setUint16(view.getUint32(record + 8) + 8, fsType);
      return copy;
    }
  }
  throw new Error('The font has no OS/2 table.');
}
