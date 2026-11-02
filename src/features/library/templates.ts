import type { ItemKind, Template } from '@/lib/db';

export interface StarterItem {
  kind: ItemKind;
  title: string;
  children?: StarterItem[];
}

export interface TemplateDef {
  id: Template;
  label: string;
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

export const TEMPLATES: Record<Template, TemplateDef> = {
  novel: {
    id: 'novel',
    label: 'Novel',
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
};

export const TEMPLATE_ORDER: readonly Template[] = ['novel', 'memoir', 'poetry'];
