import { Dexie, type Table } from 'dexie';

/* Types from VLO_SPEC section 5. Later phases add their tables in new schema versions. */

export type Template = 'novel' | 'memoir' | 'poetry';
export type AiMode = 'pen' | 'reader' | 'cowriter';
export type ItemKind = 'part' | 'chapter' | 'scene' | 'memory' | 'poem' | 'note';
export type Status = 'idea' | 'draft' | 'revised' | 'done';

export interface Project {
  id: string;
  title: string;
  template: Template;
  aiMode: AiMode;
  authorName?: string;
  createdAt: number;
  updatedAt: number;
  lastBackupAt?: number;
  settings: {
    snapshotEveryMinutes: number;
    aliasAiRequests: boolean;
    goalWordsPerDay?: number;
    streaksEnabled: boolean;
    restDays: number[];
  };
}

export interface Item {
  id: string;
  projectId: string;
  parentId: string | null;
  kind: ItemKind;
  title: string;
  synopsis?: string;
  status: Status;
  order: string;
  wordCount: number;
  lineCount?: number;
  createdAt: number;
  updatedAt: number;
  memory?: {
    date?: string;
    dateEnd?: string;
    lifeStageId?: string;
    themes: string[];
  };
}

export interface Snapshot {
  id: string;
  projectId: string;
  itemId: string;
  label?: string;
  createdAt: number;
  state: Uint8Array;
  text: string;
}

export interface Session {
  id: string;
  projectId: string;
  startedAt: number;
  endedAt: number;
  wordsAdded: number;
  poemsAdded: number;
}

/** A plain-text copy of each item, for search and readable backups (ADR 0003). */
export interface ItemText {
  itemId: string;
  projectId: string;
  text: string;
  updatedAt: number;
}

/** Small app-wide values, such as the first-visit flag. */
export interface AppMeta {
  key: string;
  value: unknown;
}

export class VloDb extends Dexie {
  projects!: Table<Project, string>;
  items!: Table<Item, string>;
  snapshots!: Table<Snapshot, string>;
  sessions!: Table<Session, string>;
  itemTexts!: Table<ItemText, string>;
  appMeta!: Table<AppMeta, string>;

  constructor(name = 'vlo') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt',
      items: 'id, projectId, [projectId+parentId]',
      snapshots: 'id, itemId, [itemId+createdAt], projectId',
      sessions: 'id, projectId',
      itemTexts: 'itemId, projectId',
      appMeta: 'key',
    });
  }
}

export const db = new VloDb();
