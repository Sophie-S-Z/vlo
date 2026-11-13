import { Dexie, type Table } from 'dexie';
import type { PoemForm } from '@/features/craft/forms';
import { CLOCK_TABLE, syncClockMiddleware, type ClockEntry } from '@/features/sync/clock';
import { countUnit, recountItems } from './wordcount';

/* Types from VLO_SPEC section 5. Later phases add their tables in new schema versions. */

/** A kind of writing. A project has one or more (`Project.templates`). */
export type Template = 'novel' | 'memoir' | 'poetry' | 'open' | 'script' | 'essay' | 'article' | 'research';
export type AiMode = 'pen' | 'reader' | 'cowriter';
/** A `script` item is a scene of a screenplay or a stage play (F63). */
export type ItemKind = 'part' | 'chapter' | 'scene' | 'memory' | 'poem' | 'page' | 'script' | 'note';
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
    /** A date to finish by and the project's word target then, which sets the daily goal (F46). */
    deadline?: Deadline;
    /** The month challenge (F60). */
    challenge?: Challenge;
    /** Net words added on each local day, by the date as YYYY-MM-DD, for goals and streaks (F21). */
    wordsByDay?: Record<string, number>;
    /** The time of the first Co-writer insert, so each export offers the AI provenance page (F26). */
    aiInsertedAt?: number;
    /** The language of the writing, as a BCP 47 tag such as "he" (F38). None means English. */
    language?: string;
    /** The writer's labels for items, at most `MAX_LABELS` (F40). */
    labels?: Label[];
    /** Track changes and the revision pass that new changes take (F44). Off when absent. */
    tracking?: Tracking;
    /** The cover letter and bio of the last submission packet, for the next one (F53). */
    packet?: PacketText;
    /** The book layout of a PDF or EPUB with book layout: trim, chapter style and matter (F51). */
    book?: BookSettings;
    /** The layout of a Script project's scenes (F63). A screenplay when absent. */
    scriptStyle?: ScriptStyle;
    /** The style of the citations and the bibliography in an export (F64). APA when absent. */
    citeStyle?: CiteStyle;
    /** The continuity marks that the writer kept with "Not a problem" (F66). None when absent. */
    continuity?: ContinuityKept;
  };
}

/** Rule 1 keeps a word, such as "Marla". Rule 2 keeps an entry in a scene, as "entryId:itemId". */
export interface ContinuityKept {
  words: string[];
  scenes: string[];
}

export const SCRIPT_STYLES = ['screenplay', 'stage'] as const;
export type ScriptStyle = (typeof SCRIPT_STYLES)[number];

export const CITE_STYLES = ['apa', 'mla', 'chicago'] as const;
export type CiteStyle = (typeof CITE_STYLES)[number];

export const TRIMS = ['5x8', '5.25x8', '5.5x8.5', '6x9', 'a5'] as const;
/** A print trim size: inches, or A5. */
export type Trim = (typeof TRIMS)[number];
export const CHAPTER_STYLES = ['classic', 'modern', 'plain'] as const;
export const SCENE_BREAKS = ['stars', 'fleuron', 'space'] as const;

/** The most characters of each matter text of a book, such as the dedication (F51). */
export const MAX_BOOK_TEXT = 4000;

export interface BookSettings {
  trim: Trim;
  chapter: (typeof CHAPTER_STYLES)[number];
  sceneBreak: (typeof SCENE_BREAKS)[number];
  /** A drop cap on the first paragraph of each chapter. */
  dropCaps: boolean;
  /** A contents page in the front matter. */
  contents: boolean;
  copyright: string;
  dedication: string;
  epigraph: string;
  acknowledgments: string;
  about: string;
}

/** The most characters of a packet's cover letter, bio or synopsis (F53). */
export const MAX_PACKET_TEXT = 6000;

export interface PacketText {
  letter: string;
  bio: string;
}

/** A revision pass of Track changes. Each pass has its own color (F44). */
export type Pass = 1 | 2 | 3 | 4 | 5;

export interface Tracking {
  on: boolean;
  pass: Pass;
}

/** The words to write in one month, as YYYY-MM: the month challenge (F60). */
export interface Challenge {
  month: string;
  words: number;
}

/**
 * A date as YYYY-MM-DD and the project's total words to reach by the end of that day (F46). `from` holds
 * the total when the writer set the deadline, on the day `since`. A target under it is a goal to cut the
 * draft down.
 */
export interface Deadline {
  date: string;
  words: number;
  from?: number;
  since?: string;
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

/** A suggested length of a section, in words (Phase 17 decision M2). */
export interface WordRange {
  min?: number;
  max?: number;
}

export type ItemRole = 'references';

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
  /** The form that the Craft labels check the poem against (F56). None when absent. */
  form?: PoemForm;
  /** The name of the version in the editor (F55). "Main" when absent. */
  versionName?: string;
  /** The id of one of the project's labels (F40). An id that the project no longer has shows no label. */
  labelId?: string;
  /** When the scene happens in the story (F67): "YYYY", "YYYY-MM" or "YYYY-MM-DD". Undated when absent. */
  storyDate?: string;
  /**
   * What the section is for, from the structure that started the project (Phase 17 decision M2), such as
   * "State the question and why it matters." It shows above the text and never goes in an export.
   */
  guide?: string;
  /** The word range that the structure suggests for the section. Either end can be absent. */
  words?: WordRange;
  /**
   * A page with a job of its own. "references" shows the live reference list of the project's sources, and
   * an export puts the list there (decision M3).
   */
  role?: ItemRole;
  /**
   * The title is a working label, such as "Lede" or "Body paragraph 1" (Phase 17). An export gives the
   * section no heading, so the sections read as one piece. The binder menu can turn it off.
   */
  workingTitle?: true;
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

/**
 * A named version of an item's text that is not in the editor now (F55). The item's own text is the
 * active version. A switch puts this state in the editor and keeps the text it replaces as a version.
 */
export interface ItemVersion {
  id: string;
  projectId: string;
  itemId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** The whole Yjs state, so a switch keeps every mark. */
  state: Uint8Array;
  text: string;
}

/** The public key of a device, as the JWK fields that ECDSA P-256 needs. */
export interface DeviceKey {
  crv: 'P-256';
  kty: 'EC';
  x: string;
  y: string;
}

/**
 * One entry of the authorship record of a project (F54): what one device saw the writer do since its
 * entry before. It holds counts only, never text or titles. The entries of one device in one project make
 * a chain: `seq` counts up from 0, `prev` is the hash of the entry before, and the device key signs each
 * hash. The first entry holds the device's public key.
 */
export interface AuthorshipEntry {
  id: string;
  projectId: string;
  /** The SHA-256 of the device's public key, in hex. */
  device: string;
  seq: number;
  at: number;
  /** The minutes with a change since the entry before. */
  minutes: number;
  /** Characters by source. */
  typed: number;
  pasted: number;
  dictated: number;
  ai: number;
  deleted: number;
  /** The words of the project at `at`. */
  words: number;
  /** The hash of the entry before, or "" for the first entry. */
  prev: string;
  hash: string;
  sig: string;
  /** Only in the first entry of a chain. */
  key?: DeviceKey;
}

/** The most versions of one item, so a slip of the button cannot fill the device. */
export const MAX_VERSIONS = 20;
/** The longest name of a version. */
export const MAX_VERSION_NAME = 60;

export interface Session {
  id: string;
  projectId: string;
  startedAt: number;
  endedAt: number;
  wordsAdded: number;
  poemsAdded: number;
  /** The word target of a sprint (F60). A session with none is a plain writing session. */
  target?: number;
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

export type CodexKind = 'character' | 'place' | 'thing' | 'lore';

/**
 * An entry of a project's Codex (F42): a character, place, thing or piece of lore, with its other names and
 * a note. No export or share reads the Codex. Only the reader panel (F61) sends the notes of the names in its
 * text.
 */
/**
 * A change to a Codex entry at a scene (F65), such as "Loses her left eye". It holds from that scene on,
 * in reading order. `leaves` is true when the entry leaves the story there.
 */
export interface CodexChange {
  id: string;
  itemId: string;
  text: string;
  leaves?: true;
}

export interface CodexEntry {
  id: string;
  projectId: string;
  kind: CodexKind;
  name: string;
  aliases: string[];
  note?: string;
  order: string;
  /** The changes at scenes, in the order the writer added them. None when absent. */
  changes?: CodexChange[];
}

export const SOURCE_TYPES = ['book', 'chapter', 'article', 'web'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** A person's name in a source. An organization as author has only a family name. */
export interface SourceName {
  family: string;
  given?: string;
}

/**
 * A source that the writer cites (F64): a book, a chapter of a book, a journal article or a web page. A
 * citation in the text names its source by `key`, so a copy of the project keeps its citations.
 */
export interface Source {
  id: string;
  projectId: string;
  /** Unique in the project, such as "marlow2019". It does not change after the source is added. */
  key: string;
  type: SourceType;
  authors: SourceName[];
  /** The editors of the book that holds a chapter. */
  editors?: SourceName[];
  title: string;
  /** The book of a chapter, the journal of an article, or the site of a web page. */
  container?: string;
  publisher?: string;
  year?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
}

/** A rule of a series style sheet (F59): the form to use, and the forms that the style check marks. */
export interface StyleRule {
  use: string;
  avoid: string[];
  note?: string;
}

/**
 * Books in an order that share Codex entries and a style sheet (F59). A shared Codex entry belongs to
 * the series: its `projectId` is the series id. A project is in at most one series.
 */
export interface Series {
  id: string;
  title: string;
  projectIds: string[];
  styleSheet: StyleRule[];
  updatedAt: number;
}

/**
 * A research file of a project (F41): an image, a PDF, an audio file, or a clipping of text that the
 * writer pastes with its link. It stays on this device. Vlo never fetches a clipping's link.
 */
export interface ResearchFile {
  id: string;
  projectId: string;
  name: string;
  /** The media type, such as "image/png". A clipping has "text/plain". */
  type: string;
  /** Bytes. */
  size: number;
  addedAt: number;
  /** The file itself. A clipping has no file. */
  data?: Blob;
  clip?: { text: string; url?: string };
  /** The memory whose recording this is (F57). */
  itemId?: string;
}

/**
 * An image in the text of an item (Phase 16). The item's document holds only the image's id, so a scene
 * with photos opens as fast as one without, and a typed key never copies the bytes. Vlo stores each image
 * as a JPEG or a PNG of at most `MAX_IMAGE_SIDE` pixels on its long side.
 */
export interface ImageFile {
  id: string;
  projectId: string;
  /** "image/jpeg" or "image/png". */
  type: string;
  /** Bytes. */
  size: number;
  /** Pixels. */
  width: number;
  height: number;
  addedAt: number;
  data: Blob;
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
export type NetPurpose =
  'ai' | 'model-download' | 'share' | 'usage' | 'originality' | 'sync' | 'room' | 'timestamp' | 'publish';

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
  /** The first 12 words of that block, or the words the reader selected, as `ReaderComment` holds them. */
  quote: string;
  start?: number;
  end?: number;
  reaction?: 'loved' | 'funny' | 'moved' | 'lost' | 'bored' | 'unconvinced';
  /** The index of the link's question that `text` answers. */
  question?: number;
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
  /** The questions that the link asks its readers (F50). */
  questions?: string[];
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
  codex!: Table<CodexEntry, string>;
  research!: Table<ResearchFile, string>;
  syncClock!: Table<ClockEntry, string>;
  itemVersions!: Table<ItemVersion, string>;
  authorship!: Table<AuthorshipEntry, string>;
  series!: Table<Series, string>;
  sources!: Table<Source, string>;
  images!: Table<ImageFile, string>;

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
    // Version 7 (Phase 8, Tasks H5 and H6): the Codex and the research files. New tables only.
    this.version(7).stores({ codex: 'id, projectId', research: 'id, projectId' });
    // Version 8 (Phase 8, Task H9): Chinese and Japanese count characters, so their items count again.
    this.version(8)
      .stores({})
      .upgrade(async (tx) => {
        for (const project of (await tx.table('projects').toArray()) as Project[]) {
          const { language } = project.settings;
          if (countUnit(language) === 'words') continue;
          const [items, texts] = await Promise.all([
            tx.table('items').where('projectId').equals(project.id).toArray() as Promise<Item[]>,
            tx.table('itemTexts').where('projectId').equals(project.id).toArray() as Promise<ItemText[]>,
          ]);
          await tx.table('items').bulkPut(recountItems(items, texts, language));
        }
      });
    // Version 9 (Phase 9, Task I6): the sync clock. A new table only; the middleware fills it.
    this.version(9).stores({ [CLOCK_TABLE]: 'key, projectId, at' });
    // Version 10 (Phase 11, Task K2): the named versions of an item. A new table only.
    this.version(10).stores({ itemVersions: 'id, projectId, itemId' });
    // Version 11 (Phase 11, Task K5): the authorship record. A new table only.
    this.version(11).stores({ authorship: 'id, projectId' });
    // Version 12 (Phase 11, Task K8): series of books. A new table only.
    this.version(12).stores({ series: 'id, *projectIds' });
    // Version 13 (Phase 13, Task M5): the sources that a writer cites. A new table only.
    this.version(13).stores({ sources: 'id, projectId' });
    // Version 14 (count rule 2, the Ellipsus comparison): "well-known", "and/or", a web address and a time
    // count as one word each, so every item counts again from its text copy.
    this.version(14)
      .stores({})
      .upgrade(async (tx) => {
        for (const project of (await tx.table('projects').toArray()) as Project[]) {
          const [items, texts] = await Promise.all([
            tx.table('items').where('projectId').equals(project.id).toArray() as Promise<Item[]>,
            tx.table('itemTexts').where('projectId').equals(project.id).toArray() as Promise<ItemText[]>,
          ]);
          await tx.table('items').bulkPut(recountItems(items, texts, project.settings.language));
        }
      });
    // Version 15 (Phase 16, Task G1): the images in the text. A new table only.
    this.version(15).stores({ images: 'id, projectId' });
    this.use(syncClockMiddleware);
  }
}

export const db = new VloDb();

/**
 * The view tables (Phase 3, the Codex of Phase 8 and the sources of Phase 13). Each row has an `id` and a
 * `projectId`.
 */
export const VIEW_TABLE_NAMES = [
  'cards',
  'threads',
  'cardLinks',
  'lifeStages',
  'sequences',
  'people',
  'submissions',
  'codex',
  'sources',
] as const;

/** The rows of the view tables of one project, by table. */
export interface ViewRows {
  cards: Card[];
  threads: Thread[];
  cardLinks: CardLink[];
  lifeStages: LifeStage[];
  sequences: Sequence[];
  people: Person[];
  submissions: Submission[];
  codex: CodexEntry[];
  sources: Source[];
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
    codex: [],
    sources: [],
  };
}

/** The view tables of a database, for a transaction or a delete by project. */
export function viewTables(database: VloDb = db): Table<{ id: string; projectId: string }, string>[] {
  return VIEW_TABLE_NAMES.map(
    (name) => database[name] as unknown as Table<{ id: string; projectId: string }, string>,
  );
}

/** Reads the view rows of a project. Call it inside a transaction that holds `viewTables()`. */
export async function readViewRows(projectId: string, database: VloDb = db): Promise<ViewRows> {
  const rows = emptyViewRows();
  for (const name of VIEW_TABLE_NAMES) {
    const table = database[name] as unknown as Table<{ projectId: string }, string>;
    (rows[name] as unknown[]) = await table.where('projectId').equals(projectId).toArray();
  }
  return rows;
}
