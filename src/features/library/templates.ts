import { flattenTree } from '@/features/binder/tree';
import type { Item, ItemKind, Template } from '@/lib/db';

export interface StarterItem {
  kind: ItemKind;
  title: string;
  children?: StarterItem[];
}

export interface TemplateDef {
  /** The template, or the first template of a project that mixes several. */
  id: Template;
  label: string;
  /** A short name for a list of templates, such as "Novel + Memoir". */
  shortLabel: string;
  description: string;
  /** Default title for a new project. */
  untitled: string;
  /** Kinds the binder may create, in menu order. */
  kinds: ItemKind[];
  kindLabel: Partial<Record<ItemKind, string>>;
  /** Kinds allowed under each parent kind, and at the top level ('root'). */
  childKinds: Partial<Record<ItemKind | 'root', ItemKind[]>>;
  starter: StarterItem[];
  /** The editor an item opens in, or null for a folder such as a part or chapter. */
  editorKind: (kind: ItemKind) => 'prose' | 'poem' | null;
}

const proseOrFolder = (kind: ItemKind): 'prose' | 'poem' | null =>
  kind === 'part' || kind === 'chapter' ? null : kind === 'poem' ? 'poem' : 'prose';

/** True when an item of `kind` has its own text. A part or a chapter is a folder and has none. */
export function holdsText(templates: readonly Template[], kind: ItemKind): boolean {
  return projectDef(templates).editorKind(kind) !== null;
}

export const TEMPLATES: Record<Template, TemplateDef> = {
  novel: {
    id: 'novel',
    label: 'Novel',
    shortLabel: 'Novel',
    description: 'Parts, chapters and scenes. Draft scenes in any order.',
    untitled: 'Untitled novel',
    kinds: ['part', 'chapter', 'scene', 'note'],
    kindLabel: { part: 'Part', chapter: 'Chapter', scene: 'Scene', note: 'Note' },
    childKinds: {
      root: ['part', 'chapter', 'note'],
      part: ['chapter', 'note'],
      chapter: ['scene', 'note'],
    },
    starter: [{ kind: 'chapter', title: 'Chapter 1', children: [{ kind: 'scene', title: 'Scene 1' }] }],
    editorKind: proseOrFolder,
  },
  memoir: {
    id: 'memoir',
    label: 'Memoir',
    shortLabel: 'Memoir',
    description: 'Memories you can shape by time or by theme.',
    untitled: 'Untitled memoir',
    kinds: ['part', 'memory', 'note'],
    kindLabel: { part: 'Part', memory: 'Memory', note: 'Note' },
    childKinds: {
      root: ['part', 'memory', 'note'],
      part: ['memory', 'note'],
    },
    starter: [{ kind: 'memory', title: 'Memory 1' }],
    editorKind: proseOrFolder,
  },
  poetry: {
    id: 'poetry',
    label: 'Poetry collection',
    shortLabel: 'Poetry',
    description: 'Poems that keep every space, in sections you can reorder.',
    untitled: 'Untitled collection',
    kinds: ['part', 'poem', 'note'],
    kindLabel: { part: 'Section', poem: 'Poem', note: 'Note' },
    childKinds: {
      root: ['part', 'poem', 'note'],
      part: ['poem', 'note'],
    },
    starter: [{ kind: 'poem', title: 'Poem 1' }],
    editorKind: proseOrFolder,
  },
  open: {
    id: 'open',
    label: 'Open writing',
    shortLabel: 'Open',
    description:
      'A blank page for any writing: essays, letters, scripts, journals and more. Put pages in folders.',
    untitled: 'Untitled writing',
    kinds: ['part', 'page', 'note'],
    kindLabel: { part: 'Folder', page: 'Page', note: 'Note' },
    // A folder can hold other folders, so the writer can make any shape.
    childKinds: {
      root: ['part', 'page', 'note'],
      part: ['part', 'page', 'note'],
    },
    starter: [{ kind: 'page', title: 'Page 1' }],
    editorKind: proseOrFolder,
  },
};

export const TEMPLATE_ORDER: readonly Template[] = ['novel', 'memoir', 'poetry', 'open'];

/** The templates in `TEMPLATE_ORDER`, each one time. An empty or unknown list gives a novel. */
export function cleanTemplates(templates: readonly string[]): Template[] {
  const clean = TEMPLATE_ORDER.filter((t) => templates.includes(t));
  return clean.length > 0 ? clean : ['novel'];
}

/** True when the project has the template. */
export function hasTemplate(project: { templates: readonly Template[] }, template: Template): boolean {
  return project.templates.includes(template);
}

/** A short name for the templates, such as "Novel" or "Novel + Memoir". */
export function templatesLabel(templates: readonly Template[]): string {
  return projectDef(templates).label;
}

function union<T>(lists: readonly (readonly T[] | undefined)[]): T[] {
  const out: T[] = [];
  for (const list of lists) for (const value of list ?? []) if (!out.includes(value)) out.push(value);
  return out;
}

/** Puts several templates in one definition. The first template that names a kind gives its label. */
function mergeTemplates(templates: readonly Template[]): TemplateDef {
  const defs = templates.map((t) => TEMPLATES[t]);
  const kinds = union(defs.map((d) => d.kinds));
  const kindLabel: Partial<Record<ItemKind, string>> = {};
  for (const kind of kinds) kindLabel[kind] = defs.find((d) => d.kindLabel[kind])?.kindLabel[kind] ?? kind;
  const parents = union(defs.map((d) => Object.keys(d.childKinds) as (ItemKind | 'root')[]));
  const childKinds: Partial<Record<ItemKind | 'root', ItemKind[]>> = {};
  for (const parent of parents) childKinds[parent] = union(defs.map((d) => d.childKinds[parent]));
  return {
    id: defs[0]?.id ?? 'novel',
    label: defs.map((d) => d.shortLabel).join(' + '),
    shortLabel: defs.map((d) => d.shortLabel).join(' + '),
    description: defs.map((d) => d.description).join(' '),
    untitled: 'Untitled project',
    kinds,
    kindLabel,
    childKinds,
    starter: defs.flatMap((d) => d.starter),
    editorKind: proseOrFolder,
  };
}

const merged = new Map<string, TemplateDef>();

/**
 * The definition for a project's templates: the template itself, or all of them in one when the writer
 * picked several. The binder kinds, the nesting rules and the starter items are the sum of each template.
 * The same list gives the same object, so React can compare it.
 */
export function projectDef(source: readonly Template[] | { templates: readonly Template[] }): TemplateDef {
  const templates = cleanTemplates('templates' in source ? source.templates : source);
  const [only] = templates;
  if (templates.length === 1 && only) return TEMPLATES[only];
  const key = templates.join('+');
  let def = merged.get(key);
  if (!def) {
    def = mergeTemplates(templates);
    merged.set(key, def);
  }
  return def;
}

const lists = new Map<string, readonly Template[]>();

/** The templates in a clean order, as one shared array for each list, so React can compare it. */
export function templateList(templates: readonly Template[]): readonly Template[] {
  const clean = cleanTemplates(templates);
  const key = clean.join('+');
  let list = lists.get(key);
  if (!list) {
    list = Object.freeze(clean);
    lists.set(key, list);
  }
  return list;
}

/**
 * The items that break the binder rules of `templates`: a kind that the templates do not have, or a place
 * that they do not allow. A template change waits until there are none, so no text is lost (decision P3).
 */
export function misfits(items: readonly Item[], templates: readonly Template[]): Item[] {
  const def = projectDef(templates);
  const kindOf = new Map(items.map((i) => [i.id, i.kind]));
  // In binder order. An item whose parent is gone shows at the top, as in the binder.
  return flattenTree(items)
    .map((node) => node.item)
    .filter((item) => {
      const parent = (item.parentId === null ? undefined : kindOf.get(item.parentId)) ?? 'root';
      return !(def.childKinds[parent]?.includes(item.kind) ?? false);
    });
}
