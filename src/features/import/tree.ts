import { getSchema } from '@tiptap/core';
import { DOMParser as SchemaParser, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { prosemirrorJSONToYDoc } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import type { Backup } from '@/features/backup/file';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { docBody, docText } from '@/features/editor/itemText';
import { parsePoemText, poemDataToJSON } from '@/features/editor/poemText';
import { newProject } from '@/features/library/projects';
import { projectDef } from '@/features/library/templates';
import { emptyViewRows, type Item, type ItemKind, type ItemText, type Template } from '@/lib/db';
import { newId } from '@/lib/ids';
import { orderBetween } from '@/lib/order';
import { countLines, countWords } from '@/lib/wordcount';
import { YFRAGMENT } from '@/lib/ydocs';

/*
 * The shared end of every import (roadmap F34). Each reader turns its files into an `ImportSource`: a
 * tree of folders and texts. `placeNodes` fits the tree to a template's binder rules, and `toBackup`
 * makes the rows and the Yjs documents. The Library stores the result with `importBackup`, so an import
 * is all or nothing, as a backup import is.
 */

/** A file that a reader cannot use. The message is for the writer. */
export class ImportError extends Error {}

/** One text: HTML for the prose editor, and plain lines for the poem editor. */
export interface ImportText {
  html: string;
  /** Lines end with a line feed, and a blank line ends a stanza. Leading spaces and tabs stay. */
  poem: string;
}

export interface ImportNode {
  title: string;
  synopsis?: string;
  text?: ImportText;
  /** A folder has children. A folder can have its own text too, as in Scrivener. */
  children?: ImportNode[];
  /** Research and other material outside the manuscript: it goes in as notes. */
  note?: true;
}

export interface ImportSource {
  title: string;
  nodes: ImportNode[];
  /** What the readers left out, such as "2 tables", for the summary. */
  skipped: string[];
}

interface Placed {
  kind: ItemKind;
  title: string;
  synopsis?: string;
  text?: ImportText;
  children: Placed[];
}

/** Fits the tree to the templates' kinds and nesting rules. No text is ever dropped. */
export function placeNodes(nodes: readonly ImportNode[], templates: readonly Template[]): Placed[] {
  const def = projectDef(templates);
  const folders = def.kinds.filter((k) => k !== 'note' && def.editorKind(k) === null);
  const textKind = def.kinds.find((k) => k !== 'note' && def.editorKind(k) !== null) ?? 'note';
  const allowed = (parent: ItemKind | 'root', kind: ItemKind) =>
    def.childKinds[parent]?.includes(kind) ?? false;
  const leaf = (kind: ItemKind, node: ImportNode): Placed => ({
    kind,
    title: node.title,
    ...(node.synopsis ? { synopsis: node.synopsis } : {}),
    ...(node.text ? { text: node.text } : {}),
    children: [],
  });

  const place = (node: ImportNode, parent: ItemKind | 'root'): Placed[] => {
    // A folder's own text becomes its first item.
    const own: ImportNode | null =
      node.children && node.text && node.text.poem.trim() !== ''
        ? { title: node.title, text: node.text }
        : null;
    if (node.note) {
      // Every folder kind can hold notes. A research folder's own items follow it as notes.
      const notes = node.children?.flatMap((child) => place({ ...child, note: true }, parent)) ?? [];
      return [...(own || !node.children ? [leaf('note', node)] : []), ...notes];
    }
    if (node.children) {
      const options = folders.filter((f) => allowed(parent, f));
      const holdsFolders = node.children.some((c) => c.children && !c.note);
      const pick =
        options.find((f) => (holdsFolders ? folders.some((g) => allowed(f, g)) : allowed(f, textKind))) ??
        options[0];
      // No folder fits here, such as a folder inside a chapter: its items move up one level.
      if (!pick)
        return [...(own ? place(own, parent) : []), ...node.children.flatMap((c) => place(c, parent))];
      const children = [...(own ? place(own, pick) : []), ...node.children.flatMap((c) => place(c, pick))];
      return [{ kind: pick, title: node.title, children }];
    }
    if (allowed(parent, textKind)) return [leaf(textKind, node)];
    // A scene needs a chapter: the text gets a folder of its own name.
    const wrap = folders.find((f) => allowed(parent, f) && allowed(f, textKind));
    if (wrap) return [{ kind: wrap, title: node.title, children: [leaf(textKind, node)] }];
    return [leaf('note', node)];
  };
  return nodes.flatMap((node) => place(node, 'root'));
}

const schemas = {
  prose: getSchema(proseExtensions(new Y.Doc())),
  poem: getSchema(poemExtensions(new Y.Doc(), { tabSpaces: 4 })),
};

/** The editor document of a text, read with the editor's own rules, as a paste is. */
function docOf(text: ImportText | undefined, form: 'prose' | 'poem'): ProseMirrorNode {
  if (form === 'poem') return schemas.poem.nodeFromJSON(poemDataToJSON(parsePoemText(text?.poem ?? '')));
  const body = new DOMParser().parseFromString(text?.html ?? '', 'text/html').body;
  return SchemaParser.fromSchema(schemas.prose).parse(body);
}

/** The project, its items, their text copies and their Yjs updates, as a backup holds them. */
export function toBackup(source: ImportSource, templates: readonly Template[], now: number): Backup {
  const project = newProject({ title: source.title, templates }, now);
  const def = projectDef(project.templates);
  const items: Item[] = [];
  const itemTexts: ItemText[] = [];
  const updates = new Map<string, Uint8Array>();

  const add = (placed: readonly Placed[], parentId: string | null) => {
    let order: string | null = null;
    for (const node of placed) {
      order = orderBetween(order, null);
      const item: Item = {
        id: newId(),
        projectId: project.id,
        parentId,
        kind: node.kind,
        title: node.title.trim() || 'Untitled',
        ...(node.synopsis ? { synopsis: node.synopsis } : {}),
        status: 'draft',
        order,
        wordCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      const form = def.editorKind(node.kind);
      if (form) {
        const doc = docOf(node.text, form);
        const ydoc = prosemirrorJSONToYDoc(schemas[form], doc.toJSON(), YFRAGMENT);
        updates.set(item.id, Y.encodeStateAsUpdate(ydoc));
        ydoc.destroy();
        const counted = docBody(doc, form);
        item.wordCount = countWords(counted);
        if (form === 'poem') item.lineCount = countLines(counted);
        itemTexts.push({ itemId: item.id, projectId: project.id, text: docText(doc, form), updatedAt: now });
      }
      items.push(item);
      add(node.children, item.id);
    }
  };
  add(placeNodes(source.nodes, project.templates), null);

  return {
    // The files that the writer imported are a copy of this state, so the project counts as backed up.
    createdAt: now,
    project,
    items,
    snapshots: [],
    sessions: [],
    itemTexts,
    updates,
    music: [],
    views: emptyViewRows(),
  };
}
