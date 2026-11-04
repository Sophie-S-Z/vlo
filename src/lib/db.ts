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

/* Phase 3 tables (spec section 5, plan Task C1). Each belongs to one project. */

/** An index card on the Story Board (spec 8.1). `x` and `y` are board pixels at 100 % zoom. */
export interface Card {
  id: string;
  projectId: string;
  itemId?: string;
  title: string;
  note?: string;
  x: number;
  y: number;
  color: string;
}

/** A named, colored plot line that links board cards. */
export interface Thread {
  id: string;
  projectId: string;
  name: string;
  color: string;
  order: string;
}

export interface CardLink {
  id: string;
  projectId: string;
  fromCardId: string;
  toCardId: string;
  threadId?: string;
}

/** A colored band on the Memory Timeline. `start` and `end` are dates as in `Item.memory.date`. */
export interface LifeStage {
  id: string;
  projectId: string;
  name: string;
  start: string;
  end: string;
  color: string;
  order: string;
}

/** A named order of poems (spec 8.3). Orders are independent of each other and of the binder. */
export interface Sequence {
  id: string;
  projectId: string;
  name: string;
  itemIds: string[];
  createdAt: number;
}

/** A real person in a memoir, with each way the text names them and the alias for each (F17). */
export interface Person {
  id: string;
  projectId: string;
  label: string;
  variants: { real: string; alias: string }[];
}

export type SubmissionStatus = 'sent' | 'accepted' | 'declined' | 'withdrawn' | 'no-reply';

export interface Submission {
  id: string;
  projectId: string;
  itemIds: string[];
  venue: string;
  /** ISO date, YYYY-MM-DD. */
  sentAt: string;
  status: SubmissionStatus;
  replyAt?: string;
  notes?: string;
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
  cards!: Table<Card, string>;
  threads!: Table<Thread, string>;
  cardLinks!: Table<CardLink, string>;
  lifeStages!: Table<LifeStage, string>;
  sequences!: Table<Sequence, string>;
  people!: Table<Person, string>;
  submissions!: Table<Submission, string>;

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
    // Version 3 (Phase 3, Task C1): the template views. New tables only, so no rows change.
    this.version(3).stores({
      cards: 'id, projectId, itemId',
      threads: 'id, projectId',
      cardLinks: 'id, projectId, fromCardId, toCardId',
      lifeStages: 'id, projectId',
      sequences: 'id, projectId',
      people: 'id, projectId',
      submissions: 'id, projectId',
    });
  }
}

export const db = new VloDb();

/** The Phase 3 tables. Each row has an `id` and a `projectId`, and belongs to one project. */
export const VIEW_TABLE_NAMES = [
  'cards',
  'threads',
  'cardLinks',
  'lifeStages',
  'sequences',
  'people',
  'submissions',
] as const;
export type ViewTableName = (typeof VIEW_TABLE_NAMES)[number];

/** The rows of the Phase 3 tables of one project, by table. */
export interface ViewRows {
  cards: Card[];
  threads: Thread[];
  cardLinks: CardLink[];
  lifeStages: LifeStage[];
  sequences: Sequence[];
  people: Person[];
  submissions: Submission[];
}

export function emptyViewRows(): ViewRows {
  return {
    cards: [],
    threads: [],
    cardLinks: [],
    lifeStages: [],
    sequences: [],
    people: [],
    submissions: [],
  };
}

/** The Phase 3 tables of a database, for a transaction or a delete by project. */
export function viewTables(database: VloDb = db): Table<{ id: string; projectId: string }, string>[] {
  return VIEW_TABLE_NAMES.map(
    (name) => database[name] as unknown as Table<{ id: string; projectId: string }, string>,
  );
}

/** Reads the Phase 3 rows of a project. Call it inside a transaction that holds `viewTables()`. */
export async function readViewRows(projectId: string, database: VloDb = db): Promise<ViewRows> {
  const rows = emptyViewRows();
  for (const name of VIEW_TABLE_NAMES) {
    const table = database[name] as unknown as Table<{ projectId: string }, string>;
    (rows[name] as unknown[]) = await table.where('projectId').equals(projectId).toArray();
  }
  return rows;
}
