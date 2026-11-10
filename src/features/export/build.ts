import { flattenTree } from '@/features/binder/tree';
import { cleanLanguage, DEFAULT_LANGUAGE } from '@/lib/language';
import { projectDef } from '@/features/library/templates';
import { DEFAULT_FONT } from '@/features/editor/format/fonts';
import type { BookSettings, Item, Project } from '@/lib/db';
import { textBlocks, type Block, type ExportDoc, type ExportReview, type ExportSection } from './model';
import { itemBlocks, noteCounter, updateToJson } from './read';

/*
 * Puts the items of an export in reading order with their titles. Notes are research, so no export
 * holds them. A folder (part or chapter) gives a heading. In a novel, scenes give no heading of their
 * own: a scene break separates the scenes of a chapter, as in a printed book. Memories and poems keep
 * their titles.
 */

export type ExportScope =
  | { kind: 'item'; itemId: string }
  | { kind: 'folder'; itemId: string }
  | { kind: 'project' }
  /**
   * A named order of poems (E2): the poems in that order, under the order's name. A share link (E3) picks
   * items with an empty name, and the project title names the export.
   */
  | { kind: 'sequence'; name: string; itemIds: readonly string[] };

/** The items an export holds, in binder order, with their depth under the scope. */
export function scopeItems(items: readonly Item[], scope: ExportScope): { item: Item; depth: number }[] {
  const nodes = flattenTree(items).filter((n) => n.item.kind !== 'note');
  if (scope.kind === 'project') return nodes.map((n) => ({ item: n.item, depth: n.depth }));
  if (scope.kind === 'sequence') {
    const byId = new Map(nodes.map((n) => [n.item.id, n.item]));
    return [...new Set(scope.itemIds)].flatMap((id) => {
      const item = byId.get(id);
      return item ? [{ item, depth: 0 }] : [];
    });
  }
  const start = nodes.findIndex((n) => n.item.id === scope.itemId);
  const first = nodes[start];
  if (!first) return [];
  if (scope.kind === 'item') return [{ item: first.item, depth: 0 }];
  const out = [{ item: first.item, depth: 0 }];
  for (let i = start + 1; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (!node || node.depth <= first.depth) break;
    out.push({ item: node.item, depth: node.depth - first.depth });
  }
  return out;
}

/** The nearest part or chapter above an item, for the "This chapter" scope. */
export function folderOf(items: readonly Item[], itemId: string): Item | null {
  const byId = new Map(items.map((i) => [i.id, i]));
  let parentId = byId.get(itemId)?.parentId ?? null;
  while (parentId !== null) {
    const parent = byId.get(parentId);
    if (!parent) return null;
    if (parent.kind === 'part' || parent.kind === 'chapter') return parent;
    parentId = parent.parentId;
  }
  return null;
}

/** The export's file name without its extension: the title, without characters that file systems refuse. */
export function exportFileName(title: string): string {
  const clean = title
    // Control characters are not allowed in file names.
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return clean === '' ? 'Vlo export' : clean;
}

export interface BuildInput {
  project: Pick<Project, 'title' | 'templates' | 'authorName' | 'settings'>;
  items: readonly Item[];
  scope: ExportScope;
  /** Each item's Yjs update, by item id. A missing update reads as an empty item. */
  updates: ReadonlyMap<string, Uint8Array>;
  /** The tracked changes and comments that a Word export keeps for an editor (F45). None when absent. */
  review?: ExportReview;
  /** Book layout for a PDF or an EPUB (F51). */
  book?: BookSettings;
}

/** A document of plain text with no title, such as the cover letter, bio or synopsis of a submission packet (F53). */
export function textDoc(project: BuildInput['project'], body: string): ExportDoc {
  return {
    title: '',
    font: project.settings.font ?? DEFAULT_FONT,
    paper: project.settings.page === 'a4' ? 'a4' : 'letter',
    language: cleanLanguage(project.settings.language) ?? DEFAULT_LANGUAGE,
    sections: [{ id: 'text', title: '', form: 'prose', blocks: textBlocks(body) }],
  };
}

export function buildExportDoc({ project, items, scope, updates, review, book }: BuildInput): ExportDoc {
  const template = projectDef(project);
  const list = scopeItems(items, scope);
  const notes = noteCounter();
  const sections: ExportSection[] = [];
  let lastWasScene = false;
  for (const { item, depth } of list) {
    const form = template.editorKind(item.kind);
    if (form === null) {
      // A part is the top level. A chapter, or a part inside a scope, is one level down.
      const level = item.kind === 'part' && depth === 0 && scope.kind === 'project' ? 1 : 2;
      sections.push({
        id: item.id,
        title: item.title,
        form: null,
        blocks: [{ type: 'heading', level, runs: [{ type: 'text', text: item.title, style: {} }] }],
      });
      lastWasScene = false;
      continue;
    }
    const update = updates.get(item.id);
    const body = update ? itemBlocks(updateToJson(update), form, notes, review) : [];
    const blocks: Block[] = [];
    if (item.kind === 'scene') {
      if (lastWasScene) blocks.push({ type: 'sceneBreak' });
      lastWasScene = true;
    } else {
      lastWasScene = false;
      // A single memory or poem is the whole export, and the title names it.
      blocks.push({ type: 'heading', level: 2, runs: [{ type: 'text', text: item.title, style: {} }] });
    }
    blocks.push(...body);
    sections.push({ id: item.id, title: item.title, form, blocks });
  }
  const scoped =
    scope.kind === 'project' || scope.kind === 'sequence' ? null : items.find((i) => i.id === scope.itemId);
  const title =
    scope.kind === 'sequence' && scope.name !== ''
      ? `${project.title}, ${scope.name}`
      : (scoped?.title ?? project.title);
  return {
    title,
    ...(project.authorName ? { author: project.authorName } : {}),
    font: project.settings.font ?? DEFAULT_FONT,
    paper: project.settings.page === 'a4' ? 'a4' : 'letter',
    language: cleanLanguage(project.settings.language) ?? DEFAULT_LANGUAGE,
    sections,
    ...(book ? { book } : {}),
  };
}
