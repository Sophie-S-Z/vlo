import { readFileSync } from 'node:fs';
import { getSchema, type JSONContent } from '@tiptap/core';
import { prosemirrorJSONToYDoc } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { DEFAULT_BOOK } from '@/features/book/book';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { scriptExtensions } from '@/features/editor/extensions/script';
import type { ScriptRole } from '@/features/editor/scriptRoles';
import { parsePoemText, poemDataToJSON } from '@/features/editor/poemText';
import { buildExportDoc, type ExportScope } from '@/features/export/build';
import type { ExportDoc, ExportImage, ImageBlock } from '@/features/export/model';
import type { EditorForm } from '@/features/library/templates';
import type { BookSettings, Item, ItemKind, Project, Template } from '@/lib/db';
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

/** The book settings of the book fixtures (F51), with every part of the front and back matter. */
export const BOOK: BookSettings = {
  ...DEFAULT_BOOK,
  copyright: 'Copyright © 2026 Ada Marlow\nAll rights reserved.',
  dedication: 'For the keepers of the light.',
  epigraph: 'The sea keeps every secret it is told.',
  acknowledgments: 'Thanks to the harbor.',
  about: 'Ada Marlow lives by the sea.',
};

export function bookNovel(book: BookSettings = BOOK): ExportDoc {
  return buildExportDoc({
    project: project('novel', { authorName: 'Ada Marlow' }),
    items: [
      item('c1', 'chapter', 'The Harbor'),
      item('s1', 'scene', 'Arrival', 'c1'),
      item('s2', 'scene', 'Later', 'c1'),
      item('c2', 'chapter', 'Chapter Two'),
      item('s3', 'scene', 'Night', 'c2'),
    ],
    scope: { kind: 'project' },
    updates: new Map([
      ['s1', proseUpdate(['The harbor lights came on.', 'The boats came in.'])],
      ['s2', proseUpdate(['The gulls slept.'])],
      ['s3', proseUpdate(['The tide turned.'])],
    ]),
    book,
  });
}

export function bookMemoir(): ExportDoc {
  return buildExportDoc({
    project: project('memoir', { authorName: 'Ada Marlow' }),
    items: [item('m1', 'memory', 'The Kettle'), item('m2', 'memory', 'The Porch')],
    scope: { kind: 'project' },
    updates: new Map([
      ['m1', proseUpdate(MEMOIR_TEXT.split(/\n{2,}/).slice(0, 6))],
      ['m2', proseUpdate(['The porch light stayed on all night.'])],
    ]),
    book: BOOK,
  });
}

export function bookPoetry(): ExportDoc {
  return buildExportDoc({
    project: project('poetry', { authorName: 'Ada Marlow' }),
    items: [item('p1', 'poem', 'Salt on the Sill'), item('p2', 'poem', 'Low Tide')],
    scope: { kind: 'project' },
    updates: new Map([
      ['p1', poemUpdate()],
      ['p2', poemUpdate('The water goes out\n    and leaves its lines.')],
    ]),
    book: { ...BOOK, sceneBreak: 'fleuron' },
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

/** The image fixtures of Phase 16: a JPEG photo and a PNG with transparent pixels. */
export const JPEG = new Uint8Array(readFileSync('tests/fixtures/images/harbour.jpg'));
export const PNG = new Uint8Array(readFileSync('tests/fixtures/images/seal.png'));

export const JPEG_IMAGE: ExportImage = { type: 'image/jpeg', width: 40, height: 30, data: JPEG };
export const IMAGES: Record<string, ExportImage> = {
  harbour: JPEG_IMAGE,
  seal: { type: 'image/png', width: 20, height: 20, data: PNG },
};

export function imageNode(attrs: Partial<Omit<ImageBlock, 'type'>> & { id: string }) {
  return {
    type: 'image',
    attrs: { alt: '', caption: '', decorative: false, width: 100, align: 'center', ...attrs },
  };
}

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

/** A memory with a captioned photo, a decorative seal and a photo that is not on this device. */
export function photoDoc(images: Record<string, ExportImage> = IMAGES): ExportDoc {
  const doc = singleDoc(
    {
      type: 'doc',
      content: [
        paragraph('The boats came in at dawn.'),
        imageNode({ id: 'harbour', alt: 'Boats in the harbour', caption: 'The harbour at dawn', width: 75 }),
        paragraph('A seal on the letter.'),
        imageNode({ id: 'seal', decorative: true, width: 33, align: 'left' }),
        imageNode({ id: 'gone', alt: 'A lost photo' }),
      ],
    },
    'prose',
  );
  return { ...doc, images };
}
