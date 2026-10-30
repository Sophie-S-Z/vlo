# Vlo: Build Prompt for Claude

This file is a complete build brief for Claude (best in Claude Code, with a GitHub repository). Save it in the repository as `docs/BUILD_PROMPT.md`. Then send Claude the kickoff message in section 0.

---

## 0. Kickoff message (paste this into Claude)

```
Read docs/BUILD_PROMPT.md in full before you do anything else. It is the complete spec for Vlo, a free, local-first creative writing web app with a landing page and waitlist.

Follow section 1 (working rules) and section 2 (skills and tools) for the whole project.
Start with Milestone M0 in section 22. Work through the milestones in order. Do not start a milestone until the gate of the one before it passes.
For each milestone: write a plan, implement it with tests, verify it, get a code review, record progress, and commit.
Ask me only for the items in section 3 (accounts and secrets) and for decisions that section 24 marks as mine. Make every other decision yourself, record it as an ADR in docs/adr/, and continue.
```

---

## 1. Your role and working rules

You are the lead engineer and designer for Vlo. You build the whole product: the marketing landing page with a waitlist, and the writing app itself.

1. Read this whole file first. Treat sections 4 to 21 as the spec and section 22 as the order of work.
2. Plan before you code. For each milestone, write `docs/plans/M<n>.md` with tasks, files, tests and the gate check.
3. Write tests first for every behavior that has an acceptance criterion in this file.
4. Verify before you claim success. Run the tests, the build and the gate checks, and read the output. Never report a step as done without evidence.
5. Keep changes small. One task per commit. Use clear commit messages.
6. Check current library docs before you use an API. TipTap, Motion, React Three Fiber, Lenis, WebLLM and Supabase change often. Use WebFetch on the official docs and check the installed version in package.json.
7. Use only free, open-source libraries and free service tiers. The project must cost $0 to build and to run at launch scale.
8. Do not add analytics, trackers or third-party scripts. Self-host all fonts.
9. Record each real decision as a short ADR in `docs/adr/NNNN-title.md` (context, decision, consequences).
10. Keep `docs/PROGRESS.md` current: milestone, finished tasks, open issues, next step. Update it after each task.
11. When your context gets long, write a handoff note (see section 23) so a fresh session can continue.
12. Never create accounts, enter real passwords or handle payment details. Ask the human for anything in section 3.

---

## 2. Skills, plugins and tools to use

Load a skill with the Skill tool when its moment comes. If a skill is not installed in your environment, follow the same practice by hand.

| When | Skill or tool | Why |
| --- | --- | --- |
| Start of each milestone | `superpowers:brainstorming`, then `superpowers:writing-plans` | Explore the design and write the milestone plan |
| Turning this spec into a task list | `prd-taskmaster` or `to-prd` | Break features into ordered, testable tasks |
| Stress-testing a risky design (encryption, storage, AI modes) | `thinking-partner` or `grill-me` | Find weak assumptions before you build |
| Implementing a plan | `superpowers:executing-plans` or `superpowers:subagent-driven-development` | Work task by task with checkpoints |
| Independent tasks in parallel (for example landing sections) | `superpowers:dispatching-parallel-agents`, Agent tool | Run separate tasks at the same time |
| Every feature and bug fix | `superpowers:test-driven-development` | Test first |
| Any failing test or odd behavior | `superpowers:systematic-debugging` | Find the root cause before a fix |
| Before you say "done" | `superpowers:verification-before-completion` | Evidence before claims |
| End of each milestone | `superpowers:requesting-code-review`, then `superpowers:receiving-code-review` | A fresh reviewer checks the work |
| Isolated feature work | `superpowers:using-git-worktrees`, `superpowers:finishing-a-development-branch` | Keep branches clean |
| Code quality | `karpathy-guidelines`, `improve-codebase-architecture` | Simple, testable code |
| Visual direction and UI polish | `frontend-design`, `impeccable`, `design-taste-frontend`, `high-end-visual-design` | Distinct, high-quality design |
| shadcn/ui and Tailwind work | `ckmui-styling` (ckm:ui-styling) | Accessible components and theming |
| UI and UX audit | `ui-ux-pro-max`, `impeccable` (audit mode) | Find usability and accessibility problems |
| Landing page copy | `humanize-writing` | Copy that reads as human-written |
| Long, complete code files | `full-output-enforcement` | No placeholders or cut-off files |
| Progress charts in the app | `dataviz` | Consistent chart design |
| Context reset | `handoff` | Pass the work to a fresh session |
| Visual QA in a real browser | Claude in Chrome (`chrome-browser` skill) or the built-in browser (`built-in-browser` skill, `preview_start`) | Look at the page, test scroll, drag and motion |
| Repetitive or broad code searches | Agent tool with the `Explore` agent | Search without filling your context |
| Architecture choices | Agent tool with the `Plan` agent | Second opinion on a design |
| Library documentation | WebFetch, WebSearch | Check current APIs |
| Git and pull requests | Bash with `git` and `gh` | Commits, branches, PRs, CI status |
| Task tracking | TaskCreate and TaskUpdate | Show progress to the human |

---

## 3. Human-only prerequisites (ask for these, do not create them)

Ask the human for these at the point you need them:

1. A GitHub repository with push access for you (M0).
2. A Cloudflare account with a Pages project connected to the repository (M0). Free plan.
3. A Supabase project on the free plan, plus its URL and anon key, stored as environment variables (M1). Never commit keys.
4. A domain name, if the human wants one (M6). Optional.
5. A reply-to email address for the waitlist consent line and the privacy policy (M1).

If an item is missing, continue with work that does not need it and list the item in `docs/PROGRESS.md`.

---

## 4. Product brief

Vlo is a free, local-first web app for creative writers: novelists, memoirists and poets, with equal priority. It keeps every manuscript on the writer's device. Writers pick one of three AI modes per project, and "Pen" mode (no AI) is the default. The landing page, onboarding, planning views and progress views use 3D, scroll motion and physics. The drafting screen stays calm. Version 1 serves a solo writer who shares drafts with beta readers and editors.

### Why (research evidence)

- Writers distrust AI and cloud storage. In a 2023 Authors Guild survey of 2,400+ authors, 96% said AI training on their work needs consent. NaNoWriMo lost board members and sponsors after its 2024 statement on AI and closed in 2025. Writers moved drafts out of Google Docs over training fears.
- Research on AI writing tools (Wordcraft 2022, CoAuthor CHI 2022, Metaphoria CHI 2019, Dramatron CHI 2023) shows that AI helps most as a source of questions and options. Full text generation weakens the writer's sense of ownership. Doshi and Hauser (Science Advances, 2024) found that AI ideas make stories more similar to each other.
- Novelists pay for separate planning, drafting and formatting tools. Scrivener has a steep learning curve and weak sync.
- Poets lose indents, hanging indents and stanza spacing in web editors.
- Memoir apps focus on family legacy and AI interviews. No private workspace exists for a hard, literary memoir, and writers fear that family members will read drafts.

### Objectives

| ID | Objective | Target |
| --- | --- | --- |
| O1 | Writers trust Vlo with private work | 80% of interviewed writers believe Pen mode sends no data |
| O2 | Writers never lose work | 0 confirmed data-loss reports |
| O3 | Each writer type finishes real work | 30% of activated writers reach 5,000 words or 10 poems in 30 days |
| O4 | Writers come back | 25% week-4 return rate |
| O5 | The experience feels premium and stays fast | SUS 75+; landing LCP under 2.5 s |

---

## 5. Principles and non-goals

### Principles

1. The editor is quiet. Motion lives around the writing, never inside it.
2. Manuscripts stay on the device. No Vlo server receives manuscript text.
3. Pen mode is the default. The writer turns AI on per project.
4. Every effect has a static fallback and obeys reduced-motion settings.
5. The product costs $0 to build and to run at launch scale.

### Non-goals for version 1

Real-time co-writing; native mobile apps (the web app installs as a PWA); user accounts and cloud sync of manuscripts; publishing, marketplace or social feed; paid plans or ads; screenwriting formats.

---

## 6. Users

| Persona | Job to be done | Must-win feature |
| --- | --- | --- |
| Nadia, novelist | Plan a plot, draft scenes in any order, send clean chapters to beta readers | Story Board linked to the binder; clean manuscript export |
| Marcus, memoirist | Shape memories into a book without the family seeing raw drafts | Private names with aliases; Memory Timeline; session timer |
| Ines, poet | Keep exact line layout and try many poem orders | Poetry-safe editor; Collection Sequencer |
| Theo, beta reader | Read a draft on any device and comment | Read-and-comment link in the browser, no account |

---

## 7. Architecture and stack

One static single-page app on Cloudflare Pages. All manuscript work runs in the browser. Data leaves the device only in three cases: AI requests that the writer sends on purpose, encrypted share copies, and opt-in usage counts with no text. Every outgoing request goes through one network module that writes a visible network log.

| Layer | Choice |
| --- | --- |
| App | React, Vite, TypeScript (strict), Tailwind, shadcn/ui, React Router |
| Editor | TipTap (MIT open-source extensions only) on ProseMirror |
| Document model | Yjs, one Y.Doc per item |
| Local storage | IndexedDB through y-indexeddb; project metadata in IndexedDB (idb or Dexie) |
| Motion | gsap with all free plugins (ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin, MorphSVGPlugin, Flip, Draggable, InertiaPlugin, MotionPathPlugin, Observer, CustomEase) and @gsap/react; motion (motion.dev); lenis |
| 3D | three, @react-three/fiber, @react-three/drei, @react-three/postprocessing, postprocessing |
| Physics | matter-js (lazy) |
| Drag and drop | @dnd-kit |
| In-browser AI | @mlc-ai/web-llm (lazy) |
| Export | docx (DOCX), print CSS or jsPDF (PDF), a client-side EPUB library, Markdown, JSZip (backups) |
| Poetry analysis | a CMU Pronouncing Dictionary package and a syllable counter (lazy) |
| Backend (waitlist, share links, opt-in counts only) | Supabase free plan, accessed only through security definer RPC functions |
| Tests | Vitest, Testing Library, Playwright, axe-core, Lighthouse CI |
| Fonts (self-hosted) | @fontsource-variable/fraunces, @fontsource-variable/inter, @fontsource/jetbrains-mono, @fontsource/newsreader |
| Dev tools | tweakpane (lazy, landing "Ink lab" only) |

### Routes

- `/` landing page and waitlist.
- `/app/*` the writing app. Hide it behind the build flag `VITE_APP_ENABLED` until launch. The landing page links to it only when the flag is on.
- `/share/:id` beta reader view (Milestone M5).
- `/privacy`, `/ai-policy`, and a physics 404 page.

---

## 8. Repository layout

```
src/
  app/            # writing app: routes, layout, panels
  landing/        # landing page sections and effects
  editor/         # TipTap setup, custom nodes and marks
  data/           # Yjs, IndexedDB, snapshots, backup, import
  export/         # docx, pdf, epub, markdown, manuscript format
  templates/      # novel board, memoir timeline, poetry sequencer
  ai/             # mode logic, engines, prompts, provenance
  net/            # the single network module and network log
  share/          # encryption, upload, reader view, comments
  gl/             # persistent canvas, particles, fluid, post-processing
  motion/         # GSAP and Motion helpers, Calm mode, reduced motion
  ui/             # shared components, tokens
supabase/migrations/
tests/e2e/        # Playwright
tests/fixtures/   # golden poems, memoir samples
docs/             # BUILD_PROMPT.md, PROGRESS.md, adr/, plans/, HANDOFF.md
```

---

## 9. Data model (on the device)

- **Project:** id, title, template (novel, memoir, poetry), aiMode (pen, reader, cowriter), theme, createdAt, lastBackupAt.
- **Item:** id, projectId, type (chapter, scene, memory, poem), title, status (idea, draft, revised, done), Y.Doc reference, order per sequence.
- **Sequence:** id, projectId, name, ordered itemIds. Poetry projects can hold many sequences.
- **Snapshot:** id, itemId, Yjs state update, createdAt, label.
- **Card and Thread:** Story Board objects; a card links to an item; a thread links two cards.
- **Memory fields:** date or date range, lifeStage, themes[].
- **Person:** id, projectId, realName, alias.
- **Submission:** piece, venue, sentDate, status, replyDate, notes.
- **Share:** id, itemIds, expiresAt, revoked, ownerSecret (kept on the device only), keyFragment (kept on the device only).
- **AI settings:** engine, model, provider preset, key (memory only by default; optional AES-GCM encrypted storage with a PBKDF2 passphrase).

---

## 10. Feature requirements

Priorities use MoSCoW. Each requirement is a test target.

| ID | Feature | Priority | Milestone | Testable requirement |
| --- | --- | --- | --- | --- |
| F01 | Poetry-safe editor | Must | M2 | Leading spaces, hanging indents and stanza breaks stay exact after save, reload and every export |
| F02 | Binder with drag reorder | Must | M2 | Reorder by mouse, touch or keyboard; order stays after reload |
| F03 | Templates: Novel, Memoir, Poetry Collection | Must | M2 | Each template shows only its own item names and views |
| F04 | Local storage and autosave | Must | M2 | Text saves within 1 s after typing stops; app works offline |
| F05 | Snapshots and restore | Must | M2 | Auto snapshot every 10 minutes; diff view; restore in 2 clicks; restore first saves the current text as a snapshot |
| F06 | Full-project backup and import (.zip) | Must | M2 | Export then import gives an identical project; reminder after 7 days without backup |
| F07 | Export DOCX, PDF, EPUB, Markdown | Must | M2 | Standard manuscript format for novels (12pt, double spacing, name and page header); poems keep layout |
| F08 | Calm mode and reduced motion | Must | M1 | One switch turns off decorative motion, sound and WebGL; the system setting does the same |
| F09 | Installable PWA | Must | M2 | Installs on desktop and phone; opens offline |
| F10 | Focus tools | Should | M2 | Focus mode, typewriter scrolling, focus-line dimming, Ink, Paper and Sepia themes |
| F11 | Session timer | Should | M2 | Writer sets a time; gentle "Close the session?" prompt at the end; no penalty |
| F12 | Landing page with the signature effect | Must | M1 | Section 18 passes its checks; a static version shows when 3D cannot run |
| F13 | App onboarding | Must | M2 | 3 gated steps (writer type, AI mode, first project); Pen preselected; Skip always visible; hold-to-confirm "Hold to open your first page" |
| F14 | Shared-element transitions | Should | M2 | Project card grows into the project; board card grows into its scene |
| F15 | Story Board (novel) | Must | M3 | Infinite canvas; cards link to items; threads link cards; Plot Grid view of chapters against threads |
| F16 | Memory Timeline (memoir) | Must | M3 | Horizontal life-stage track; toggle groups by time or theme; card count stays the same |
| F17 | Private names (memoir) | Must | M3 | Every marked real name changes to its alias in every share and export |
| F18 | Collection Sequencer (poetry) | Must | M3 | Many named orders of the same poems; changing one order leaves the others unchanged |
| F19 | Craft panel (poetry) | Should | M3 | Syllable counts, stress marks and rhyme letters computed on the device; off by default |
| F20 | Submissions tracker | Should | M3 | Piece, venue, sent date, status, reply date |
| F21 | Progress map and goals | Could | M3 | Tiles by status; goals and streaks off by default; rest days keep a streak |
| F22 | Ambient sound | Could | M3 | Rain, café, fireplace generated with Web Audio; off by default |
| F23 | Three AI modes per project | Must | M4 | Pen loads no AI code; Reader output stays in the side panel; Co-writer marks AI text |
| F24 | AI engines | Must | M4 | WebLLM in the browser, own-key presets, local Ollama or LM Studio; free-tier data terms shown before a key works |
| F25 | Network log | Must | M4 | Lists every outgoing request (time, host, purpose, size); shows 0 in Pen mode |
| F26 | AI provenance report | Should | M4 | Export option lists the share of AI-origin text |
| F27 | Encrypted read-and-comment links | Must | M5 | Only ciphertext leaves the device; expiry date; revoke |
| F28 | Reader view with comments | Must | M5 | Opens in a phone browser with no install or account |
| F29 | Save to a local folder | Could | M5 | File System Access API; Chromium only; hidden where unsupported |
| F30 | Opt-in usage counts | Must | M3 | Off by default; weekly totals and error reports only; no text, titles or names; writer can view each report before it goes |

---

## 11. User stories (write these as Playwright or Vitest tests)

| ID | Story | Acceptance criteria |
| --- | --- | --- |
| US01 | Poet keeps indents | Given a poem with 3 indent levels and a hanging indent, when exported to each format, then every line keeps its indent |
| US02 | Text saves itself | Given the tab closes, when Vlo reopens offline, then all text typed more than 1 s before the close is present |
| US03 | Return to an earlier draft | Given 2+ snapshots, when one is picked, then changes show marked; restore saves the current text as a new snapshot first |
| US04 | Move to a new computer | Given a backup .zip, when imported in another browser, then items, order, notes and snapshots match |
| US05 | Board to scene | Given a card linked to a scene, when double-clicked, then the editor opens that scene in under 1 s |
| US06 | Hide real names | Given "Aunt Rosa" marked with alias "Aunt Maria", when shared or exported, then "Aunt Rosa" appears 0 times |
| US07 | Memories by theme | Given tagged memories, when "By theme" is on, then cards regroup and the count stays the same |
| US08 | Many poem orders | Given orders "Chapbook" and "Contest", when "Contest" is reordered, then "Chapbook" does not change |
| US09 | Proof of no AI | Given Pen mode, when the writer types for 10 minutes, then the network log shows 0 requests and no AI script loads |
| US10 | Feedback without insertion | Given Reader mode, when feedback is requested, then it shows in the side panel and no control inserts it into the manuscript |
| US11 | Know the provider terms | Given a free-tier key is pasted, when saved, then the data terms show and a checkbox must be ticked before the key works |
| US12 | Time-limited share | Given a link with a 14-day expiry, when opened on day 15, then the page says the link expired |
| US13 | Reader comments on a phone | Given a valid link, when opened in a phone browser, then the reader reads and comments with no account; the writer sees the comment next time the share panel opens |
| US14 | Still interface | Given reduced motion, when the landing page opens, then no 3D or scroll-linked animation plays |
| US15 | Fast start | Given the home page, when the visitor follows onboarding, then the first word is typed in under 2 minutes |
| US16 | Join the waitlist | Given a valid email, when the visitor holds "Hold to sign" for 1.2 s, then a row is saved and a ticket shows the position number |
| US17 | No duplicate sign-ups | Given an email already on the list, when it is submitted again, then no new row is created and the same position shows |

---

## 12. AI modes

| | Pen | Reader | Co-writer |
| --- | --- | --- | --- |
| What AI does | Nothing; no AI code loads | Feedback, questions, search, tags, summaries | Suggests text, rewrites and continuations only on request |
| Can AI text enter the manuscript? | No | No; output stays in the side panel | Yes; every AI span gets an `aiOrigin` mark the writer can show or hide |
| Default engine | None | WebLLM in the browser | Writer's own key or a local server |

Rules:

1. Ask for the mode in onboarding with Pen preselected. Set the mode per project. Changing away from Pen needs a confirm dialog.
2. Show a mode badge on every screen. The badge icon morphs on change (MorphSVG).
3. Load AI code with a dynamic import only after the writer turns on Reader or Co-writer. Add a test that fails if any AI module is in the initial bundle.
4. WebLLM: check `navigator.gpu` first. Read the current model list from `prebuiltAppConfig` and offer small instruct models (1B to 3B, q4f16). Show download progress. Suggest a key when the device cannot run a model.
5. Own-key presets (OpenAI-compatible): OpenRouter `https://openrouter.ai/api/v1`, Groq `https://api.groq.com/openai/v1`, Gemini `https://generativelanguage.googleapis.com/v1beta/openai/`. Local: Ollama `http://localhost:11434/v1`, LM Studio `http://localhost:1234/v1` (show CORS setup help).
6. Before a free-tier key works, show the provider's data terms in plain words. For the Gemini free tier, state that Google can use free-tier content to improve its products and that human reviewers can read it, and tell the writer not to send private text. Require a checkbox.
7. On HTTP 429, show the limit message. Never retry in a loop.
8. Reader mode prompt design: the AI asks questions and gives observations about pacing, clarity and consistency. It never returns replacement prose.
9. Publish `/ai-policy` with a version and date: Vlo trains no model on user text, and no Vlo server receives manuscript text.

---

## 13. Sharing (beta readers)

1. The writer picks items and an expiry date. The app builds a snapshot, applies private-name aliases, and encrypts it with AES-GCM (Web Crypto). The key is random per share.
2. Upload only the ciphertext to Supabase Storage through an RPC that returns a share id. The link is `/share/<id>#<key>`. Browsers never send the fragment to a server.
3. The device keeps an owner secret per share. Revoke and delete calls send a hash check of that secret.
4. Reader comments are encrypted with the same key before upload. The writer's app fetches and decrypts them when the share panel opens.
5. Expired or revoked links show a clear page.
6. Show a note in Settings: free Supabase projects pause after 1 week without activity; the local copy is always the main copy.
7. Add a Playwright test that inspects every request during a share and proves that no plaintext and no key leave the device.

---

## 14. Storage durability

Browsers can delete site data. Safari can clear script-written storage after 7 days without a visit unless the site is installed as a web app.

1. Call `navigator.storage.persist()` at the first project.
2. Show Safari users clear steps to install Vlo as a web app.
3. Show the last backup date on every project; remind after 7 days.
4. One-click full-project .zip backup.
5. Write a manual test checklist for Safari macOS and iOS over 14 days, installed and not installed, in `docs/qa/safari-storage.md`. The human runs it.

---

## 15. Security and privacy

1. Content Security Policy (meta tag): connect-src allows only self, the AI presets, localhost ports 11434 and 1234, the WebLLM model and runtime hosts (check current hosts in the WebLLM docs), and the Supabase project host.
2. No third-party scripts, fonts or analytics.
3. Keys stay in memory by default. Optional storage encrypts keys with a passphrase.
4. All Supabase tables have row level security with no direct anon access. All access goes through security definer RPC functions with input checks.
5. Opt-in counts: a random install id that resets every 30 days, word-count bands (never exact counts), feature-use flags, error codes. The writer can view the exact payload before each send.
6. Draft a privacy policy and terms in `docs/legal/` and mark both as needing human legal review.

---

## 16. Design system

- **Themes:** Ink (default for the landing page): background #0E0D0C, text #EFE8DC, muted #8C857A, accent #E0664B, ink-effect accent #5B6CFF. Paper (default for the app): background #F5F1E8, text #1C1A17, accent #C8452D. Night: background #121110, text #E8E2D6, accent #E0664B. Sepia: background #EFE3CC, text #3A2E22, accent #A8432A.
- Define all colors as CSS variables on `:root`. The theme switch uses a circular reveal from the toggle (View Transitions API with clip-path).
- **Type:** Fraunces (variable; wght, opsz, SOFT, WONK) for display; Newsreader for manuscript text; Inter for interface; JetBrains Mono for counters, logs and ASCII.
- **Texture:** 4 to 5% animated film grain on the landing page and the app Library only. Never in the editor.
- **Shape:** 10 px card corners, 1 px rules, soft shadow only on hover, no gradients on interface surfaces.
- **Motion tokens:** CustomEase "vlo" = 0.65, 0, 0.35, 1; reveals 0.6 to 1.2 s; interface springs stiffness 300, damping 30.
- **Layout:** works at 360 px with a 16 px gutter and no horizontal page scroll.

---

## 17. Motion map (writing app)

| Surface | Effects | Fallback |
| --- | --- | --- |
| Onboarding | Gated steps, hold-to-confirm ring, zoom-through transition into the editor | Plain buttons, crossfade |
| Library | Bento stagger, grid-to-list Flip, card-to-project shared element (layoutId), button-to-modal morph, fan of template cards | Instant change |
| Editor | Save check-mark draw, word-count odometer after a 600 ms pause, circular theme reveal. Nothing moves while the writer types | No animation |
| Story Board | Inertia drag, thread line draw, zoom into a card | Drag without inertia |
| Memory Timeline | Sideways track on vertical scroll, Flip regroup | Static list |
| Collection Sequencer | Spring reorder, ring carousel preview | Plain list |
| Progress | Mosaic tile stagger from the center, counting numbers | Static |
| AI mode badge | Icon morph | Instant swap |

Rule: no animation library code runs in the editor's typing path. Measure keystroke-to-paint in a 100,000-word project.

---

## 18. Landing page and waitlist (route `/`)

The landing page must feel like an Awwwards Site of the Day. Every effect must show something true about Vlo: words, ink, books, privacy, form.

### 18.1 Global systems

1. Lenis inertial smooth scroll synced to ScrollTrigger. Scroll-to-anchor glide for nav links.
2. A vermilion "ink line" under the nav fills with page progress.
3. A fixed corner page counter, "p. 01 / 10", in JetBrains Mono with an odometer roll. On the waitlist it reads "Last page".
4. Nav: logo morphs between a "V" and a pen nib on hover; links scramble letters on hover and draw an underline; nav hides on scroll down and returns on scroll up.
5. Custom cursor on fine pointers: dot and lagging ring; context labels ("Drag", "Open", "Hold"); blend-mode difference over large text.
6. Magnetic primary buttons with a duplicated-text roll, fill from the cursor entry point, and 0.97 press scale.
7. One persistent full-screen WebGL canvas behind the HTML. Pause when hidden. Cap DPR at 1.5.
8. Post-processing: light bloom, vignette, chromatic aberration that follows scroll velocity.
9. Scroll velocity skew on large section titles; particles stretch at high speed.
10. Sound only after the visitor chooses it, all generated with Web Audio (soft room tone, soft UI ticks, a paper sound on submit). The sound toggle shows four bars driven by an AnalyserNode; grain intensity follows the audio level a little.
11. Phones: gyroscope parallax after an "Enable motion" tap; fewer particles; horizontal track becomes a vertical stack.
12. Hidden "Ink lab": the "~" key opens a lazy-loaded Tweakpane panel for particle count, ink color, grain and bloom.
13. A "Calm" switch in the nav, plus prefers-reduced-motion, turns off Lenis, pinning, WebGL and sound. Sections stack with still SVG art.
14. All headline text exists as real HTML text.

### 18.2 Signature: the living text particle field

Instanced quads, each showing one glyph from an atlas (a to z, punctuation, accented letters): 12,000 on desktop, 3,000 on phones. Sample target points from canvas or SVG. Scroll scrubs the morph between shapes; each particle has a random delay and follows curl noise in transit. The camera follows the cursor a little.

Shapes in order: (1) the "Vlo" wordmark; (2) a loose cloud of words; (3) an open 3D book whose pages lift and fan apart; (4) three formations: a grid of scene cards, a curved ribbon, indented stanza lines; (5) a padlock; (6) a paper plane; (7) the wordmark again, drawn through an ASCII pass in the footer. Each shape has a still SVG fallback.

### 18.3 Sections (each is one "page")

- **p.00 Entry:** the logo draws itself while a percentage counter follows real asset progress; three text lines appear ("Every book starts as a mess." / "Pages everywhere." / "Let's put them in order."); buttons "Enter with sound" and "Enter in silence"; the loader splits open from the center. Skip link always visible. Repeat visits skip the lines.
- **p.01 Hero:** particles form "Vlo" and scatter around the cursor; a WebGL ink fluid simulation (port the MIT-licensed WebGL-Fluid-Simulation, 128 resolution, desktop only) leaves vermilion and indigo ink; headline line-mask reveal; rotating word; magnetic "Join the waitlist"; a rotating "write in flow" badge on a circular text path; a multilingual word band at 6% opacity (write, écrire, escribir, schreiben, scrivere, escrever, 書く, 写作, 쓰다, लिखना).
- **p.02 Manifesto:** scroll-scrubbed word fill; cursor-proximity Fraunces weight and SOFT on key words; "Your words stay yours." flies in from deep perspective.
- **p.03 The book opens:** pinned for about 4 screen heights; the particle book turns, opens and explodes into stacks; step captions (copy deck); ends in the three formations; a circle iris reveal changes Ink to Paper.
- **p.04 Three forms:** a pinned horizontal track with containerAnimation. Novel panel: six draggable index cards with inertia, threads redraw with DrawSVG, Grid/Board toggle with Flip. Memoir panel: underlined names scramble into aliases on hover or tap; a life-stage timeline draws itself. Poetry panel: an original poem types itself with exact indents and syllable counts; a "magnetic poetry" area of 30 word tiles under Matter.js physics (lazy) that visitors drag and throw; scroll speed changes gravity a little.
- **p.05 Privacy:** particles form a padlock; an odometer reads "0 requests"; a spring switch for Pen, Reader and Co-writer with a morphing badge; a flashlight reveal shows "Your drafts live on your device. No server reads them."
- **p.06 AI on your terms:** three cards with tilt, glare and cursor-following border glow; click opens a card-to-modal overlay (layoutId); fan carousel on phones.
- **p.07 Features bento:** batch reveal with curtain blocks. Tiles: snapshot slider through five versions; one poem morphing between DOCX, PDF, EPUB and Markdown labels with fixed layout; offline save with check draw; session timer ring; tile flip between Ink and Paper; manuscript map with mosaic stagger; copy link with check bounce; counting number to "$0".
- **p.08 First lines:** an endless, draggable, wrapping grid of public-domain first lines (list in section 20) with inertia; blank cards read "Your first line goes here" and zoom the grid into the card, which grows to full screen, then glide to the waitlist. Two velocity-reactive marquee rows run in opposite directions (sonnet, chapter, memory, villanelle, scene, draft, ghazal, prologue, letter, elegy, outline, epilogue); hover slows them.
- **p.09 FAQ:** accordion with smooth height animation (copy deck).
- **p.10 Waitlist:** particles form a paper plane; heading "Save your page."; email with floating label; "I write" segmented control (Novels, Memoir, Poetry, A bit of everything) with a sliding marker; optional "What slows you down when you write?" (280 characters); honeypot field; consent line. "Hold to sign" fills a ring over 1.2 s and reverses on early release; Enter submits at once for keyboard users. Success: the form folds like origami into a paper plane, flies off on a MotionPath curve with the particle plane, a ticket shows "You're writer #N on the Vlo list." with a drawn check, plus "Copy your invite link" (?ref=CODE). Errors shake gently. Use aria-live. Show "N writers are waiting" only when N ≥ 100.
- **Footer:** ASCII wordmark; "Write in flow." repeated-headline ticker; per-letter hover wave on the wordmark; links to Privacy, AI policy, Ink lab, theme, sound, Calm.
- **Other routes:** `/privacy` and `/ai-policy` use a staggered column wipe (five vermilion bars) with View Transitions where supported. The 404 page drops the letters of "This page isn't written yet" under Matter.js physics; visitors can drag and throw them.

### 18.4 Landing rules

- Never show fake numbers, users or reviews.
- Describe features as "coming" or "built for". Vlo is not available yet.
- If the frame rate drops under 40 fps for 2 seconds, halve particles and turn off the fluid simulation.
- LCP under 2.5 s on a mid-range phone, with the HTML headline as the LCP element. Lazy-load three, matter-js and tweakpane.

---

## 19. Supabase SQL (waitlist; add share and usage tables in M5 and M3)

```sql
create extension if not exists citext;

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  writer_type text check (writer_type in ('novels','memoir','poetry','mixed')),
  pain_point text check (char_length(pain_point) <= 280),
  ref_code text unique not null,
  referred_by text,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;
-- No policies: the anon role cannot read or write the table directly.

create or replace function public.join_waitlist(
  p_email text,
  p_writer_type text default null,
  p_pain_point text default null,
  p_referred_by text default null
)
returns table (out_place bigint, out_ref_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created timestamptz;
  v_code text;
begin
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;

  insert into public.waitlist (email, writer_type, pain_point, ref_code, referred_by)
  values (
    p_email,
    p_writer_type,
    left(p_pain_point, 280),
    substr(md5(random()::text || clock_timestamp()::text), 1, 10),
    left(p_referred_by, 20)
  )
  on conflict (email) do nothing;

  select w.created_at, w.ref_code into v_created, v_code
  from public.waitlist w
  where w.email = p_email::citext;

  return query
    select (select count(*) from public.waitlist w2 where w2.created_at <= v_created),
           v_code;
end;
$$;

create or replace function public.waitlist_count()
returns bigint
language sql
security definer
set search_path = public
as $$ select count(*) from public.waitlist; $$;

revoke all on function public.join_waitlist(text, text, text, text) from public;
revoke all on function public.waitlist_count() from public;
grant execute on function public.join_waitlist(text, text, text, text) to anon;
grant execute on function public.waitlist_count() to anon;
```

Client rules: reject the submit if the honeypot has text or if the form was filled in under 2 seconds. Check this SQL against the current Supabase docs, write it as a migration in `supabase/migrations/`, and test it with a local Supabase instance or a test project before the human applies it.

---

## 20. Copy deck

- **Tagline:** Write in flow.
- **Hero headline:** Write the book only you can write.
- **Rotating line:** A free, private studio for [novelists / memoirists / poets].
- **Hero note:** No AI unless you ask for it. Your drafts stay on your device.
- **Button:** Join the waitlist.
- **Manifesto:** Most writing apps were built for documents. Vlo is built for stories, memories and poems. It keeps every indent where you put it. It keeps the real names in your memoir private. It keeps your drafts on your own device. It costs nothing, and it writes nothing unless you ask.
- **Book captions:** 1. Every book starts as loose pages. 2. Vlo gives each form its own shape. 3. Novels get a living board. 4. Memoirs get a timeline of your life. 5. Poems keep every space where you put it.
- **Panel titles:** A board that thinks in scenes. / Real names stay private. / Every indent, kept.
- **Privacy:** Pen mode is the default. It sends nothing. Hidden line: Your drafts live on your device. No server reads them.
- **FAQ:** Is Vlo free? Yes, Vlo is free to use. / Does Vlo use AI? Only if you turn it on. Pen mode, the default, has no AI. / Where are my drafts stored? On your device. You can export a full backup at any time. / When does Vlo launch? The waitlist hears first. / Who is Vlo for? Novelists, memoirists and poets.
- **Waitlist:** Save your page. / Consent: We will only email you about Vlo. Unsubscribe any time.
- **Public-domain first lines (use only these):**
  - "Call me Ishmael." Herman Melville, Moby-Dick (1851)
  - "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife." Jane Austen, Pride and Prejudice (1813)
  - "It was the best of times, it was the worst of times," Charles Dickens, A Tale of Two Cities (1859)
  - "All happy families are alike; every unhappy family is unhappy in its own way." Leo Tolstoy, Anna Karenina (Constance Garnett translation, 1901)
  - "There was no possibility of taking a walk that day." Charlotte Brontë, Jane Eyre (1847)
  - "All children, except one, grow up." J. M. Barrie, Peter and Wendy (1911)
  - "Mrs. Dalloway said she would buy the flowers herself." Virginia Woolf, Mrs Dalloway (1925)
  - "In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since." F. Scott Fitzgerald, The Great Gatsby (1925)
  - "Whether I shall turn out to be the hero of my own life, or whether that station will be held by anybody else, these pages must show." Charles Dickens, David Copperfield (1850)
  - "You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings." Mary Shelley, Frankenstein (1818)
  - "I celebrate myself, and sing myself," Walt Whitman, Song of Myself (1855)
  - "Two roads diverged in a yellow wood," Robert Frost, The Road Not Taken (1916)

Polish all landing copy with the `humanize-writing` skill. Keep every claim true to section 4.

---

## 21. Test plan, guardrails and budgets

### Guardrail tests (run on every build in CI; a failure blocks the merge)

1. **Pen-mode requests:** Playwright opens a Pen-mode project, types for a simulated 10 minutes, and asserts 0 outgoing requests and no AI chunk loaded.
2. **Export fidelity:** golden poems in `tests/fixtures/` (3 indent levels, hanging indent, stanza breaks, leading spaces) export to DOCX, PDF, EPUB and Markdown. Parse each output and assert that the leading whitespace and line breaks match. Note: Markdown strips leading spaces; use non-breaking spaces or HTML line markup and document the choice in an ADR.
3. **Private-name leaks:** memoir fixtures with marked names; assert 0 real names in every share payload (before encryption) and every export.
4. **Share privacy:** intercept all requests during a share; assert no plaintext manuscript text and no key in any request.
5. **Bundle check:** the initial bundle contains no three, matter-js, tweakpane, web-llm or AI module code.

### Budgets

| Measure | Budget | Check |
| --- | --- | --- |
| Landing LCP (mid-range phone, 4G) | Under 2.5 s | Lighthouse CI |
| Interaction to Next Paint | Under 200 ms | Lighthouse CI, manual |
| Editor keystroke to paint, 100,000-word project | Under 50 ms at the 95th percentile | Playwright performance test |
| Initial JavaScript without 3D chunks | Under 250 KB gzipped | Build size check |
| Accessibility | WCAG 2.2 AA; 0 axe violations of serious or critical impact | axe in Playwright |
| Landing frame rate (mid-range laptop) | 60 fps target; guard at 40 fps | Manual and performance trace |

### Visual QA

After each landing or UI task, open the page in a browser (Claude in Chrome or the built-in browser). Check desktop and 360 px widths, both themes, reduced motion and Calm mode. Take screenshots into `docs/qa/screens/`.

---

## 22. Milestones (step by step)

For each milestone, follow this loop:

1. Load `superpowers:brainstorming`, then `superpowers:writing-plans`. Write `docs/plans/M<n>.md`.
2. Create tasks with TaskCreate.
3. Implement task by task with `superpowers:test-driven-development`. Use parallel subagents for independent tasks.
4. Run `superpowers:verification-before-completion`: tests, typecheck, lint, build, guardrails, budgets.
5. Run `superpowers:requesting-code-review` with a fresh subagent. Fix findings.
6. Do visual QA (section 21).
7. Update `docs/PROGRESS.md`, commit, push, and open a PR.
8. Check the gate. Report the result to the human with evidence.

### M0: Foundation

- Scaffold Vite, React, TypeScript (strict), Tailwind, shadcn/ui, React Router.
- ESLint, Prettier, Vitest, Testing Library, Playwright, axe-core, Lighthouse CI.
- GitHub Actions CI: lint, typecheck, unit tests, build, Playwright, guardrails, Lighthouse CI.
- Cloudflare Pages build settings and a preview deploy.
- Design tokens (section 16), self-hosted fonts, theme switch, Calm mode and reduced-motion provider.
- Routes from section 7 with placeholders. `VITE_APP_ENABLED` flag.
- `CLAUDE.md` with the working rules from section 1 and the principles from section 5. `docs/PROGRESS.md`. First ADRs (stack, local-first storage, landing first).
- **Gate:** CI green; preview URL loads; reduced motion and Calm mode toggle correctly.

### M1: Landing page and waitlist

Build the landing page first so the waitlist collects sign-ups during the build.

- **M1a:** all sections with copy and HTML-level effects (section 18.1 items 1 to 6, 9, 13 and 14; text reveals, scroll fill, cursor weight, vanishing-point line, marquees, bento demos, FAQ, card tilt and modals), still SVG art in place of particles, and the waitlist form with the Supabase migration and RPC calls.
- **M1b:** the persistent canvas, glyph particles and all morphs, hero ink fluid, post-processing, ASCII footer.
- **M1c:** horizontal track demos, privacy switch and flashlight reveal, first-lines infinite canvas with zoom.
- **M1d:** entry sequence, Web Audio sound, hold-to-sign, origami fold, plane flight, ticket card, route wipes, 404 physics, Ink lab, gyroscope parallax, frame-rate guard.
- **Gate:** US14, US16 and US17 pass; LCP and accessibility budgets pass; a real test sign-up returns a position; the human approves the look on desktop and phone.

### M2: Core writing

- F01 to F07, F09 to F11, F13, F14. Poetry-safe TipTap nodes (`stanza`, `poemLine`, indent and hanging-indent attributes). Yjs with y-indexeddb. Snapshots with diff. Backup and import. Exports with manuscript format. PWA with offline support. Focus tools. Onboarding. Library and transitions (section 17).
- **Gate:** US01 to US05 and US15 pass; export fidelity guardrail passes; keystroke budget passes; Safari storage checklist written for the human.

### M3: Template views and beta readiness

- F15 to F22 and F30. Story Board with list view for screen readers. Memory Timeline with list view. Private names. Collection Sequencer. Craft panel (lazy dictionary). Submissions tracker. Progress map. Ambient sound. Opt-in counts with payload preview and a Supabase RPC.
- **Gate:** US06 to US08 pass; private-name guardrail passes; accessibility budget passes on every view; the app is ready for a 15-writer closed beta.

### M4: AI modes

- F23 to F26, section 12. Network module and log (build it early in this milestone, since every other AI task uses it).
- **Gate:** US09 to US11 pass; Pen-mode and bundle guardrails pass; `/ai-policy` published.

### M5: Sharing

- F27 to F29, section 13. Supabase tables and RPCs for shares and comments, written as migrations. Reader view at `/share/:id`.
- **Gate:** US12 and US13 pass; share-privacy guardrail passes; a security review checklist in `docs/qa/share-security.md` is complete and marked for an independent human review.

### M6: Launch hardening

- Full accessibility audit (`impeccable` audit mode, `ui-ux-pro-max`). Performance pass. Privacy policy and terms drafts in `docs/legal/` (flag for legal review). README with setup steps. Turn on `VITE_APP_ENABLED` only after the human says so.
- **Gate:** every guardrail and budget passes; the human approves launch.

---

## 23. Progress tracking and handoff

- `docs/PROGRESS.md` holds: current milestone, done tasks with commit links, open issues, items waiting on the human, next step.
- When context gets long or a session ends, load the `handoff` skill and write `docs/HANDOFF.md`: what is done, what is in progress, exact next commands, known traps.
- A new session starts by reading `docs/BUILD_PROMPT.md`, `docs/PROGRESS.md` and `docs/HANDOFF.md`, in that order.

---

## 24. Decisions already made, and decisions for the human

### Already made (do not reopen without new evidence)

- Free, local-first, solo writer plus share links. No real-time co-writing in version 1.
- Three AI modes, Pen as default, free AI through WebLLM or the writer's own key.
- Stack as in section 7. Landing page before the writing app.
- Name: Vlo. Palette and type as in section 16.

### For the human (ask; until answered, use the default in brackets and record it)

1. Product owner and approvers [the human].
2. Trademark check for "Vlo" [proceed; flag in PROGRESS].
3. Open-source the code [keep the repo private; prepare a LICENSE choice in an ADR].
4. Phone drafting scope [full editing on phones, with a simplified binder].
5. Waitlist reply-to email [ask; block only the consent line].
6. Funding if share storage outgrows free plans [out of scope until usage data exists].
7. Legal review of privacy policy, terms, GSAP license scope and the CMU dictionary license [draft and flag].

### Research items the human runs (not code)

- Interview 5 novelists, 5 memoirists and 5 poets before M2 ends.
- Test the landing page with 10 visitors: pass mark 8 of 10 can name the three templates and the privacy promise.
- Run the Safari storage checklist.

---

## 25. Free-tier facts to respect (October 2026; recheck before use)

- Supabase free plan: 500 MB database, 1 GB file storage; projects pause after 1 week without activity; no automatic backups.
- Cloudflare Pages free plan: unlimited static requests and bandwidth; 500 builds per month per account.
- OpenRouter free models: 20 requests per minute and 50 per day (1,000 per day after a $10 lifetime credit purchase); failed requests count.
- Groq: about 30 requests per minute and 1,000 per day on current text models.
- Gemini API free tier: limits shown per project in AI Studio; Google can use free-tier content to improve its products, and human reviewers can read it.
- GSAP: all plugins free for commercial use since April 30, 2025, under the standard GSAP license.
