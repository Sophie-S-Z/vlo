import { Dexie, type Table } from 'dexie';

/* Types from VLO_SPEC section 5. Later phases add their tables in new schema versions. */

/** A kind of writing. A project has one or more (`Project.templates`). */
export type Template = 'novel' | 'memoir' | 'poetry' | 'open';
export type AiMode = 'pen' | 'reader' | 'cowriter';
export type ItemKind = 'part' | 'chapter' | 'scene' | 'memory' | 'poem' | 'page' | 'note';
export type Status = 'idea' | 'draft' | 'revised' | 'done';

export interface Project {
  id: string;
  title: string;
  /**
   * The kinds of writing in the project, in `TEMPLATE_ORDER`, at least one. Before database version 6 a
   * project had one `template`; the upgrade puts it in this list.
   */
  templates: Template[];
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
    /** Follow-up days of each venue in the Submissions tracker, by the venue in lower case (E4). */
    followUpDays?: Record<string, number>;
    /** Net words added on each local day, by the date as YYYY-MM-DD, for goals and streaks (F21). */
    wordsByDay?: Record<string, number>;
    /** The time of the first Co-writer insert, so each export offers the AI provenance page (F26). */
    aiInsertedAt?: number;
    /** The language of the writing, as a BCP 47 tag such as "he" (F38). None means English. */
    language?: string;
    /** The writer's labels for items, at most `MAX_LABELS` (F40). */
    labels?: Label[];
  };
}

/** The most labels that a project can have (F40). */
export const MAX_LABELS = 8;

/** A named color that the writer gives to items, such as "Needs research" (F40). */
export interface Label {
  id: string;
  name: string;
  /** A color id of `BOARD_COLORS`. */
  color: string;
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
  /** True when the poem shows its Craft labels (spec 8.3). Off when absent. */
  craft?: boolean;
  /** The id of one of the project's labels (F40). An id that the project no longer has shows no label. */
  labelId?: string;
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

/** Why a request left the app (spec section 5). */
export type NetPurpose = 'ai' | 'model-download' | 'share' | 'usage' | 'originality';

/** One request that left the app's origin (spec section 5, F25). It never holds a key, a header or a body. */
export interface NetworkLogEntry {
  id: string;
  at: number;
  host: string;
  path: string;
  purpose: NetPurpose;
  bytesSent: number;
  status: number | 'error';
}

/** A reader's comment on a share link, after Vlo opened and checked it (spec section 11, plan S4). */
export interface StoredComment {
  id: string;
  /** The section and block of the bundle that the comment is about. */
  section: number;
  block: number;
  /** The first 12 words of that block, so the writer sees the place after the text changes. */
  quote: string;
  name?: string;
  text: string;
  /** When the server took the comment, in milliseconds. */
  at: number;
}

/**
 * One share link (spec section 5). The key and the owner token stay on this device only: no request,
 * backup or export holds them.
 */
export interface ShareRecord {
  /** The id that the server gave. */
  id: string;
  projectId: string;
  itemIds: string[];
  /** The link's title, as the reader sees it. */
  title: string;
  createdAt: number;
  expiresAt: number;
  /** Base64url of the 32-byte owner token for revoke_share. */
  ownerToken: string;
  /** Base64url of the 32-byte AES-GCM key. */
  key: string;
  revoked: boolean;
  comments: StoredComment[];
  /** When Vlo last read the comments, or 0. */
  commentsReadAt: number;
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
  networkLog!: Table<NetworkLogEntry, string>;
  shares!: Table<ShareRecord, string>;

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
    // Version 4 (Phase 4, Task D1): the network log. A new table only, so no rows change.
    this.version(4).stores({ networkLog: 'id, at' });
    // Version 5 (Phase 5, Task E1): the share links. A new table only, so no rows change.
    this.version(5).stores({ shares: 'id, projectId, createdAt' });
    // Version 6: a project can mix templates. Each project's one `template` becomes a list of one.
    this.version(6)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('projects')
          .toCollection()
          .modify((project: Partial<Project> & { template?: Template }) => {
            if (!Array.isArray(project.templates)) project.templates = [project.template ?? 'novel'];
            delete project.template;
          }),
      );
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
