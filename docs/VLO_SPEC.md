# Vlo: Build Prompt for Claude

This file is the complete brief for building the Vlo web app. It holds the product rules, the scope, the architecture, the data model, the build phases, the tests and the tools to use. Save it in the repository as `docs/VLO_SPEC.md` before you write any code. Read it again at the start of each phase.

---

## 0. Your role and how you work

You are the lead engineer for Vlo. You build the production web app end to end, one phase at a time. I am the product owner. I approve each phase plan and each phase result.

Working rules:

1. Start in plan mode. Read this whole file first. Then ask me the questions in section 17 with the AskUserQuestion tool. Start Phase 0 only after I answer.
2. Load `superpowers:using-superpowers` at the start of each session. Then use the skills in section 16 at the points it names.
3. Before each phase, write a plan to `docs/plans/phase-N.md` with `superpowers:writing-plans`. Show me the plan. Start the phase after I approve it.
4. Use test-driven development (`superpowers:test-driven-development`) for all logic: storage, word counts, ordering, export, backup, crypto, private names, AI routing and the network module.
5. Work on one branch per phase, named `phase-N-<short-name>`. Commit after each finished task. Open a pull request at the end of each phase.
6. Mark a task done only after its tests pass and you check the result in a real browser with Playwright (`superpowers:verification-before-completion`).
7. Use only the packages in section 6. If you need another package, tell me the name, the license, the size and the reason first.
8. Ship no placeholder code, no "TODO later" comments and no fake data in the interface.
9. Keep `docs/STATUS.md` current: done, in progress, blocked, decisions. At the end of each session, write a handoff with `anthropic-skills:handoff`.
10. Record each architecture decision as a short ADR in `docs/adr/NNNN-title.md`.
11. If an API in this file differs from a library's current documentation, follow the documentation and record the change in `docs/STATUS.md`.
12. Ask me before you spend money, delete data, change a production setting or publish anything.

---

## 1. Product brief

**Vlo** (it sounds like "flow") is a free, local-first web app for novelists, memoirists and poets. Tagline: "Write in flow."

Vlo keeps every manuscript on the writer's device. No Vlo server receives manuscript text. The writer picks an AI mode for each project. "Pen" mode (no AI) is the default for every new user and every new project.

A separate marketing site with a waitlist already exists (built in Lovable). This build is the app itself. The app links back to the marketing site, and the marketing site links to the app.

### Product principles

1. The editor is quiet. Motion lives around the writing, never inside it. Nothing animates while the writer types.
2. Manuscripts stay on the device. Only three things can leave it: AI requests that the writer sends on purpose, encrypted share copies, and opt-in usage counts that contain no text.
3. Pen mode is the default. The writer turns AI on for each project.
4. Every effect has a static fallback and obeys the reduced-motion setting and Vlo's "Calm mode".
5. The app costs $0 to build and to run at launch scale.
6. Each writer type sees only the tools for its own form.

### Users (equal priority)

| Persona | Job to be done | Top pain | Feature that must win them |
| --- | --- | --- | --- |
| Nadia, novelist, drafts a fantasy series | Plan a plot, draft scenes in any order, send clean chapters to beta readers | Pays for a planner, an editor and a formatter; Scrivener feels complex | Story Board linked to the binder; clean manuscript export |
| Marcus, memoirist, writes about his childhood | Shape memories into a book without his family seeing raw drafts | Fear of exposure; emotional strain; chronology feels flat | Private names with aliases; Memory Timeline by time or theme; session timer |
| Ines, poet, builds a chapbook | Keep exact line layout and try many poem orders | Web tools break indents; Scrivener feels made for novels | Poetry-safe editor; Collection Sequencer with named orders |
| Theo, beta reader | Read a draft on any device and leave comments | Bad formatting in exported files; must install software | Read-and-comment link that opens in a phone browser |

### Non-goals for version 1

- Real-time co-writing by many writers
- Native iOS or Android apps (the web app installs as a PWA)
- User accounts and cloud sync of manuscripts
- Publishing, a marketplace or a social feed
- Paid plans or ads
- Screenwriting formats

---

## 2. Evidence that drives the design

These findings come from the October 2026 market research. Use them to make tradeoffs.

- **Trust decides adoption.** In 2023, 96% of 2,400+ authors said consent should come before AI trains on their work (Authors Guild). NaNoWriMo lost board members and its Ellipsus sponsorship after its 2024 AI statement and closed in 2025. Writers moved drafts out of Google Docs over training fears. Design rule: Pen mode is the default, and the writer can check that it sends nothing.
- **AI helps most as a reader, not an author.** Studies of Wordcraft (2022), CoAuthor (CHI 2022), Metaphoria (CHI 2019) and Dramatron (CHI 2023) found that writers value AI for ideas and questions. Full generation feels generic and lowers ownership. Doshi and Hauser (Science Advances, 2024) found that AI ideas make stories more similar to each other. Design rule: Reader mode gives feedback in a side panel and never writes text.
- **Poets lose their layout.** Poets report that web editors drop indents and hanging indents. Some fake indents with blank characters or screenshots. Design rule: the poetry editor and every export keep whitespace exactly.
- **Memoirists fear exposure.** Writers fear that family members will read drafts, and they report emotional strain. Current memoir apps focus on family legacy and AI interviews. Design rule: private names with aliases, session limits, and no cloud copy.
- **Novelists pay for tool sprawl.** They buy a planner, an editor and a formatter separately. Scrivener reviews cite a steep learning curve and fragile sync. Design rule: a board linked to the binder, clean export, and simple defaults.
- **Free cloud AI tiers carry data risks.** Google's Gemini API terms say that for unpaid services, human reviewers may read input and output. They tell users not to submit sensitive or personal information. Design rule: in-browser AI is the default AI engine, and every free-tier key shows its data terms before it works.
- **Browsers can delete local data.** Safari can delete script-written storage after 7 days without a visit, unless the site is installed as a web app. Design rule: persistent storage request, PWA install prompt on Safari, backup reminders, one-click backup.

---

## 3. Scope: features and acceptance criteria

Priorities use MoSCoW. "Must" ships in its phase. "Should" ships if time allows. "Could" moves to a later release first.

| ID | Feature | Priority | Phase | Acceptance criteria |
| --- | --- | --- | --- | --- |
| F01 | Poetry-safe editor | Must | 1 | Leading spaces, internal spaces, hanging indents and stanza breaks stay exact after save, reload and every export. |
| F02 | Binder with drag reorder | Must | 1 | The writer reorders items by mouse, touch or keyboard. The order stays after reload. |
| F03 | Templates: Novel, Memoir, Poetry Collection | Must | 1 | Each template shows only its own item names and views. |
| F04 | Local storage and autosave | Must | 1 | Text saves to IndexedDB within 1 s after typing stops. The app works offline. |
| F05 | Snapshots and restore | Must | 1 | A snapshot saves every 10 minutes of active editing and on demand. The writer compares two snapshots and restores one in 2 clicks. Restore saves the current text as a new snapshot first. |
| F06 | Full-project backup and import (.zip) | Must | 2 | Export then import gives an identical project. A reminder shows after 7 days without a backup. |
| F07 | Export to DOCX, PDF, EPUB and Markdown | Must | 2 | Novels get a standard manuscript format option. Poems keep their layout in all 4 formats. |
| F08 | Calm mode and reduced motion | Must | 0 | One switch turns off decorative motion, sound and WebGL. The system reduced-motion setting does the same. |
| F09 | Installable app (PWA) | Must | 0 | Vlo installs on desktop and phone and opens offline. |
| F10 | Focus tools | Should | 1 | Focus mode, typewriter scrolling, focus-line dimming and three themes work in the editor. |
| F11 | Session timer | Should | 1 | The writer sets a time. At the end, a gentle prompt asks to close the session. No penalty applies. |
| F13 | Onboarding | Must | 1 | 3 steps with Pen mode preselected. A Skip link is always visible. First word typed in under 2 minutes. |
| F14 | Shared-element transitions | Should | 1 and 3 | A project card grows into the project view. A board card grows into its scene. |
| F15 | Story Board and Plot Grid (novel) | Must | 3 | Cards link to binder items. Threads link cards. A Plot Grid shows chapters against threads. |
| F16 | Memory Timeline (memoir) | Must | 3 | Memories sit on a horizontal life-stage track. A toggle groups them by time or by theme. |
| F17 | Private names (memoir) | Must | 3 | Every marked real name changes to its alias in every share link, export and AI request. |
| F18 | Collection Sequencer (poetry) | Must | 3 | The poet saves many named orders of the same poems. |
| F19 | Craft panel (poetry) | Should | 3 | Syllable counts, stress marks and rhyme letters run on the device. Off by default. |
| F20 | Submissions tracker | Should | 3 | The writer logs piece, venue, sent date, status and reply date. |
| F21 | Progress map and goals | Could | 3 | Tiles show item status. Goals and streaks are off by default. Rest days keep a streak. |
| F22 | Ambient sound | Could | 3 | Rain, café and fireplace loops made with the Web Audio API. Off by default. |
| F23 | Three AI modes per project | Must | 4 | Pen mode loads no AI code. Reader output stays in the side panel. Co-writer marks AI text. |
| F24 | AI engines: in-browser, own key, local server | Must | 4 | Keys stay in memory by default. Free-tier data terms show before the writer saves a key. |
| F25 | Network log | Must | 4 | The log lists every outgoing request. In Pen mode it shows 0. |
| F26 | AI provenance report | Should | 4 | An export option lists the share of AI-origin text. |
| F27 | Encrypted read-and-comment links | Must | 5 | Only ciphertext leaves the device. The writer sets an expiry date and can revoke a link. |
| F28 | Reader view with comments | Must | 5 | The link opens in a phone browser with no install or account. |
| F29 | Save to a local folder | Could | 5 | The writer picks a folder that their own cloud drive syncs. Chromium browsers only. |
| F30 | Opt-in usage counts | Must | 5 | Off by default. With consent, the app sends weekly totals and error codes. It never sends text, titles or names. The writer can view each report before it goes. |

(F12, the 3D landing page, belongs to the separate marketing site. Do not build it here.)

### User stories with acceptance tests

Write each story as a Playwright test named after its ID.

| ID | Story | Test |
| --- | --- | --- |
| US01 | As a poet, I want my indents to stay exact, so that my poem looks right in a submission. | Given the poem fixture, when I export to each format, then every line keeps its leading spaces, internal spaces and hanging indent. |
| US02 | As a writer, I want my text saved without action, so that a closed tab costs me nothing. | Given I close the tab, when I reopen Vlo offline, then all text typed more than 1 s before the close is present. |
| US03 | As a writer, I want to go back to an earlier draft, so that I can try bold edits. | Given 2 or more snapshots, when I pick one, then I see the changes marked. When I restore it, the current text saves as a new snapshot first. |
| US04 | As a writer, I want to move my project to a new computer, so that I am not tied to one browser. | Given a backup .zip, when I import it in a fresh browser profile, then items, order, notes, people, sequences and snapshots match the original. |
| US05 | As a novelist, I want to plan on a board and jump to a scene, so that planning and drafting stay connected. | Given a card linked to a scene, when I double-click the card, then the editor opens that scene in under 1 s. |
| US06 | As a memoirist, I want real names hidden in shared copies, so that family members stay private. | Given the memoir fixture with "Aunt Rosa" aliased as "Aunt Maria", when I share or export, then "Rosa" appears 0 times in the output. |
| US07 | As a memoirist, I want to see memories by theme, so that I find a shape other than chronology. | Given memories with theme tags, when I switch to By theme, then the cards regroup and the card count stays the same. |
| US08 | As a poet, I want many orders of the same poems, so that I can build a chapbook and a contest entry. | Given orders "Chapbook" and "Contest", when I reorder "Contest", then "Chapbook" does not change. |
| US09 | As a writer who rejects AI, I want proof that nothing leaves my device, so that I can trust Vlo. | Given Pen mode, when I type for 60 s and use every non-AI feature, then the browser sends 0 requests to any origin other than the app, and the network log shows 0. No AI chunk loads. |
| US10 | As a writer who wants feedback, I want AI comments that cannot enter my text, so that the words stay mine. | Given Reader mode, when I ask for feedback, then the answer shows in the side panel, and no control inserts it into the manuscript. |
| US11 | As a writer with my own key, I want to know what the provider does with my text, so that I can decide safely. | Given I paste a free-tier key, when I save it, then the provider's data terms show, and the key works only after I tick a box. |
| US12 | As a writer, I want to share one chapter for a limited time, so that old drafts do not stay in circulation. | Given a link with a 14-day expiry, when a reader opens it on day 15 (mock the clock), then the page says the link expired. |
| US13 | As a beta reader, I want to comment on my phone, so that I can read anywhere. | Given a valid link, when I open it at 390 px width, then I read and comment with no account. The writer sees the comment in the share panel. |
| US14 | As a motion-sensitive user, I want a still interface, so that I can use Vlo without discomfort. | Given reduced motion is on, when I use the Library, board and timeline, then no decorative animation plays. |
| US15 | As a new writer, I want to start fast, so that my first visit leads to writing. | Given a fresh profile, when I follow onboarding, then I can type in the editor in under 2 minutes and in 5 or fewer actions. |

---

## 4. Architecture

Vlo is a static single-page app. All manuscript work happens in the browser.

```
Writer's device (browser)
  Editor and binder (TipTap on ProseMirror, one Yjs document per item)
     | saves to                         | sends AI and share requests to
  Local storage (Dexie metadata,        Network module (src/lib/net.ts)
  y-indexeddb item documents,              | writes every request to the network log
  snapshots, backups)                      |
     | passes snapshots to                 v
  Share encryption (AES-GCM, key        Outside services:
  stays in the URL fragment) ------->     - WebLLM model host (model files, once)
  In-browser AI (WebLLM on WebGPU)        - AI providers (writer's own key)
                                          - Local AI server (Ollama or LM Studio)
                                          - Supabase (ciphertext shares, opt-in counts)
```

In Pen mode the network module sends nothing, because the app loads no AI code and the writer creates no share link.

### Routes

| Route | Screen |
| --- | --- |
| `/` | Library (project cards) |
| `/welcome` | Onboarding (first visit only, skippable) |
| `/p/:projectId` | Project: binder, editor, side panel |
| `/p/:projectId/board` | Story Board and Plot Grid (novel) |
| `/p/:projectId/timeline` | Memory Timeline (memoir) |
| `/p/:projectId/sequences` | Collection Sequencer (poetry) |
| `/p/:projectId/submissions` | Submissions tracker |
| `/p/:projectId/progress` | Progress map and goals |
| `/p/:projectId/people` | People and aliases (memoir) |
| `/settings` | Themes, Calm mode, AI engines and keys, backups, usage counts, storage health |
| `/network` | Network log |
| `/r/:shareId` | Reader view (key in the URL fragment) |
| `/ai-policy`, `/privacy` | Policy pages with version and date |

### Repository layout

```
vlo/
  src/
    app/            routes, providers, error boundaries
    features/
      library/  onboarding/  editor/  binder/  snapshots/  focus/
      board/  timeline/  people/  sequencer/  craft/  submissions/  progress/
      export/  backup/  ai/  share/  reader/  settings/  network/  usage/
    lib/            db.ts, ydocs.ts, net.ts, crypto.ts, wordcount.ts,
                    order.ts, privacy.ts, clock.ts, featureFlags.ts
    ui/             shadcn components, motion primitives, icons
    styles/         tokens.css, themes.css, editor.css, print.css
    workers/        export.worker.ts, craft.worker.ts
  tests/
    unit/  e2e/  fixtures/
  supabase/
    migrations/
  public/
    _headers  manifest.webmanifest  icons/  fonts/
  docs/
    VLO_SPEC.md  STATUS.md  plans/  adr/  ai-policy.md  privacy.md
  .github/workflows/  ci.yml  keepalive.yml
```

---

## 5. Data model

Store metadata in Dexie (IndexedDB). Store each item's text in its own Yjs document, saved with y-indexeddb under the name `vlo-item-<itemId>`. Use fractional indexing strings for every ordered list, so a move changes one row.

```ts
type Template = 'novel' | 'memoir' | 'poetry';
type AiMode = 'pen' | 'reader' | 'cowriter';
type ItemKind = 'part' | 'chapter' | 'scene' | 'memory' | 'poem' | 'note';
type Status = 'idea' | 'draft' | 'revised' | 'done';

interface Project {
  id: string;
  title: string;
  template: Template;
  aiMode: AiMode;                // default 'pen'
  authorName?: string;           // for manuscript headers
  createdAt: number;
  updatedAt: number;
  lastBackupAt?: number;
  settings: {
    snapshotEveryMinutes: number;      // default 10
    aliasAiRequests: boolean;          // default true for memoir
    goalWordsPerDay?: number;
    streaksEnabled: boolean;           // default false
    restDays: number[];                // 0..6
  };
}

interface Item {
  id: string;
  projectId: string;
  parentId: string | null;
  kind: ItemKind;
  title: string;
  synopsis?: string;
  status: Status;
  order: string;                 // fractional index within parent
  wordCount: number;
  lineCount?: number;            // poems
  createdAt: number;
  updatedAt: number;
  memory?: {
    date?: string;               // ISO date or 'YYYY' or 'YYYY-MM'
    dateEnd?: string;
    lifeStageId?: string;
    themes: string[];
  };
}

interface LifeStage { id: string; projectId: string; name: string; start: string; end: string; color: string; order: string }
interface Sequence { id: string; projectId: string; name: string; itemIds: string[]; createdAt: number }
interface Snapshot { id: string; projectId: string; itemId: string; label?: string; createdAt: number; state: Uint8Array; text: string }
interface Card { id: string; projectId: string; itemId?: string; title: string; note?: string; x: number; y: number; color: string }
interface Thread { id: string; projectId: string; name: string; color: string; order: string }
interface CardLink { id: string; projectId: string; fromCardId: string; toCardId: string; threadId?: string }
interface Person { id: string; projectId: string; label: string; variants: { real: string; alias: string }[] }
interface Submission { id: string; projectId: string; itemIds: string[]; venue: string; sentAt: string; status: 'sent' | 'accepted' | 'declined' | 'withdrawn' | 'no-reply'; replyAt?: string; notes?: string }
interface Session { id: string; projectId: string; startedAt: number; endedAt: number; wordsAdded: number; poemsAdded: number }
interface ShareRecord { id: string; projectId: string; itemIds: string[]; createdAt: number; expiresAt: number; ownerToken: string; key: string; revoked: boolean }
interface NetworkLogEntry { id: string; at: number; host: string; path: string; purpose: 'ai' | 'model-download' | 'share' | 'usage'; bytesSent: number; status: number | 'error' }
interface ApiKeyRecord { id: string; provider: string; label: string; encrypted?: { salt: string; iv: string; data: string } }
```

Rules:

- Word counts use `Intl.Segmenter` with `granularity: 'word'` and count segments where `isWordLike` is true. This works for many languages.
- Store API keys in memory by default. Store them only if the writer turns on encrypted storage with a passphrase.
- Never store a share key or owner token anywhere except the writer's device.
- Write a Dexie schema version for every change, with an upgrade function. Test each upgrade.

---

## 6. Stack and packages

| Area | Choice |
| --- | --- |
| App | React 18 or 19, Vite, TypeScript (strict), Tailwind CSS, shadcn/ui, React Router |
| Editor | TipTap (current stable, MIT extensions only) on ProseMirror |
| Text model | yjs, y-indexeddb, @tiptap/extension-collaboration (turn off the TipTap history extension when collaboration is on) |
| Metadata | dexie, dexie-react-hooks |
| Ordering | fractional-indexing |
| Diff | diff (jsdiff) |
| Search | minisearch (local full-text search for Reader mode and the command menu) |
| Motion | gsap with free plugins (Flip, Draggable, InertiaPlugin, DrawSVGPlugin, MorphSVGPlugin, ScrambleTextPlugin), @gsap/react, motion (motion.dev) |
| Drag and drop | @dnd-kit/core, @dnd-kit/sortable |
| Gestures | @use-gesture/react (board pan and pinch) |
| Export | docx, pdf-lib with @pdf-lib/fontkit, jszip (EPUB and backups), markdown-it (Markdown tests only) |
| Poetry | cmu-pronouncing-dictionary, syllable (fallback for unknown words) |
| AI | @mlc-ai/web-llm (lazy chunk), plain fetch adapters for providers |
| Sharing | @supabase/supabase-js (lazy chunk) |
| PWA | vite-plugin-pwa (Workbox) |
| Fonts (self-hosted) | @fontsource-variable/fraunces, @fontsource-variable/newsreader, @fontsource-variable/inter, @fontsource/jetbrains-mono |
| Tests | vitest, @testing-library/react, fake-indexeddb, playwright, @axe-core/playwright |
| Lint | eslint, typescript-eslint, prettier |
| Hosting | Cloudflare Pages (static), Supabase free plan (shares and usage counts only) |

Check each package's license before you add it. Record every license in `docs/licenses.md`.

---

## 7. Editor

### Layout

Binder on the left, manuscript in the center, side panel on the right (Notes, AI, Comments, Craft). The writer can collapse each column. Focus mode hides all columns with a crossfade. The manuscript column is 68 characters wide by default, and the writer can change it.

### Document schema

- Prose items use paragraphs, headings (levels 2 and 3), block quotes, lists, bold, italic, underline, strikethrough, links and a scene-break node (shows as a centered "#").
- Poem items use custom nodes:
  - `stanza`: block node, content `poemLine+`.
  - `poemLine`: block node, content `inline*`, ProseMirror `whitespace: 'pre'`, attribute `hanging` (number of em units, default 0). Render with `white-space: pre-wrap`, `padding-left: <hanging>em` and `text-indent: -<hanging>em`.
- Marks:
  - `privateName` with attribute `personId` (memoir only).
  - `aiOrigin` with attributes `provider`, `model`, `createdAt` (Co-writer mode only).
  - `comment` with attribute `threadId` (reader comments pulled into the draft).

### Poem keys

- Tab inserts 4 spaces in a poem line (configurable). Shift-Tab removes up to 4 leading spaces.
- Enter starts a new `poemLine`. Enter on an empty line, or Mod-Enter, starts a new `stanza`.
- A toolbar control sets the hanging indent of the current line.
- Pasting plain text into a poem keeps every space and splits stanzas at blank lines.

### Writing aids

- Autosave: Yjs writes to IndexedDB on each change. Show a small check mark that draws itself (DrawSVG) 600 ms after typing stops.
- Word count in the footer updates after a 600 ms pause, with an odometer roll.
- Typewriter scrolling (current line at the vertical center) and focus-line dimming (other blocks at 40% opacity) use ProseMirror decorations.
- Snapshots: automatic every 10 minutes of active editing, and on demand with a label. The history panel shows a word-level diff (jsdiff) and a Restore button.
- Session timer: a ring fills over the chosen time. At the end it asks "Close the session?". No penalty applies.
- Command menu (Mod-K): jump to any item, run any action, search text (MiniSearch).

### Performance rule

No animation library code runs while the writer types. Keystroke to screen must stay under 50 ms at the 95th percentile in a 100,000-word project. Load only the open item's Yjs document.

---

## 8. Template views

### 8.1 Novel: Story Board and Plot Grid

- An infinite canvas of index cards. Pan with drag or two fingers, zoom with wheel or pinch (use-gesture). Render cards as DOM elements with CSS transforms.
- Cards drag with inertia (Draggable plus InertiaPlugin) and snap to an 8 px grid.
- The writer links cards with threads. Threads draw as SVG curves and redraw as cards move. Each thread has a name and a color.
- Each card can link to a binder item. Double-click a linked card: the view zooms into the card, then a shared-element transition opens that scene in the editor.
- Plot Grid view: rows are chapters, columns are threads, cells hold scene cards. The board-to-grid switch animates with Flip.
- Accessibility: a List view shows the same cards in a sortable list, usable by keyboard and screen readers.

### 8.2 Memoir: Memory Timeline, People and aliases

- A horizontal track with life stages as colored bands and memories as cards placed by date. Vertical wheel scroll moves the track sideways. Drag moves a memory to a new date.
- A "By time / By theme" toggle regroups cards into theme columns with Flip. The card count stays the same.
- People panel: the writer adds a person with name variants and an alias for each variant (for example "Aunt Rosa" to "Aunt Maria" and "Rosa" to "Maria").
- The writer can select text and mark it as a person, or click "Mark all" to mark every exact match.
- Shared copies, exports and AI requests replace every marked range with its alias. They also replace any unmarked exact match of a real-name variant, longest variant first, and the app warns the writer that it found unmarked names.
- A "Show aliases" switch previews the aliased text in the editor without changing it.

### 8.3 Poetry: Collection Sequencer and Craft panel

- Poems show as cards. The poet creates named orders ("Chapbook", "Contest"). Each order is independent.
- Reorder with spring animation (dnd-kit sortable). A ring carousel previews the current order.
- Craft panel (off by default, runs in a Web Worker):
  - Syllable count at the end of each line (CMU dictionary, `syllable` package for unknown words).
  - Stress marks (˘ for unstressed, / for stressed) above syllables, from CMU stress digits.
  - Rhyme letters (A, B, C) at line ends. Two lines rhyme when their CMU phones match from the last stressed vowel to the end.
  - Labels fade in with a short stagger.

### 8.4 All templates

- Submissions tracker: a sortable table. A status change animates the row color.
- Progress: one tile per item, colored by status. Tiles enter with a mosaic stagger from the center. Total words and session counts use counting numbers. Goals and streaks are off by default. Rest days keep a streak.
- Ambient sound: rain, café and fireplace loops made with the Web Audio API (filtered noise). Off by default.

---

## 9. Export and backup

Run all export work in `export.worker.ts`. Embed fonts in PDF and EPUB from TTF or OTF files in `public/fonts/` (all fonts use the SIL Open Font License).

| Format | Rules |
| --- | --- |
| DOCX (docx package) | Keep every space in text runs (xml:space preserve). Map `hanging` to paragraph indentation with a hanging value. Map stanza breaks to an empty paragraph. Map scene breaks to a centered "#". |
| PDF (pdf-lib) | Lay out text yourself: measure each line with the embedded font, wrap long lines under their hanging indent, keep leading and internal spaces. Add page numbers. |
| EPUB 3 (jszip) | Write `mimetype` first and uncompressed. Use XHTML with `white-space: pre-wrap` on poem lines and replace leading spaces with no-break spaces. Include a nav document and embedded fonts. |
| Markdown | Replace each leading space in a poem line with U+00A0. End each poem line with a backslash hard break. Separate stanzas with a blank line. |
| Standard manuscript format (novels) | 12 pt, double spacing, 1 inch margins, header with surname, short title and page number, first page with name, contact line, word count rounded to the nearest 1,000, chapter starts one third down the page, scene breaks as "#". |
| Provenance report (Co-writer projects) | Optional appendix that lists the share of AI-origin characters per item and in total. |

Every export applies private-name aliases when the writer picks "Share-safe export" (default on for memoir).

### Backup

- Full-project backup: one `.vlo.zip` file with `project.json` (all Dexie rows for the project), one `items/<id>.yjs` per item (Yjs update), one `items/<id>.md` per item (readable copy) and `snapshots/` (Yjs updates).
- Import creates a new project, or replaces an existing project with the same id after a confirm.
- Show the last backup date on every project card. After 7 days without a backup, show a reminder.
- Request persistent storage with `navigator.storage.persist()` when the writer creates the first project. Show the result and the storage estimate in Settings.
- On Safari, show steps to install Vlo as a web app, because Safari can delete site data after 7 days without a visit.
- F29 (Chromium only): the writer picks a folder with `showDirectoryPicker`. Vlo writes the backup zip and Markdown copies there after each session.

---

## 10. AI modes

The AI mode is a project setting. A mode badge shows on every project screen. The badge icon morphs between a pen, an eye and two pens (MorphSVG). A change away from Pen needs a confirm dialog that explains what will change.

| | Pen | Reader | Co-writer |
| --- | --- | --- | --- |
| AI code loaded | None | Lazy chunk | Lazy chunk |
| Can AI text enter the manuscript | No | No | Yes, only on request, always marked with `aiOrigin` |
| Actions | None | Feedback on an item, Ask the manuscript, Summarize for synopsis, Suggest tags or themes, Continuity check (names, dates, places) | All Reader actions, plus Continue (50 to 300 words), Rewrite selection, Three alternatives, Brainstorm (side panel only) |

### Engines

1. **In-browser (default):** WebLLM. Check `navigator.gpu` first. Read the current prebuilt model list in WebLLM and offer two small instruct models (about 1 to 3 billion parameters, 4-bit). Show download size and progress. Log the model download in the network log.
2. **Your own key:** adapters for OpenRouter, Groq and Google Gemini (OpenAI-compatible chat endpoints) and Anthropic (Messages API with the `anthropic-dangerous-direct-browser-access: true` header). Fetch the provider's model list when possible, and let the writer pick a model.
3. **Local server:** Ollama (`http://localhost:11434/v1`) and LM Studio (`http://localhost:1234/v1`). Show setup help for allowing the app origin (for example the `OLLAMA_ORIGINS` setting).

Test every preset from a browser. If a provider blocks browser requests (CORS), show a clear message and mark that preset as unavailable. Do not add a proxy server.

### Trust rules

- Before each request, a "What will be sent" drawer shows the exact text, the destination host and an estimated token count. The writer can turn the drawer off after the first time.
- In memoir projects, `aliasAiRequests` is on by default. Requests carry aliases, never real names.
- Before the writer saves a key for a free tier, show that provider's data terms in plain words and require a checkbox. For the Gemini free tier, state that Google can use the content to improve its products and that human reviewers can read it.
- On HTTP 429, show the limit message. Do not retry in a loop.
- Keys stay in memory for the session by default. Optional storage encrypts keys with a passphrase (Web Crypto: PBKDF2 with SHA-256 and 600,000 iterations, then AES-GCM 256).

### Prompts (starting point, tune with tests)

Reader system prompt:

```
You are a careful, honest reader of a writer's work in progress. Give observations and questions, never replacement text. Do not rewrite sentences. Quote at most 12 words from the text when you point at a passage. Be specific: name the passage, say what you noticed and why it matters to a reader. Order your notes from most to least important. Keep the whole answer under 250 words unless the writer asks for more.
```

Co-writer system prompt:

```
You help a writer draft. Match the writer's voice, tense, point of view and style from the context. Write only what the writer asked for, with no preamble and no notes. Do not continue past the requested length. Do not resolve plot points the writer has not set up.
```

### Network module

- `src/lib/net.ts` exports `vloFetch(url, { purpose, body, ... })`. It is the only code that may call `fetch`.
- Add an ESLint `no-restricted-globals` rule for `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` everywhere except `net.ts`.
- Every call writes a `NetworkLogEntry`. The `/network` page lists them, newest first, with a "0 requests" state that names the current mode.

### AI policy page

`/ai-policy` states, with a version number and date:
- Vlo trains no model on writer text.
- No Vlo server receives manuscript text.
- Pen mode loads no AI code and sends nothing.
- When the writer uses a provider key, the provider's terms apply, and the app shows those terms first.

---

## 11. Sharing (Supabase, free plan)

Read-and-comment links for beta readers and editors. Readers cannot edit.

### Flow

1. The writer picks items and an expiry (1, 7, 14 or 30 days).
2. The app builds a share bundle (aliased if memoir), as JSON with the text and poem layout.
3. The app makes a random AES-GCM 256 key and a random 12-byte IV, and encrypts the bundle.
4. The app makes a random 32-byte owner token and calls `create_share`. The server stores only the ciphertext and a hash of the owner token.
5. The link is `https://<app>/r/<shareId>#k=<base64url key>`. Browsers never send the fragment to a server.
6. Readers decrypt in the browser. Readers write comments, which the app encrypts with the same key before upload.
7. The writer revokes a link with the owner token.

### Migration `supabase/migrations/0001_shares.sql`

```sql
create extension if not exists pgcrypto with schema extensions;

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_token_hash text not null,
  payload text not null,
  iv text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked boolean not null default false
);

create table public.share_comments (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.shares(id) on delete cascade,
  payload text not null,
  iv text not null,
  created_at timestamptz not null default now()
);

alter table public.shares enable row level security;
alter table public.share_comments enable row level security;
-- No policies: the anon role cannot read or write tables directly.

create or replace function public.create_share(p_payload text, p_iv text, p_owner_token text, p_days int)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if length(p_payload) > 2800000 then raise exception 'payload too large'; end if;
  if p_days not in (1, 7, 14, 30) then raise exception 'bad expiry'; end if;
  insert into shares (owner_token_hash, payload, iv, expires_at)
  values (encode(extensions.digest(p_owner_token, 'sha256'), 'hex'), p_payload, p_iv, now() + make_interval(days => p_days))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.get_share(p_id uuid)
returns table (payload text, iv text, expires_at timestamptz, status text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select case when s.revoked or s.expires_at < now() then null else s.payload end,
         case when s.revoked or s.expires_at < now() then null else s.iv end,
         s.expires_at,
         case when s.revoked then 'revoked' when s.expires_at < now() then 'expired' else 'ok' end
  from shares s where s.id = p_id;
end $$;

create or replace function public.revoke_share(p_id uuid, p_owner_token text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  update shares set revoked = true
  where id = p_id and owner_token_hash = encode(extensions.digest(p_owner_token, 'sha256'), 'hex');
  return found;
end $$;

create or replace function public.add_comment(p_share_id uuid, p_payload text, p_iv text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if length(p_payload) > 20000 then raise exception 'comment too large'; end if;
  if not exists (select 1 from shares where id = p_share_id and not revoked and expires_at > now()) then
    raise exception 'share unavailable';
  end if;
  if (select count(*) from share_comments where share_id = p_share_id) >= 500 then
    raise exception 'comment limit reached';
  end if;
  insert into share_comments (share_id, payload, iv) values (p_share_id, p_payload, p_iv) returning id into v_id;
  return v_id;
end $$;

create or replace function public.list_comments(p_share_id uuid)
returns table (id uuid, payload text, iv text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select c.id, c.payload, c.iv, c.created_at from share_comments c
  join shares s on s.id = c.share_id
  where c.share_id = p_share_id and not s.revoked
  order by c.created_at;
$$;

create or replace function public.ping() returns int language sql as $$ select 1 $$;

revoke all on function public.create_share, public.get_share, public.revoke_share,
  public.add_comment, public.list_comments from public;
grant execute on function public.create_share, public.get_share, public.revoke_share,
  public.add_comment, public.list_comments, public.ping to anon;
```

### Migration `supabase/migrations/0002_usage.sql` (F30)

- Table `usage_reports (id uuid, week text, app_version text, report jsonb, created_at timestamptz)` with row level security and no policies.
- Function `submit_usage(p_week text, p_app_version text, p_report jsonb)`, security definer. It rejects reports over 4 KB and rejects any key outside this allowlist: `templates_used`, `words_added_band`, `poems_added_band`, `features_used`, `ai_mode_counts`, `error_codes`.
- Bands: `0`, `1-249`, `250-999`, `1000-4999`, `5000+`.
- The app shows the exact JSON to the writer before each weekly send.

### Free plan care

- Free Supabase projects pause after 7 days without activity. Add `.github/workflows/keepalive.yml`, which calls `ping()` every 3 days.
- Add a scheduled cleanup that deletes shares 30 days after expiry (pg_cron if available, otherwise a GitHub Action that calls a cleanup function with the service key stored as a repository secret).
- The local copy is always the main copy. The share panel says so.

---

## 12. Security, privacy, performance and accessibility

### Content Security Policy (`public/_headers` for Cloudflare Pages)

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; worker-src 'self' blob:; connect-src 'self' https://openrouter.ai https://api.groq.com https://generativelanguage.googleapis.com https://api.anthropic.com http://localhost:11434 http://localhost:1234 https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com https://<SUPABASE_REF>.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cross-Origin-Opener-Policy: same-origin
```

Load WebLLM in the browser and read the console for CSP violations. Add only the hosts that WebLLM needs, and record them in an ADR. Custom AI endpoints outside this list are not possible with a strict CSP. Record that decision in an ADR.

### Privacy

- No third-party scripts, analytics, fonts or tracking pixels.
- `Referrer-Policy: no-referrer`, so share links never leak in referrer headers.
- `/privacy` lists every piece of data that can leave the device and when.

### Performance budgets

| Measure | Budget |
| --- | --- |
| Initial JavaScript (gzip), without lazy chunks | Under 250 KB |
| Largest Contentful Paint, Library, mid-range phone | Under 2.5 s |
| Interaction to Next Paint, all screens | Under 200 ms |
| Keystroke to screen, 95th percentile, 100,000-word project | Under 50 ms |
| Open a 10,000-word item | Under 300 ms |
| Export a 100,000-word novel to DOCX | Under 10 s, without blocking the main thread |

Lazy chunks: AI (WebLLM and adapters), sharing (Supabase), export, craft panel, board, timeline, ambient sound.

### Accessibility

- WCAG 2.2 AA in all themes.
- Full keyboard use for the binder, board (List view), timeline, sequencer and every dialog.
- Visible focus rings. Live regions for save status, export status and AI status.
- Run axe in Playwright on every route. Zero serious or critical issues.

### Browser support

Current and previous major versions of Chrome, Edge, Firefox and Safari, on desktop and phone. In-browser AI runs only where WebGPU works.

---

## 13. Design system and motion

Vlo's app must match the marketing site's brand.

- **Fonts:** Fraunces (display headings, uses the wght, opsz and SOFT axes), Newsreader (manuscript text), Inter (interface), JetBrains Mono (counters, logs, word counts).
- **Themes:** define all colors as CSS variables on `:root`. Follow the system color scheme by default.
  - Ink (dark): background #0E0D0C, surface #171513, text #EFE8DC, muted #8C857A, rule #2A2724, accent #E0664B.
  - Paper (light): background #F5F1E8, surface #FBF8F2, text #1C1A17, muted #6B655C, rule #E2DCCF, accent #C8452D.
  - Sepia: background #EFE3CC, text #3A2E22, accent #A8432A.
- **Shape:** 10 px card corners, 1 px rules, soft shadow only on hover, no gradients on interface surfaces.
- **Texture:** 4% film grain (SVG feTurbulence) on the Library and the onboarding only. Never in the editor.
- **Motion tokens:** reveals use ease "power3.out", 0.4 s to 0.9 s. Interface springs use stiffness 300 and damping 30.
- **Layout:** works at 360 px width with a 16 px side gutter and no horizontal page scroll.

### Motion map (app only)

| Surface | Effects | Fallback |
| --- | --- | --- |
| Onboarding | Three gated steps, hold-to-confirm ring ("Hold to open your first page"), zoom-through into the editor (View Transitions API) | Plain buttons, crossfade |
| Library | Bento stagger on load, grid-to-list Flip, card-to-project shared-element growth (Motion layoutId), "New project" button morphs into a modal with three template cards in a fan | Instant changes |
| Editor | Save check-mark draw, word-count odometer after a typing pause, circular theme reveal | No animation |
| Story Board | Inertia drag, thread line draw, zoom into a card | Drag without inertia, instant zoom |
| Memory Timeline | Sideways track, Flip regroup | Static horizontal list |
| Sequencer | Spring reorder, ring carousel preview | Plain list |
| Progress | Mosaic tile stagger, counting numbers | Static tiles |
| AI mode badge | Icon morph | Instant swap |
| Craft panel | Label stagger | No animation |

Use `anthropic-skills:frontend-design` for the visual pass and `anthropic-skills:impeccable` for the audit at the end of Phases 1, 3 and 6.

---

## 14. Build phases

Each phase ends with a gate. Do not start the next phase until the gate passes and I approve the pull request.

### Phase 0: Foundation

1. Create the Vite React TypeScript project with strict settings, Tailwind, shadcn/ui, React Router, ESLint (with the network rule), Prettier.
2. Add design tokens, the three themes, self-hosted fonts, Calm mode and reduced-motion handling (F08).
3. Add the app shell, route skeleton, error boundaries and a 404 page.
4. Add vite-plugin-pwa with an offline app shell and a manifest (F09).
5. Add `public/_headers` with the CSP from section 12.
6. Add Vitest, Playwright and axe. Add GitHub Actions CI: typecheck, lint, unit tests, Playwright, bundle-size check.
7. Add `docs/STATUS.md`, `docs/adr/0001-local-first.md` and `docs/licenses.md`.
8. Deploy a preview to Cloudflare Pages (ask me for account access first).

**Gate 0:** CI passes. The app installs and opens offline. Initial JavaScript is under 250 KB. axe finds zero serious issues.

### Phase 1: Core writing

1. Dexie schema, Yjs document loader, fractional ordering, word counts (unit tests first).
2. Library with project cards, create, rename, delete (with confirm), and template choice (F03).
3. Onboarding (F13) with Pen mode preselected.
4. Binder with drag reorder by mouse, touch and keyboard, item status and synopsis (F02).
5. Editor with prose schema, poetry nodes, poem keys and paste rules (F01).
6. Autosave, save indicator, word count, persistent storage request (F04).
7. Snapshots with diff and restore (F05).
8. Focus tools, command menu and session timer (F10, F11).
9. Library and onboarding motion from section 13.

**Gate 1:** US02, US03, US14 and US15 pass. Poem round-trip test passes (save, reload, compare every character). The 100,000-word performance test passes.

### Phase 2: Export and backup

1. Share-safe text pipeline (aliases applied in one tested function in `lib/privacy.ts`).
2. Markdown, DOCX, EPUB and PDF exporters in a worker (F07). Run them in parallel subagents if useful (`superpowers:dispatching-parallel-agents`).
3. Standard manuscript format for novels.
4. Full-project backup and import, backup reminder, Safari install steps (F06).
5. Folder save for Chromium (F29), if time allows.

**Gate 2:** US01 and US04 pass. The export fidelity suite passes at 100%. Open each export in a reader (Word or LibreOffice, a PDF viewer, an EPUB reader) by script where possible, and check the poem fixture by eye with screenshots. Use `anthropic-skills:docx` and `pdf-reading` to inspect the generated files.

### Phase 3: Template views

1. Story Board, threads, card links, zoom into scene, Plot Grid, List view (F15, F14).
2. Memory Timeline, life stages, theme regroup (F16).
3. People, aliases, marking, "Mark all", alias preview (F17).
4. Collection Sequencer with named orders and ring preview (F18).
5. Craft panel in a worker (F19).
6. Submissions tracker (F20).
7. Progress map, goals and streaks with rest days (F21).
8. Ambient sound (F22).

**Gate 3:** US05, US06, US07 and US08 pass. The private-name leak test passes for every export format. Touch pan and pinch work on the board at 390 px width. axe passes on every new route.

### Phase 4: AI modes

1. Network module, network log page, ESLint rule active (F25).
2. Mode setting, badge morph, confirm dialog (F23).
3. Engine layer with one interface: `generate({ system, messages, maxTokens, signal }) => AsyncIterable<string>`. Adapters: WebLLM, OpenAI-compatible, Anthropic, Ollama, LM Studio (F24).
4. Key storage in memory and optional encrypted storage. Free-tier terms dialog.
5. Reader actions with the "What will be sent" drawer. Memoir requests use aliases.
6. Co-writer actions with `aiOrigin` marks, show-hide control and the provenance report (F26).
7. `/ai-policy` page.

**Gate 4:** US09, US10 and US11 pass. A Playwright test proves that Pen mode loads no AI chunk. A test proves that a memoir AI request body contains no real-name variant.

### Phase 5: Sharing and usage counts

1. Supabase migrations, typed client, lazy chunk.
2. Crypto module (`lib/crypto.ts`) with round-trip tests and tamper tests (a changed byte must fail to decrypt).
3. Share panel: create, list, copy, expiry, revoke (F27).
4. Reader view with comments, built for phones (F28).
5. Opt-in usage counts with preview and consent (F30).
6. Keepalive and cleanup workflows.

**Gate 5:** US12 and US13 pass. A test proves that the Supabase request body contains only ciphertext and never the key. Run a security review of the share flow with `superpowers:requesting-code-review`, and fix every high finding.

### Phase 6: Hardening and launch

1. Full accessibility pass on every route.
2. Performance pass against every budget in section 12.
3. Safari storage test plan in `docs/safari-storage-test.md` (14 days, installed and not installed). I run it by hand. You write the steps and the result template.
4. `/privacy` page, Help page with support links for writers who work on painful material.
5. README for contributors and a user guide.
6. `anthropic-skills:improve-codebase-architecture` review, then fix the top findings.
7. Production deploy (ask me first).

**Gate 6:** Every user story passes in CI. Every budget passes. I approve the release.

---

## 15. Tests and fixtures

### Guardrail tests (run on every build)

| Test | Pass condition |
| --- | --- |
| Pen-mode requests | 0 requests to any origin other than the app during a 60 s scripted session, and 0 entries in the network log |
| Export fidelity | The poem fixture keeps every leading space, internal space, hanging indent and stanza break in DOCX, PDF, EPUB and Markdown |
| Private-name leaks | No real-name variant appears in any share bundle, export or AI request body built from the memoir fixture |
| Backup round trip | Export then import gives byte-identical item text and identical metadata |
| Crypto | Round trip works; a changed ciphertext byte or a wrong key fails |
| Performance | 100,000-word fixture meets the keystroke and open budgets |

How to check export fidelity:
- DOCX: unzip and read `word/document.xml`. Compare the text of each paragraph to the fixture line, character by character.
- EPUB: unzip and parse the XHTML. Compare text after converting no-break spaces back to spaces.
- Markdown: render with markdown-it, then compare the rendered text.
- PDF: extract text with positions (pdf.js in Node). Check each line's text and check that each line's x position matches its indent within 0.5 pt.

### Fixture: poem (`tests/fixtures/poem.txt`)

```
Salt on the sill.
    The tide goes out
        and takes the porch light with it,
            one board at a time.

I keep    the kettle    warm
for no one, and the no one
    drinks it slowly.

The long line runs past the right margin on purpose and must wrap under its own hanging indent without losing a single space.
```

The last line has `hanging = 4`.

### Fixture: memoir (`tests/fixtures/memoir.md`)

```
Aunt Rosa drove us to the coast in the summer of 1994. Uncle Teo stayed behind with the dog.
Rosa never said why. Years later, Teo told me it was the only time she ever left the city.
```

People: "Aunt Rosa" to "Aunt Maria", "Rosa" to "Maria", "Uncle Teo" to "Uncle Sam", "Teo" to "Sam".

### Fixture: novel (`tests/fixtures/novel/`)

Three chapters, two scenes each, a scene break inside one scene, two threads ("Mira's debt", "The lighthouse") and six board cards.

### Fixture generator

`tests/fixtures/generate-large.ts` builds a 100,000-word project with 40 chapters, 120 scenes and 30 poems from seeded random words.

---

## 16. Claude skills and tools to use

| When | Skill or tool | Use |
| --- | --- | --- |
| Start of each session | `superpowers:using-superpowers` | Find and load the right skills |
| Before Phase 0 | `anthropic-skills:grill-me` | Resolve the open questions in section 17 |
| Before each phase | `superpowers:brainstorming` | Explore any part of the phase that this spec leaves open |
| Before each phase | `superpowers:writing-plans` | Write `docs/plans/phase-N.md` |
| During each phase | `superpowers:executing-plans` or `superpowers:subagent-driven-development` | Work through the plan task by task |
| Independent tasks | `superpowers:dispatching-parallel-agents` | Build the four exporters, or the four template views, in parallel |
| All logic | `superpowers:test-driven-development` | Tests first |
| Any bug | `superpowers:systematic-debugging` | Find the cause before you change code |
| Before marking done | `superpowers:verification-before-completion` | Run tests and check in a browser |
| End of each phase | `superpowers:requesting-code-review`, then `superpowers:receiving-code-review` | Independent review, then careful fixes |
| Branches | `superpowers:using-git-worktrees`, `superpowers:finishing-a-development-branch` | Isolated work per phase, clean merge |
| All code | `anthropic-skills:karpathy-guidelines` | Small, surgical, verifiable changes |
| All code | `anthropic-skills:full-output-enforcement` | No placeholders or cut-off files |
| Interface | `anthropic-skills:frontend-design`, `anthropic-skills:ckmui-styling` | Visual direction, shadcn and Tailwind work |
| Interface audit | `anthropic-skills:impeccable` | Audit at the end of Phases 1, 3 and 6 |
| Export checks | `anthropic-skills:docx`, `pdf-reading` | Inspect generated DOCX and PDF files |
| After Phase 4 and in Phase 6 | `anthropic-skills:improve-codebase-architecture` | Find modules to simplify |
| End of each session | `anthropic-skills:handoff` | Write a handoff for the next session |

Tools:

- **Playwright** (pre-installed in the cloud workspace): end-to-end tests, screenshots, network capture for the Pen-mode test, axe checks.
- **Claude in Chrome** (if connected): manual checks in my real browser, such as PWA install and WebGPU behavior.
- **GitHub** (`gh` CLI): repository, branches, pull requests, Actions.
- **Supabase CLI** (`npx supabase`): migrations and local testing. Ask me for the project reference and keys. Never commit a service key.
- **Wrangler** (`npx wrangler pages deploy`): Cloudflare Pages deploys. Ask me before each production deploy.
- **Subagents**: use a separate review agent that has not seen the implementation for the security review in Phase 5 and the release review in Phase 6.

If a tool cannot reach a website because of the network allowlist, tell me. Do not try other ways around it.

---

## 17. Questions to ask me before Phase 0

Ask these with AskUserQuestion. Offer a recommended answer first in each.

1. **Repository:** Which GitHub repository should you use? (Recommended: a new empty repository named `vlo`, attached to this session.)
2. **License:** Should the code be open source? (Recommended: yes, AGPL-3.0, because open code lets writers check the privacy promises. Other options: MIT, or private.)
3. **Hosting:** Do I have a Cloudflare account and a domain for the app? (Recommended: Cloudflare Pages on a subdomain such as `app.<domain>`.)
4. **Supabase:** Should you create the Supabase project now or in Phase 5? (Recommended: Phase 5.)
5. **Phone drafting:** Full editing on phones, or reading and light edits? (Recommended: full editing, with the board and timeline in list form under 600 px.)
6. **AI presets:** Which bring-your-own-key providers should ship first? (Recommended: OpenRouter, Anthropic, Groq, Gemini, plus Ollama and LM Studio.)
7. **Manuscript font:** Which font should standard manuscript format use? (Recommended: an OFL serif such as Newsreader at 12 pt; Courier-style as an option.)
8. **Marketing site link:** What is the URL of the Lovable waitlist site?

---

## 18. Definition of done for version 1

- Every Must feature in section 3 works and has tests.
- Every user story test and guardrail test passes in CI.
- Every budget in section 12 passes.
- axe finds zero serious or critical issues on every route.
- `docs/STATUS.md`, the ADRs, `docs/licenses.md`, the README, the user guide, `/ai-policy` and `/privacy` are current.
- The production build is deployed after my approval.
