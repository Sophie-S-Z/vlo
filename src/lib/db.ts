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
    /** The project's manuscript font: a Vlo font id or "local:" and an installed font's name. */
    font?: string;
    /** Pageless, or a sheet of Letter or A4 paper with page-end lines (plan decision 8). */
    page?: PageFormat;
    /** The cozy scene around the page, or "none" (plan decision 11). */
    scene?: string;
    /** Standard manuscript format for exports of a novel: the switch and the writer's details. */
    manuscript?: ManuscriptSettings;
  };
}

export type PageFormat = 'pageless' | 'letter' | 'a4';

export interface ManuscriptSettings {
  on: boolean;
  /** The name on the first page and in the page header. */
  name: string;
  /** Contact lines: address, email and phone, one per line. */
  contact: string;
  /** Courier Prime, the typewriter look, in place of the project font. */
  typewriter: boolean;
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

/** A music file the writer added (plan decision 10). It stays on this device and plays from a blob: URL. */
export interface AudioFile {
  id: string;
  /** The file name without its extension. */
  name: string;
  type: string;
  size: number;
  /** Seconds, or 0 when the browser could not tell. */
  duration: number;
  addedAt: number;
  /**
   * The file's bytes. Vlo stores an ArrayBuffer, because Safari cannot store a Blob in IndexedDB in a
   * private window. A Blob can come from an earlier build of this version.
   */
  data: ArrayBuffer | Blob;
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
  audioFiles!: Table<AudioFile, string>;

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
    // Version 2 (Phase 2, Task A9): the writer's own music. The other tables do not change.
    this.version(2).stores({ audioFiles: 'id, addedAt' });
  }
}

export const db = new VloDb();
