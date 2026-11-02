# Phase 1: Core Writing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer creates a Novel, Memoir or Poetry project, orders items in a binder, writes prose or exact-layout poems that save on the device within 1 s, takes and restores snapshots, and writes with focus tools, a command menu and a session timer.

**Architecture:** Dexie holds metadata (projects, items, snapshots, sessions, item texts, app meta). Each item's text is one Yjs document saved with y-indexeddb as `vlo-item-<itemId>`, and only the open item's document loads. TipTap (ProseMirror) edits that document through the Collaboration extension, with one schema for prose and one for poems. The project route is a lazy chunk, so the Library stays light.

**Tech Stack:** Phase 0 stack, plus TipTap 3.32, yjs 13.6, y-indexeddb 9, y-prosemirror 1.3, Dexie 4.4, fractional-indexing 4, diff 9, MiniSearch 7, dnd-kit, cmdk.

**Spec:** `docs/VLO_SPEC.md` (sections 3 F01 to F05, F10, F11, F13, F14; 5; 7; 8.4 progress counts only where Phase 1 needs them; 12; 13; 14 Phase 1; 15).

## Decisions this plan makes

1. **Motion.** Pending your answer on the GSAP card. This plan assumes the recommended option: no GSAP in Phase 1. Effects use CSS and the View Transitions API (`document.startViewTransition`, through React Router's `viewTransition` option). That covers the card-to-project growth, the onboarding zoom-through, the grid-to-list change and the circular theme reveal with zero library code. Browsers without View Transitions (Firefox today) change instantly. Motion (motion.dev) is added only if a task cannot reach its effect with CSS.
2. **Item text for search.** The command menu searches text in every item, but the editor loads only one Yjs document. A new Dexie table `itemTexts` keeps a plain-text copy of each item, written on the 600 ms save pause. Phase 2 reuses it for the readable `.md` copies in backups. ADR 0003 records it.
3. **Onboarding step 2.** AI modes arrive in Phase 4. Step 2 explains Pen mode ("Your words stay on this device. No AI is on.") with Pen shown as chosen. Phase 4 adds the Reader and Co-writer options to this step. No disabled "coming soon" options appear.
4. **First-visit flag.** Dexie table `appMeta` holds `onboardedAt`. `/` redirects to `/welcome` when there are no projects and no `onboardedAt`.
5. **Template item names.** Novel: Part, Chapter, Scene, Note. Memoir: Part, Memory, Note. Poetry: Section (kind `part`), Poem, Note. Each new project starts with one first item (Chapter 1 with Scene 1, Memory 1, or Poem 1) so the writer can type at once.
6. **Poem keys and keyboard traps.** Tab inserts spaces in a poem line. Escape, then Tab, moves focus out of the editor (WCAG 2.1.2). The editor's help text says so.
7. **Snapshot "active editing".** A minute counts as active when the writer changed the item in it. After 10 active minutes since the last snapshot, and only if the text changed, Vlo saves a snapshot.
8. **Test seeding.** Large-project tests seed IndexedDB through a script built from `tests/e2e/support/seed-entry.ts` and added to the page in a Playwright context with `bypassCSP: true`. No test code ships in the production build.

## Packages (need your approval)

| Package | License | Ships to browser | Reason |
| --- | --- | --- | --- |
| @tiptap/react, @tiptap/core, @tiptap/pm, @tiptap/starter-kit, @tiptap/extension-collaboration | MIT | yes, project chunk | Editor (section 6) |
| y-prosemirror | MIT | yes, project chunk | Required peer of the Collaboration extension |
| yjs, y-indexeddb | MIT | yes, project chunk | Text model (section 6) |
| dexie, dexie-react-hooks | Apache-2.0 | yes, initial | Metadata (section 6) |
| fractional-indexing | CC0-1.0 | yes, initial | Ordering (section 6). I add CC0-1.0 to the license allowlist. |
| diff | BSD-3-Clause | yes, lazy with history panel | Snapshot diff (section 6) |
| minisearch | MIT | yes, lazy with command menu | Search (section 6) |
| @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities | MIT | yes, project chunk | Binder drag and drop (section 6; utilities is a small helper of sortable) |
| cmdk | MIT | yes, lazy with command menu | Accessible command menu, the base of shadcn/ui Command. Not in section 6. About 5 KB gzip. |
| fake-indexeddb | Apache-2.0 | no | IndexedDB in unit tests (section 6) |

## Global Constraints

- Everything in the Phase 0 plan's Global Constraints still holds.
- Text saves to IndexedDB within 1 s after typing stops. The app works offline.
- No animation code runs while the writer types. Keystroke to screen under 50 ms at the 95th percentile in a 100,000-word project. Open a 10,000-word item in under 300 ms. Load only the open item's Yjs document.
- Word counts use `Intl.Segmenter` with `granularity: 'word'` and count segments where `isWordLike` is true.
- Every ordered list uses fractional-indexing strings, so a move changes one row.
- Every Dexie schema change is a new version with an upgrade function and a test.
- Poem lines keep leading spaces, internal spaces, hanging indents and stanza breaks exactly after save and reload.
- Pen mode is the only AI mode in Phase 1, and no Phase 1 code makes a network request.

## Review Focus

1. **Two tabs open on the same item.** Expected: both show the same text and neither loses typing. y-indexeddb shares updates through IndexedDB, but a tab does not see the other tab's live edits until it reloads the document. Pinned in Task 9: a test opens the item in two pages, types in one, reloads the other, and sees the text. The editor shows "This item is open in another tab" through a `BroadcastChannel` notice.
2. **Delete a project or item while its editor is open.** Expected: the editor closes, the Yjs database `vlo-item-<id>` is deleted, and no orphan IndexedDB database remains. Pinned in Task 4 (unit test lists databases with `indexedDB.databases()` after delete) and Task 7.
3. **Paste rich text from Word or a web page into a poem.** Expected: the poem keeps the plain text with every space, splits stanzas at blank lines, and drops styles and images. Pinned in Task 8 (paste test with an HTML clipboard that has `&nbsp;` and `<p>` tags).
4. **Storage full or quota exceeded while typing.** Expected: the writer sees "Vlo could not save. Your device storage is full." in the save status live region, and the editor keeps the text in memory. Pinned in Task 9 (unit test with a y-indexeddb write that rejects with `QuotaExceededError`).
5. **Restore a snapshot while the item has unsaved changes in the last second.** Expected: the "Before restore" snapshot holds the latest text. Pinned in Task 10 (test types, restores at once, and checks the new snapshot's text).

---

### Task 1: Dexie schema, clock and ids

**Files:**
- Create: `src/lib/db.ts`, `src/lib/clock.ts`, `src/lib/ids.ts`, `tests/unit/setup.ts` (imports `fake-indexeddb/auto`)
- Modify: `vitest.config.ts` (setupFiles)
- Test: `tests/unit/db.test.ts`

**Interfaces:**
- Produces:

```ts
// src/lib/db.ts — types from spec section 5, plus:
export interface ItemText { itemId: string; projectId: string; text: string; updatedAt: number }
export interface AppMeta { key: string; value: unknown }
export class VloDb extends Dexie {
  projects: Table<Project, string>;      // indexes: id, updatedAt
  items: Table<Item, string>;            // indexes: id, projectId, [projectId+parentId]
  snapshots: Table<Snapshot, string>;    // indexes: id, itemId, [itemId+createdAt], projectId
  sessions: Table<Session, string>;      // indexes: id, projectId
  itemTexts: Table<ItemText, string>;    // primary key itemId, index projectId
  appMeta: Table<AppMeta, string>;       // primary key key
}
export const db: VloDb; // database name 'vlo'
// src/lib/clock.ts
export const clock: { now(): number }; // tests replace now with vi.spyOn
// src/lib/ids.ts
export function newId(): string; // crypto.randomUUID()
```

- [ ] **Step 1:** Write `tests/unit/db.test.ts`: version 1 opens with exactly the six tables above; `items.where({ projectId, parentId })` returns children; a `Snapshot.state` `Uint8Array` round-trips byte for byte.
- [ ] **Step 2:** Run `npx vitest run tests/unit/db.test.ts`. Expected: FAIL, module missing.
- [ ] **Step 3:** Implement `db.ts`, `clock.ts`, `ids.ts`. Schema version 1 only.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): add the Dexie schema`.

### Task 2: Ordering and word counts

**Files:**
- Create: `src/lib/order.ts`, `src/lib/wordcount.ts`
- Test: `tests/unit/order.test.ts`, `tests/unit/wordcount.test.ts`

**Interfaces:**

```ts
// src/lib/order.ts
export function orderBetween(before: string | null, after: string | null): string;
export function orderAfterLast(sorted: readonly string[]): string;
export function sortByOrder<T extends { order: string }>(rows: readonly T[]): T[]; // plain code-unit compare, never localeCompare
// src/lib/wordcount.ts
export function countWords(text: string, locale?: string): number;
export function countLines(text: string): number; // non-empty poem lines
```

- [ ] **Step 1:** Write tests. Order: 1,000 inserts between the same two neighbours stay strictly sorted; `sortByOrder` uses code-unit order (`'a0' < 'Zz'` is false); moving one row changes only that row. Words: `countWords('')` is 0; `'Salt on the sill.'` is 4; `"don't stop"` is 2; `'雨が降る'` is greater than 0 with locale `ja`; `'    The tide'` is 2; numbers like `'1994'` count as 1.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with `generateKeyBetween` and `Intl.Segmenter`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(lib): add fractional ordering and word counts`.

### Task 3: Yjs document loader

**Files:**
- Create: `src/lib/ydocs.ts`
- Test: `tests/unit/ydocs.test.ts`

**Interfaces:**

```ts
export interface OpenItemDoc { doc: Y.Doc; persistence: IndexeddbPersistence; ready: Promise<void>; close(): Promise<void> }
export function itemDocName(itemId: string): string;            // `vlo-item-${itemId}`
export function openItemDoc(itemId: string): OpenItemDoc;
export async function deleteItemDoc(itemId: string): Promise<void>; // clearData, then indexedDB.deleteDatabase
export function encodeDoc(doc: Y.Doc): Uint8Array;               // Y.encodeStateAsUpdate
export function docFromUpdate(update: Uint8Array): Y.Doc;
export const YFRAGMENT = 'default';
```

- [ ] **Step 1:** Write tests: text written to the fragment, closed, reopened, is present; `deleteItemDoc` removes the database (check `indexedDB.databases()`); `docFromUpdate(encodeDoc(d))` holds the same text.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(lib): add the Yjs item document loader`.

### Task 4: Templates and project service (F03)

**Files:**
- Create: `src/features/library/templates.ts`, `src/features/library/projects.ts`, `src/lib/storage.ts`
- Test: `tests/unit/templates.test.ts`, `tests/unit/projects.test.ts`

**Interfaces:**

```ts
// templates.ts
export interface TemplateDef {
  id: Template; label: string; description: string;
  kinds: ItemKind[];                                   // kinds the binder may create
  kindLabel: Record<ItemKind, string>;                 // only for kinds in `kinds`
  childKinds: Partial<Record<ItemKind | 'root', ItemKind[]>>;
  starter: { kind: ItemKind; title: string; children?: { kind: ItemKind; title: string }[] }[];
  editorKind(kind: ItemKind): 'prose' | 'poem' | null; // null: the item is a folder (part, chapter)
}
export const TEMPLATES: Record<Template, TemplateDef>;
// projects.ts
export async function createProject(input: { title: string; template: Template; authorName?: string }): Promise<{ project: Project; firstItemId: string }>;
export async function renameProject(id: string, title: string): Promise<void>;
export async function deleteProject(id: string): Promise<void>; // rows + every item doc database
// storage.ts
export async function requestPersistence(): Promise<'granted' | 'denied' | 'unsupported'>;
```

- [ ] **Step 1:** Write tests. Templates: Novel kinds are exactly `part, chapter, scene, note`; Memoir `part, memory, note`; Poetry `part, poem, note` with `part` labelled "Section"; no template lists another template's kinds; `editorKind('poem')` is `'poem'`, `'scene'` and `'memory'` and `'note'` are `'prose'`. Projects: `createProject` sets `aiMode: 'pen'`, `snapshotEveryMinutes: 10`, `streaksEnabled: false`, `restDays: []`, `aliasAiRequests` true only for memoir, and creates the starter items with increasing `order`; `deleteProject` removes projects, items, snapshots, sessions and itemTexts rows and every `vlo-item-*` database of that project, and leaves other projects alone (Review Focus 2).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `createProject` calls `requestPersistence()` when it creates the first project and stores the answer in `appMeta` key `persistence`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(library): add templates and the project service`.

### Task 5: Library screen

**Files:**
- Create: `src/features/library/ProjectCard.tsx`, `src/features/library/NewProjectDialog.tsx`, `src/features/library/RenameDialog.tsx`, `src/features/library/DeleteDialog.tsx`, `src/features/project/ProjectPage.tsx` (lazy route)
- Modify: `src/features/library/LibraryPage.tsx`, `src/app/routes.tsx`, `src/features/settings/StorageHealth.tsx` (shows the persistence answer)
- Add shadcn/ui: `dialog`, `dropdown-menu`, `input`, `label`
- Test: `tests/unit/library.test.tsx`, `tests/e2e/library.spec.ts`

**Interfaces:**
- Consumes: `createProject`, `renameProject`, `deleteProject`, `TEMPLATES`.
- Produces: route `/p/:projectId` with `lazy: () => import('@/features/project/ProjectPage')`.

- [ ] **Step 1:** Write the unit test: with no projects, the Library shows the empty state and a "New project" button; with two projects, it shows two cards sorted by `updatedAt` newest first, each with title, template label and word count; Rename changes the title; Delete asks "Delete <title>? This removes it from this device." and only a confirm deletes it.
- [ ] **Step 2:** Write `tests/e2e/library.spec.ts`: create a Poetry project from the dialog (three template cards), land on `/p/<id>` with Poem 1 open, go back, see the card; keyboard-only create works; axe passes on `/` with projects and on the dialog; initial JS stays under budget (`npm run size`).
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4:** Build the screens. Cards use `view-transition-name: project-<id>` so the card grows into the project view through React Router `viewTransition`. The "New project" dialog shows the three template cards in a fan (CSS transforms, flat under Calm mode).
- [ ] **Step 5:** Run both. Expected: PASS.
- [ ] **Step 6:** Commit `feat(library): add project cards, create, rename and delete`.

### Task 6: Onboarding (F13)

**Files:**
- Create: `src/features/onboarding/WelcomePage.tsx`, `src/features/onboarding/HoldButton.tsx`, `src/features/onboarding/firstVisit.ts`
- Modify: `src/app/routes.tsx` (`/welcome`, and a loader on `/` that redirects first visits)
- Test: `tests/unit/hold-button.test.tsx`, `tests/e2e/onboarding.spec.ts` (US15)

**Interfaces:**

```ts
export async function needsOnboarding(): Promise<boolean>; // no projects and no appMeta 'onboardedAt'
export async function markOnboarded(): Promise<void>;
export function HoldButton(props: { label: string; holdMs?: number; onConfirm(): void }): JSX.Element; // default 1200 ms
```

- [ ] **Step 1:** Write the hold-button test: pointer down then up before 1200 ms does not confirm; held 1200 ms confirms once; Space or Enter held 1200 ms confirms; with motion off (Calm or reduced motion) it is a plain button that confirms on click.
- [ ] **Step 2:** Write `tests/e2e/onboarding.spec.ts` as **US15**: in a fresh profile, `/` goes to `/welcome`; "Skip" is visible on every step; pick a template (1), Next (2), Next (3), hold "Hold to open your first page" (4), type (5); the editor has focus and the typed text shows; the whole run takes under 120 s and at most 5 actions. A second test: Skip goes to the Library and never shows `/welcome` again.
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4:** Build it. Step 1 "What do you write?" (Novel, Memoir, Poetry). Step 2 "Your words stay yours" (Pen mode, preselected). Step 3 "Name it" (prefilled "Untitled novel", "Untitled memoir" or "Untitled collection") and the hold button. The zoom-through into the editor uses a view transition. 4% film grain (SVG `feTurbulence` as a `data:` background) on this screen and the Library only.
- [ ] **Step 5:** Run both. Expected: PASS.
- [ ] **Step 6:** Commit `feat(onboarding): add the three-step welcome with Pen mode preselected`.

### Task 7: Binder (F02)

**Files:**
- Create: `src/features/binder/Binder.tsx`, `src/features/binder/tree.ts`, `src/features/binder/BinderItem.tsx`, `src/features/binder/items.ts`
- Test: `tests/unit/tree.test.ts`, `tests/unit/items.test.ts`, `tests/e2e/binder.spec.ts`

**Interfaces:**

```ts
// tree.ts — pure
export interface FlatNode { item: Item; depth: number; parentId: string | null }
export function flattenTree(items: readonly Item[]): FlatNode[];
export function projectDrop(nodes: FlatNode[], activeId: string, overId: string, offsetDepth: number, template: TemplateDef): { parentId: string | null; order: string } | null; // null: not allowed by childKinds
// items.ts
export async function addItem(projectId: string, parentId: string | null, kind: ItemKind, title: string): Promise<Item>;
export async function moveItem(id: string, parentId: string | null, order: string): Promise<void>; // one row changes
export async function updateItem(id: string, patch: Partial<Pick<Item, 'title' | 'synopsis' | 'status'>>): Promise<void>;
export async function deleteItem(id: string): Promise<void>; // item, descendants, their snapshots, texts and docs
```

- [ ] **Step 1:** Write unit tests: `flattenTree` orders by `order` at each level; `projectDrop` places a scene under a chapter, refuses a chapter under a scene in a novel, and refuses a poem under a poem; `moveItem` writes exactly one row (spy on `db.items.update`); `deleteItem` removes descendants and their `vlo-item-*` databases.
- [ ] **Step 2:** Write `tests/e2e/binder.spec.ts`: drag Scene 2 above Scene 1 with the mouse; the order stays after reload. Keyboard: focus an item, Space to lift, ArrowUp, Space to drop; the order stays after reload; the live region announces the move. Touch: on a `hasTouch` context, long-press and move. Each item shows its status and synopsis; status changes from the item menu.
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Build with dnd-kit `SortableContext` over the flat list (`verticalListSortingStrategy`), `PointerSensor`, `TouchSensor` (250 ms delay) and `KeyboardSensor` with `sortableKeyboardCoordinates`. Horizontal drag offset sets the depth. The item menu also has Move up, Move down, Indent and Outdent for screen-reader users. The binder collapses to a drawer under 600 px.
- [ ] **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit `feat(binder): add the binder with mouse, touch and keyboard reorder`.

### Task 8: Editor schemas, poem nodes, keys and paste (F01)

**Files:**
- Create: `src/features/editor/Editor.tsx`, `src/features/editor/extensions/prose.ts`, `src/features/editor/extensions/poem.ts`, `src/features/editor/extensions/sceneBreak.ts`, `src/features/editor/poemText.ts`, `src/features/editor/Toolbar.tsx`, `src/styles/editor.css`
- Test: `tests/unit/poemText.test.ts`, `tests/unit/poem-editor.test.ts`, `tests/fixtures/poem.txt` (spec section 15, exact bytes)

**Interfaces:**

```ts
// poemText.ts — the one place that maps between poem documents and plain text (Phase 2 exporters reuse it)
export interface PoemLineData { text: string; hanging: number }
export type PoemData = PoemLineData[][];                 // stanzas of lines
export function parsePoemText(text: string): PoemData;   // blank line separates stanzas; spaces kept; \r\n becomes \n
export function poemDataToText(poem: PoemData): string;  // inverse; parsePoemText(poemDataToText(p)) deep-equals p
export function poemDataFromDoc(doc: ProseMirrorNode): PoemData;
// extensions
export function proseExtensions(ydoc: Y.Doc): AnyExtension[]; // StarterKit (heading levels [2,3], code, codeBlock, horizontalRule off, undoRedo: false), SceneBreak, Collaboration
export function poemExtensions(ydoc: Y.Doc, opts: { tabSpaces: number }): AnyExtension[]; // Document content 'stanza+', Stanza, PoemLine, Bold, Italic, Underline, Strike, Collaboration
// commands added by PoemLine
setHanging(em: number), indentLine(), outdentLine()
```

- [ ] **Step 1:** Write `poemText.test.ts`: the fixture parses to 3 stanzas with 4, 3 and 1 lines; line 2 text is `'    The tide goes out'`; `'I keep    the kettle    warm'` keeps all internal spaces; round trip of the fixture is byte-identical; trailing spaces on a line stay.
- [ ] **Step 2:** Write `poem-editor.test.ts` with a headless `Editor` (jsdom): Tab inserts 4 spaces at the cursor; Shift-Tab removes up to 4 leading spaces and never other text; Enter splits into a new `poemLine`; Enter on an empty line starts a new `stanza`, and so does Mod-Enter; `setHanging(4)` sets `hanging: 4`; pasting the fixture as `text/plain` gives the fixture's `PoemData`; pasting `text/html` `<p>&nbsp;&nbsp;Salt</p><p></p><p>Tide</p>` gives two stanzas and keeps the two spaces as normal spaces (Review Focus 3); Escape then Tab leaves the editor.
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4:** Implement. `poemLine`: `group: 'block'`, `content: 'inline*'`, `whitespace: 'pre'`, attribute `hanging` (number, default 0, rendered as `data-hanging` and inline `padding-left: <n>em; text-indent: -<n>em`), CSS `white-space: pre-wrap`. Scene break renders a centered "#" and is inserted from the toolbar or by typing `#` alone on a line then Enter. Toolbar: bold, italic, underline, strike, link, heading 2 and 3, quote, lists, scene break for prose; hanging indent (0 to 8 em) for poems.
- [ ] **Step 5:** Run both. Expected: PASS.
- [ ] **Step 6:** Commit `feat(editor): add prose and poem schemas, poem keys and paste rules`.

### Task 9: Project view, autosave, save status and word count (F04)

**Files:**
- Create: `src/features/project/ProjectLayout.tsx` (binder, manuscript, side panel; each column collapses), `src/features/editor/useItemDoc.ts`, `src/features/editor/SaveStatus.tsx`, `src/features/editor/WordCount.tsx`, `src/features/editor/itemText.ts`
- Test: `tests/unit/save-status.test.tsx`, `tests/unit/item-text.test.ts`, `tests/e2e/autosave.spec.ts` (US02)

**Interfaces:**

```ts
export function useItemDoc(itemId: string): { doc: Y.Doc | null; status: 'loading' | 'ready' | 'error' };
export type SaveState = 'saved' | 'saving' | 'error-quota' | 'error';
export function useSaveState(doc: Y.Doc | null): SaveState; // 'saving' on update, 'saved' 600 ms after the last update once IndexedDB confirms
export async function writeItemText(item: Item, text: string): Promise<void>; // itemTexts row + item.wordCount (+ lineCount for poems) + project.updatedAt
```

- [ ] **Step 1:** Write unit tests: save state turns `saved` 600 ms after the last update; a rejected write with `QuotaExceededError` gives `error-quota` and the message "Vlo could not save. Your device storage is full." (Review Focus 4); `writeItemText` sets `wordCount` with `countWords` and `lineCount` for poems.
- [ ] **Step 2:** Write `tests/e2e/autosave.spec.ts`: **US02** — type, wait 1.1 s, close the page, open a new page offline (service worker), and see every character; the save check mark draws after the pause and has a live region "Saved"; the word count updates after the pause; two pages on one item: type in one, reload the other, see the text, and see "This item is open in another tab" (Review Focus 1).
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Implement. Manuscript column default width `68ch`, with a width control (56 to 90 ch). The check mark is an SVG path drawn with a CSS `stroke-dashoffset` transition. The word count rolls with a CSS transform. Neither runs during typing: both start only after the 600 ms pause, and both are instant under Calm mode.
- [ ] **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit `feat(editor): add autosave, save status and word count`.

### Task 10: Snapshots, diff and restore (F05)

**Files:**
- Create: `src/features/snapshots/snapshots.ts`, `src/features/snapshots/useAutoSnapshot.ts`, `src/features/snapshots/HistoryPanel.tsx`, `src/features/snapshots/wordDiff.ts`
- Test: `tests/unit/snapshots.test.ts`, `tests/unit/auto-snapshot.test.ts`, `tests/unit/word-diff.test.ts`, `tests/e2e/snapshots.spec.ts` (US03)

**Interfaces:**

```ts
export async function takeSnapshot(item: Item, doc: Y.Doc, text: string, label?: string): Promise<Snapshot>;
export async function restoreSnapshot(item: Item, editor: Editor, doc: Y.Doc, snapshotId: string): Promise<void>; // saves current as 'Before restore' first
export interface DiffPart { kind: 'same' | 'added' | 'removed'; text: string }
export function wordDiff(before: string, after: string): DiffPart[]; // diffWordsWithSpace
export function useAutoSnapshot(item: Item, doc: Y.Doc | null, everyMinutes: number): void;
```

- [ ] **Step 1:** Write unit tests: a snapshot stores `state` and `text`; restore first writes a "Before restore" snapshot with the current text, then the editor shows the old text, and the item's Yjs history keeps going (no new document); after 10 active minutes with a change, a snapshot appears (fake timers and `clock`); 10 idle minutes add none; no change since the last snapshot adds none; `wordDiff('the tide goes', 'the sea goes')` marks "tide" removed and "sea" added.
- [ ] **Step 2:** Write `tests/e2e/snapshots.spec.ts` as **US03**: with 2 snapshots, pick one, see marked changes, click Restore (2 clicks from the open panel), see the old text, and find a new "Before restore" snapshot with the text from before. Also Review Focus 5: type, restore at once, and the "Before restore" snapshot holds the last typed word.
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Implement. Restore replaces the editor content in one transaction built from the snapshot's Yjs state (`yXmlFragmentToProseMirrorRootNode`), so the change syncs into the live document. The panel lazy-loads `diff`.
- [ ] **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit `feat(snapshots): add automatic and manual snapshots with diff and restore`.

### Task 11: Focus tools, session timer and command menu (F10, F11)

**Files:**
- Create: `src/features/focus/focusPlugin.ts` (ProseMirror decorations), `src/features/focus/FocusControls.tsx`, `src/features/focus/SessionTimer.tsx`, `src/features/focus/sessions.ts`, `src/features/project/CommandMenu.tsx`, `src/features/project/searchIndex.ts`
- Test: `tests/unit/focus-plugin.test.ts`, `tests/unit/sessions.test.ts`, `tests/unit/search-index.test.ts`, `tests/e2e/focus.spec.ts`

**Interfaces:**

```ts
export function focusPlugin(opts: { dim: () => boolean; typewriter: () => boolean }): Plugin; // dims all top-level blocks except the one with the cursor (class vlo-dim, opacity 0.4)
export async function startSession(projectId: string, minutes: number): Promise<Session>;
export async function endSession(id: string, wordsAdded: number, poemsAdded: number): Promise<void>;
export function buildSearchIndex(texts: ItemText[], items: Item[]): MiniSearch; // fields title, text
```

- [ ] **Step 1:** Write unit tests: with dimming on, only the cursor's block lacks `vlo-dim`; typewriter mode scrolls so the cursor line sits at the vertical center (assert the computed scroll target); a session records `startedAt`, `endedAt` and `wordsAdded`; search finds "kettle" in a poem by its text and an item by its title.
- [ ] **Step 2:** Write `tests/e2e/focus.spec.ts`: Focus mode hides binder and side panel (crossfade, instant under Calm) and Escape leaves it; Mod-K opens the command menu, typing a title and Enter opens that item, typing a phrase finds it in text; set the session timer to 1 minute with a mocked clock, and at the end "Close the session?" shows with "Keep writing" and "Close session", and no penalty text; the three themes work in the editor.
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Implement. The timer ring is an SVG circle with `stroke-dashoffset` set once per second, outside the editor DOM. MiniSearch and cmdk load when the menu first opens.
- [ ] **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit `feat(focus): add focus mode, typewriter scrolling, dimming, timer and command menu`.

### Task 12: Library and editor motion, reduced motion (F14, US14)

**Files:**
- Create: `src/ui/motion.ts`, `src/styles/motion.css`
- Modify: `LibraryPage.tsx`, `ProjectCard.tsx`, `SettingsPage.tsx` (circular theme reveal), `WelcomePage.tsx`
- Test: `tests/e2e/motion.spec.ts` (US14)

**Interfaces:**

```ts
export function withViewTransition(motionAllowed: boolean, update: () => void, opts?: { origin?: { x: number; y: number } }): void; // calls update directly when motion is off or the API is missing
```

- [ ] **Step 1:** Write `tests/e2e/motion.spec.ts` as **US14**: with `reducedMotion: 'reduce'`, load the Library with 6 projects, switch grid and list, open the New project dialog, open a project and change the theme; after each step `document.getAnimations().length` is 0 and no `::view-transition` pseudo-element exists. Same with Calm mode on and reduced motion off. A third test with motion allowed checks that the bento stagger and the view transition do run in Chromium, so the effects exist.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Bento stagger: CSS animation with `--i` delays, `power3.out` curve, 0.4 to 0.9 s. Grid and list: view transition with a `view-transition-name` per card. Theme reveal: view transition with a `clip-path: circle()` grown from the control.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(motion): add Library and editor motion with full reduced-motion fallbacks`.

### Task 13: Phase 0 follow-ups

**Files:** `src/app/UpdateProvider.tsx`, `src/app/UpdatePrompt.tsx`, `src/features/settings/SettingsPage.tsx`, `src/ui/switch.tsx`, `src/app/PreferencesProvider.tsx`, `src/features/settings/StorageHealth.tsx`, `src/app/AppShell.tsx`, `src/styles/index.css`, `package.json`
**Test:** additions to the existing unit and e2e tests named in each step.

- [ ] **Step 1:** Tests first, then fixes, one commit each:
  - Each route sets `document.title` (for example "Settings · Vlo") and moves focus to its `h1` after navigation (`routes.test.tsx`).
  - The update notice uses an always-mounted live region (`route-error.test.tsx` neighbour `update-prompt.test.tsx`).
  - Theme radio names are only the theme name; the hint stays as the description (`shell.spec.ts` checks `getByRole('radio', { name: 'Sepia', exact: true })`).
  - Unchecked switch track uses `border-muted` (contrast test reads `switch.tsx` class list).
  - `theme-color` meta follows the resolved theme (`shell.spec.ts`).
  - A `storage` event with `key === null` resets preferences (`preferences.test.ts`).
  - Preferences save in an effect, not inside the state updater (`preferences.test.ts` counts `setItem` calls under StrictMode).
  - Storage health shows "Not available" when `estimate()` rejects, and labels the quota "Quota" (`storage-health.test.tsx`).
  - `body` drops `overflow-x: hidden` (the 360 px tests still pass).
  - Hourly `registration.update()` while online (`update-provider.test.tsx` with fake timers).
  - `engines.node` becomes `22.x`; Tailwind moves to `devDependencies`.

### Task 14: Gate 1 fixtures, performance, audit and pull request

**Files:**
- Create: `tests/fixtures/memoir.md`, `tests/fixtures/novel/` (spec section 15), `tests/fixtures/generate-large.ts`, `tests/e2e/support/seed-entry.ts`, `tests/e2e/support/global-setup.ts`, `tests/e2e/poem-roundtrip.spec.ts`, `tests/e2e/performance.spec.ts`, `docs/adr/0003-item-text-copies.md`
- Modify: `playwright.config.ts` (globalSetup), `scripts/licenses-lib.mjs` (CC0-1.0), `docs/STATUS.md`

**Interfaces:**

```ts
export function generateLargeProject(seed: number): { project: Project; items: Item[]; texts: Map<string, string> }; // 100,000 words, 40 chapters, 120 scenes, 30 poems, one 10,000-word scene
```

- [ ] **Step 1:** Write `generate-large` tests: same seed gives the same output; total words are 100,000 ± 0.5% by `countWords`; counts are 40 chapters, 120 scenes and 30 poems.
- [ ] **Step 2:** Write `poem-roundtrip.spec.ts`: paste the fixture into Poem 1, set the last line's hanging indent to 4, reload, read the document back through `poemDataFromDoc`, and compare every character and hanging value to the fixture.
- [ ] **Step 3:** Write `performance.spec.ts` with the seeded 100,000-word project: open the 10,000-word scene in under 300 ms (from navigation start to the editor's first paint of its text); type 200 characters and measure keydown to next animation frame; the 95th percentile is under 50 ms; only one `vlo-item-*` database opens (`indexedDB` open calls counted by an init script).
- [ ] **Step 4:** Run, fix until they pass, and check the bundle: Library initial JS under 250 KB, project chunk size recorded in `docs/STATUS.md`.
- [ ] **Step 5:** Visual pass with `anthropic-skills:frontend-design`, then the interface audit with `anthropic-skills:impeccable` on Library, onboarding, binder, editor (prose and poem), history and Settings. Fix every finding graded high.
- [ ] **Step 6:** Whole-branch review by a fresh reviewer, then one fix pass with tests.
- [ ] **Step 7:** Open the pull request `phase-1-core-writing` into `main`.

**Gate 1:** US02, US03, US14 and US15 pass. The poem round-trip test passes. The 100,000-word performance test passes.
