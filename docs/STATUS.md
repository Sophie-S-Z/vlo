# Vlo status

Last update: 2026-11-24

## Done

- Cleanup from the third code review (2026-11-24), the owner's choices D and F:
  - One label for reading times. The details panel and Insights both say "under 1 min" for a short text,
    "about 3 min", or "about 1 h 20 min". `durationLabel` in `src/lib/wordcount.ts` replaces the two copies.
  - The entries from before 2026-11-17 moved to `docs/history.md`.

- Sync files in Cloudflare R2, scaling fix 5 (2026-11-22, ADR 0014, `docs/files-setup.md`):
  - Research files, images and saved versions of sync go to an R2 bucket through a Cloudflare Worker
    (`workers/files`). Supabase keeps a short row for each, whose payload is the file's id. Rows blobs and
    chapter text stay in Supabase.
  - Migration 0018: `sync_put_file`, `sync_check` and `sync_files_known`. Each space has 200 MB of files,
    and all files stop at 9 GB. The 50 MB of a space and the 450 MB stop now count only data in Postgres.
  - The Worker deletes each hour the files that no row used for a day. A full store keeps a file on its
    device, and the text still syncs.
  - The app uses the store only when the build sets `VITE_FILES_URL`. Privacy page version 22.
  - Open: the owner runs migration 0018, then deploys the Worker. Then the Worker's address goes in `.env`
    and in the CSP. Files that are on the relay already stay there until they change.

- Sync and storage at scale on the free plan (2026-11-19):
  - Migration 0017: `sync_list` takes `p_seen`, the blobs of the 30-second read window that the device
    already has, and skips them. A check with nothing new now brings no payload. Before, each check
    downloaded the newest blob of the other devices again, twice. A read goes on only when the relay
    stopped it at 8 MB.
  - Migration 0017: 50 MB for each sync space (was 100 MB). New sync data stops for all spaces only when
    the whole database passes 450 MB (was a fixed 150 MB of sync in all).
  - A change syncs after 2 minutes (was 30 seconds). An open page checks every 60 seconds for 10 minutes
    after news from another device, then every 5 minutes. Focus and hide still sync at once.
  - Stored images: at most 1,600 px on the long side and JPEG at 80% (was 2,400 px and 85%, decision G2).
  - The owner page warns when the database passes 70% of the free 500 MB.
  - Apply migration 0017 to the live database before the app deploys. An older app still works with it.

- Polish pass from the product owner's design notes (2026-11-18):
  - Interface fonts: Familjen Grotesk for the interface, Newsreader for the headings as well as the text,
    and IBM Plex Mono 400 for code and keys. Inter, Fraunces and JetBrains Mono stay as writing fonts that
    load on first use. The service worker installs about 550 KB less font data.
  - Headlines grow with the window between two sizes (`text-title`, `text-hero`, `text-wordmark`), so they
    do not jump at a breakpoint.
  - Menus, popovers and dialogs keep their instant close. An exit animation keeps the old menu on the page
    for its length, and Radix gives focus back to its trigger only at the end. A second menu that opens in
    that time then loses the focus and closes.
  - The page reaches under a notch or a home bar (`viewport-fit=cover`), and the body and the bars at the
    bottom of the screen keep clear of it.
  - Removed the all-caps captions on the profile page. Curly quotes in the help text and the interface.
    Link underlines sit 0.2em under the text. Images in a shared reader load as they come into view.
  - `Strict-Transport-Security` on every response.
  - The live database got the index of migration 0014 on 2026-11-18, with the owner's approval. Known
    open item: Supabase Auth has leaked password protection off.

- Phase 19, Part F: links, tables and page setup (2026-11-18, `docs/plans/phase-19.md`):
  - Links between items: "[[" or Insert, Link to an item lists the items and their headings. A link shows
    the current title of its item. A click opens the item, and Ctrl-click opens it beside. Links here in
    the details panel lists the items that link to the open item. PDF, Word and EPUB keep each link.
    The link is an inline atom node, not the mark that the plan named, so it always shows the current
    title. Document schema 15, backup 17.
  - Tables in prose (`@tiptap/extension-table` 3.32.2, MIT): Insert, Table opens an 8 by 8 grid. Tab moves
    between cells and adds a row in the last cell. Format, Table adds and deletes rows and columns, turns
    the header row on and off, merges and splits cells, and deletes the table. A drag sets a column width.
    A cell holds paragraphs, so a pasted list or quote in a cell stays in the cell. Word, PDF, EPUB, RTF
    and Markdown keep each table with its widths and merged cells. Plain text, Fountain and Final Draft
    put each row on one line.
  - Page setup in the Page popover: Normal, Narrow, Wide or Custom margins (inches or millimeters), page
    numbers at the bottom center, at the top right or nowhere, and a header line and a footer line with
    the project title, the item title or the writer's own text. The page view, PDF, Word and RTF use the
    same values. Word shows the item title of each page with a STYLEREF field. A book layout, standard
    manuscript format and a script keep their own pages. The setup is in `settings.pageSetup`, which a
    backup checks.

- Beta feedback: a wider page, a guide and AI by choice (2026-11-18):
  - The text is 100 characters wide at first, not 68, and the width goes to 160. Page look has a Wide look
    that fills a large screen. The project screen uses the whole window width, so the margins beside the
    text stay small. A width that a writer chose stays.
  - A getting-started guide in six plain steps replaces the tip line above the text. Back, Next, Done and
    Close move through it or hide it, and Settings, Writing, shows it again. It never takes the focus.
  - The stats bar shows the words and the reading time at first. The welcome names the authorship record.
  - AI modes are off on each device until the writer turns on Offer AI modes in Settings, under AI. Until
    then the mode dialog offers Pen only, and says where to turn the modes on. A project that is in an AI
    mode keeps its mode and can go back to Pen. Co-writer is now Drafting; the stored value stays
    `cowriter`, so backups and sync need no change. AI policy version 3 and privacy version 21.

- Phase 19, Part E: the writer's own tools (2026-11-18, `docs/plans/phase-19.md`, ADR 0013, migration 0015):
  - Customize toolbar (at the end of Insert, Format, Review and More tools) pins any tool of the form on
    the toolbar, in the writer's order, by drag or by the arrows. A pinned tool stays in its menu. A phone
    shows the first four pinned tools, and the More menu lists the others. Reset puts Vlo's tools back.
  - Settings, Keyboard gives a tool a new key, takes a key away, or puts Vlo's key back. A key that another
    tool or the browser uses asks first. The menus, the / menu and the shortcut sheet show the writer's keys.
  - The toolbar and the keys stay on the device (`vlo:writer-tools`) and go with the account: migration
    0015 adds the closed `writer_settings` table and its two calls, and the newer copy wins. Privacy
    version 20.
  - Paragraph styles with names: each project starts with Epigraph, Letter, Text message, Song lyrics and
    Sign. A style has a name, a font, a size, an alignment, an indent, the space before and after, and
    italic. The Text style menu, Format, Paragraph styles, the block handle, the / menu and the command
    menu apply a style. Change this style, Update the style to match and New style from this paragraph
    work as in Word, and each paragraph with the style follows a change. A format that the writer gives a
    paragraph directly wins. Document schema 14, backup 16.
  - Word exports write real Word paragraph styles with the same names. PDF, EPUB and the book layout use
    the style values. Standard manuscript format and Markdown keep the text only.

- Leaderboard, comedy and spacing (2026-11-17, ADR 0012, migration 0013), from the product owner's ask:
  - `/leaderboard`: the signed-in writers who wrote the most words today, this week, this month and this
    year, live. The first three glow and shimmer in gold, silver and bronze, and the first wears a crown.
    A switch takes a writer off the board. Privacy version 18. Migration 0013 is on the live database.
  - The Comedy mode: bits in sets, six structures (stand-up set, sketch, parody, roast, top ten list,
    satirical news story), Punch words and Premise machine in the Workshop, and a /rimshot. Backup 15.
  - Spacing in the Format menu for every kind of writing: free sliders and number fields for the space
    between letters, words and lines on the screen. Settings has the same controls.
  - Fixed: the Shelf and Stack switch kept its thumb on Shelf; the caret after the Library greeting stayed
    after it stopped blinking; the haze behind the greeting showed its edges and did not follow the theme.
  - Settings, Storage says that the browser sets the limit, and offers to ask for protected storage,
    which gives the largest limit in Firefox.

- Voice typing and natural voices (2026-11-17), from the product owner's ask. Nothing is paid, and
  nothing leaves the device:
  - Speak to write has no time limit. An audio worklet hears the microphone, and Vlo writes the words
    of each pause at the cursor while the writer speaks on (`src/features/voice/segments.ts`). A clip
    with no speech goes nowhere, as Whisper invents words for silence.
  - Whisper small (252 MB) is the default speech model, as it makes the fewest mistakes. Whisper base
    (80 MB) stays as the fast model. The writer picks one at the first download or in Settings.
  - Read aloud has ten natural voices, five female and five male: Supertonic 2 (OpenRAIL-M, 263 MB),
    which runs in its own worker on WebGPU or WASM. The voices speak English, Spanish, French,
    Portuguese and Korean. The device voices stay in the list. A natural voice is the default.
  - Privacy version 17.

- Phase 19, Part D: words and language tools (2026-11-17, `docs/plans/phase-19.md`). Every tool runs on the
  device from Vlo's own files, and each data file loads the first time a writer uses its tool:
  - Spelling and grammar: Harper (harper.js 3.2.0, Apache-2.0) in a worker, about 8.4 MB gzip with its
    dictionary. It is off until the writer turns it on in Review, because of that download. After a 1.5 s
    pause it checks the English prose blocks near the screen. A fix, Add to dictionary, Ignore and Turn off
    this rule sit in the note at the cursor. Codex and People names are never spelling marks. Typing p95
    on the 10,000-word scene with grammar and parts of speech on: 21 ms.
  - Thesaurus and rhymes: Shift+F7 or Review, Thesaurus opens a card at the word with each meaning, its
    words and its opposites, from Open English WordNet 2024 (CC BY 4.0, 1.8 MB gzip, built by
    `scripts/build-thesaurus.mjs`). A choice keeps the case and the formats of the word. A poem gets a
    Rhymes tab, and a poetry collection gets Rhymes in the Workshop, from the CMU data. Ethnic slurs are
    out of the thesaurus, and obscene words are out of the rhymes.
  - Text shortcuts and a typo list of about 65 common typos (English prose), with Backspace to undo. Codex
    name completion after three letters (Tab takes it) and an @ list of Codex entries and items.
  - Focus, Dim other sentences keeps only the sentence at the cursor clear. Review, Show parts of speech
    colors nouns, verbs, adjectives, adverbs and conjunctions in an English item, each with its own line
    shape and a switch in the legend (wink-pos-tagger 2.2.2, MIT, 645 KB gzip). Privacy version 19.
  - Not as planned: Mod-Shift-T is Shift+F7, because browsers keep Ctrl+Shift+T to reopen a closed tab.
    The right-click menu stays the browser's own, with its paste and spell check.

- Phase 19, Part C: review like Google Docs (2026-11-17, `docs/plans/phase-19.md`):
  - A comment is a thread: the first comment, replies, and a resolve time, all in the comment mark, so
    sync, tab sync, snapshots and backups carry them, and Ctrl+Z takes back each change. Document schema 13. A comment from before Phase 19 is a thread with no replies.
  - When the window has room right of the page, each open thread and each waiting change is a card beside
    its words. Cards that would overlap stack down, the card at the cursor moves to its words, and a line
    joins a card to its words. The cards move after a typing pause. 200 cards on the 10,000-word scene
    keep typing at 20 ms p95. Without room, a 24 px count beside each line with comments opens the thread
    in the Comment panel. The comment list under the text is gone.
  - Resolve keeps the thread on its words, out of sight. All comments (Review menu, Ctrl+Alt+Shift+A)
    lists the open and the resolved threads, and Reopen puts one back. Copy link gives an address that
    opens the item at the thread. Ctrl+Alt+M on a thread's words goes to its reply field.
  - Change cards have Accept and Reject with the pass color. Review has Accept all changes and Reject all
    changes, each one step of Undo. Viewing mode shows the cards with no tools.
  - A Word export with comments writes each reply as a Word reply (with a parent in commentsExtended)
    and marks a resolved thread as done. An import puts Word replies back in the thread, and an editor's
    new reply on the writer's own comment joins it.
  - Not built yet: reactions on a comment, a sheet from the bottom for a thread on phones (the Comment
    panel opens at the words), and the resolved state from a Word file.

- Phase 19, Part B: the core writing tools (2026-11-17, `docs/plans/phase-19.md`):
  - Prose has Heading 4, checklists and page breaks (Ctrl+Enter). Each export maps them: Word has a real
    page break and a box for each item, the PDF starts a new page, Markdown writes `- [x]`, and a share
    link and a web copy show the boxes as characters. Document schema 12. Heading 1 inside the text
    stays out, because the item title is the top heading.
  - The item outline lists the headings, the scene breaks and a script's scene headings, with the words
    of each section. It stays in the margin when the window has room, and it opens in a popover when the
    window has none. Ctrl+K lists the same entries under "In this item".
  - A paste from Google Docs, Word or a web page keeps its formats, lists, links and footnotes, and drops
    fonts, sizes and colors. "Keep the original look" puts the paste again with them. Ctrl+Shift+V pastes
    plain text. Paint format copies the formats and the paragraph look at the cursor. Change case has
    four rules in the project language (a Turkish i keeps its dot), and Shift+F3 steps through them.
  - Alt+Shift+Up and Alt+Shift+Down move the block at the cursor. A list item moves in its list, and a
    poem line in its stanza (with Ctrl, the stanza). A handle at the left of each prose block drags the
    block and opens a menu: Turn into, Duplicate, Move up, Move down and Delete.
  - The find bar has patterns (regular expressions with $1 in Replace) and Whole project. Replace all in
    project asks first, keeps a snapshot of each changed item, and changes the open item in its editor,
    so Undo there puts it back. 120 scenes take well under 3 seconds.
  - Not built yet: "Paragraph style" and "Copy link to this paragraph" in the block menu (they wait for
    paragraph styles in Part F and paragraph links), and a worker for the project replace (the main
    thread replaces 120 scenes fast enough). Title Case follows the Chicago and MLA short-word rule in
    every project. A pasted image from a web address stays out, as before.

- Phase 19, Part A: the editor menus, page look and word targets (2026-11-17, `docs/plans/phase-19.md`):
  - The toolbar has three named menus, Insert, Format and Review, in place of one long More tools list.
    Each menu puts its tools in labeled groups. A Mode menu changes between Editing, Suggesting and
    Viewing. Viewing makes the text read-only. Phones show the same groups in More tools.
  - An item opens with the cursor where the writer left it, also after an edit on another device. Vlo
    keeps the newest 300 places on the device.
  - Page look sets the text width, the paragraphs (spaced, indented or airy), the line spacing and a
    screen font for this screen only. Five looks come with Vlo, and a writer can save six of their own.
    The Page width slider moved from the details panel into Page look.
  - Each item can have a word target. A ring next to the word count fills as the writer writes, and the
    binder shows how far the item is. A backup keeps the target.
  - Print (Review, then Print) shows only the open text, black on white.
  - On a phone with its keyboard open, the rows above the text go away and the toolbar sits on the
    keyboard, with a Hide keyboard button.
  - Not built yet: a command menu entry for the word target, and a bar in the binder (the binder shows a
    text label).
  - Fixed: "Blur the words" and "Cover the words with bars" in the Focus menu did not turn Hide the
    text off on a second click.

- More file types (2026-11-17), from the product owner's ask:
  - Import writing reads PDF, OpenDocument (.odt), RTF, EPUB, web pages (.html), and Final Draft (.fdx)
    files, beside Word, Markdown, text, Fountain and Scrivener. An RTF heading keeps its outline level.
  - A PDF has lines at places on a page, so the PDF reader joins them into paragraphs, finds headings by
    size and verse by short lines, and leaves out page numbers and running heads. PDF.js (Apache-2.0)
    reads the text in its own worker, and it loads only for a PDF. The service worker caches it on first
    use. A PDF gives no bold or italic, and a scan of pages has no text, so the summary says so.
  - Export adds Rich Text (.rtf), Web page (.html, with its images inside) and Plain text (.txt). Each one
    reads back through Import writing with its words and its chapters, and a poem keeps every space.

- Profiles (2026-11-17, ADR 0011, migration 0011), from the product owner's ask:
  - A new account gives its name after the sign-in code (`/profile/new`), with an optional photo that the
    writer places in a circle. Google's name fills the field. An older account gives its name once.
  - The Library says "Welcome back to your library, <name>". The header shows the photo or the initials,
    with a menu for Your profile and Account and sync.
  - `/profile`: the photo, the full name, the name of the greeting, a pen name and a bio, with a preview of
    where each shows. New projects take the pen name as their author; the Book page can take the bio.
  - The owner page shows each account's name. Privacy version 15. Migration 0011 needs the live database.

- Separate accounts (2026-11-17, ADR 0010), from the product owner's ask:
  - Each account has its own library on the device: its own database and item texts. A sign-in no longer
    gives the device's projects to the account. The account that was signed in before the upgrade keeps
    the first database, so no word moves.
  - "Bring its projects here" on the Account page copies the projects of the library with no account, or
    of another account that is signed in on the device. "Sign in to another account" and "Switch to this
    account" keep more than one account on a device.
  - A sign-in screen (`/sign-in`) opens on each signed-out visit, with "Write without an account".
  - Sync starts after a sign-in on any screen, not only on the Account page.

- Older entries, from before 2026-11-17: `docs/history.md`.

## Open

- CI: the repository is private, so Actions minutes are limited. A pull request runs the checks, the export files
  job and Chromium, and skips a change to docs only. "Run workflow" on the Actions tab runs all four browsers;
  run it before each phase gate. The browser jobs run one worker, so the timing tests have the CPU alone.
- Phase 4: pull request #12 merged on 2026-11-06. The checks by hand for OpenRouter and Groq with a key,
  the in-browser model on WebGPU, and input method typing inside AI text are still open.
- Supabase: the live project is in the committed `.env` and in the CSP in `vercel.json`. On 2026-11-17 all
  13 migrations were on it, and each function matched the repository. Migration 0014 (an index only) waits
  for the product owner to run it (`docs/accounts-setup.md`).
- Phase 5, Gate 5: a fresh security review found no critical issue. Its high findings are fixed: long quotes,
  share records kept on Replace import, comments read before Stop sharing, and the project limits in
  migration 0004. The minor findings are fixed too: purpose data in the seal, a size cap on opening, safe
  MathML values, the grants and search path of each function, and clearer messages.
- Phase 5, open by hand: a real Supabase project with the 4 migrations, a share opened on a real phone, and
  the keepalive workflow once the Actions minutes reset.
- Chromium stops when a page reads a folder back from IndexedDB in a private profile (Playwright test
  contexts). The folder save browser test uses a profile on disk. Check folder save in a Chrome Incognito
  window by hand.
- Real Safari, by hand with `docs/safari-storage-test.md`: the 14-day storage runs, the offline open, and
  the budget checks (open under 300 ms, plain typing, typing with a moving scene and with 500 shimmering
  runs, each under 50 ms). CI WebKit runs on Linux and holds these to 700, 100, 150 and 120 ms ceilings.
  Timing each part of the moving scene alone showed the page shadow and the scene layer cost the most.
- After a deep AI check in Reader mode, a switch back to Pen frees the model only when the Assistant code
  loaded too. On a large screen it always loads, because the Assistant opens in Reader mode. On a phone the
  model can stay in memory until the tab closes. It sends nothing.
- CI Firefox: 3 to 9 tests a run time out in their first page.goto, on every run since the first phases. Each
  one passes on its retry. The stuck load never reaches DOMContentLoaded, so the stall is before the page
  runs. A wait for the HTML first and a fixed 127.0.0.1 address did not change it, so both were taken back.
- Known after review, left for later: while the gradient editor is open, the selected words show in plain
  theme color, and the preview shows the look. Each step of a color or gradient drag is one change, and the
  undo history groups changes within half a second. Ctrl+Shift+J (Justify) and Cmd+, (Subscript) are TipTap's
  keys, and some browsers keep those keys for themselves. Palette colors copy into other apps without their
  color; exports resolve them in pull request B.
- "A new version waits while the writer works, then loads by itself on the next visit" (pwa.spec.ts) fails
  about 4 runs in 6 in Chromium, on main too. After the reload, Vlo sends SKIP_WAITING to the waiting
  service worker, and the worker gets it, but it never activates, and a script that the test runs in that
  worker never answers. No request of the page or of the worker waits. So the stall is in the browser's
  start of the waiting worker, and the app does no wrong step. A writer gets the new version when every
  tab of Vlo closes. CI retries the test once.
- Firefox in CI: about one `page.goto` in 50 waits 30 s for the load event, then passes on retry. Main showed the
  same thing in Phase 0. Firefox does not run in the build container, so the cause is still open. The CI
  retry covers it.

- Two board timing tests are sensitive to load in the build container. "US05: a double-click on a linked
  card opens its scene in under 1 s" failed twice and "a pinch over 200 cards keeps 60 frames a second"
  failed twice on the phone profile, each time with two workers running other tests beside them. Each
  passed every time alone (US05 9 times, the pinch 2 times). CI runs one worker. On 2026-11-08 the pinch
  failed alone too, at a median of 33.3 ms in place of 16.7 ms: 2 runs of 4 on the Phase 4 code, and 1 of 4
  on the Phase 6 branch. So the cause is the container, and no change made the board slower. CI retries
  each failed test once.
- Live CORS check with no key (Gate 4, plan decision P4), from the build container on 2026-11-05:
  Anthropic and Gemini answer the browser preflight with `access-control-allow-origin` for the headers that
  Vlo sends. The container's network allowlist blocks OpenRouter and Groq (proxy 403), so their check waits
  for a writer's browser. Check both by hand with a key before Phase 4 ships.
- Gate 3 in the build container: Chromium and the phone profile pass the whole browser suite. WebKit is
  not installed there, and Firefox does not run there. Run "Run workflow" on the Actions tab for all four
  browsers when the Actions minutes reset.

- Known after the review of private names, left for later:
  - Mark all reads the stored text of each item. A word that the writer types in an open editor in the
    same second can miss its mark. The name check before each export finds it, and Mark all again marks it.
  - Show aliases hides each real name with a decoration. The caret can still move into the hidden text,
    and typing there changes the real name. The switch is a preview, so turn it off to edit names.

## Blocked

- Nothing.

## Decisions

| Date       | Decision                                                                         |
| ---------- | -------------------------------------------------------------------------------- |
| 2026-11-02 | Repository: `Sophie-S-Z/vlo`.                                                    |
| 2026-11-02 | License: MIT.                                                                    |
| 2026-11-02 | Hosting: Vercel, built from GitHub (ADR 0002).                                   |
| 2026-11-02 | Supabase project: create in Phase 5.                                             |
| 2026-11-02 | Phones: full editing. Board and timeline show as lists under 600 px.             |
| 2026-11-02 | AI presets: OpenRouter, Anthropic, Groq, Gemini, Ollama, LM Studio.              |
| 2026-11-02 | Manuscript font: Newsreader 12 pt, with a Courier-style option.                  |
| 2026-11-02 | Marketing site: https://vlo-landing-page.vercel.app/                             |
| 2026-11-02 | Phase 1 motion uses CSS and View Transitions, no GSAP (plan decision 1).         |
| 2026-11-02 | Plain-text copies of items live in `itemTexts` (ADR 0003).                       |
| 2026-11-03 | Phase 2 order: editor upgrade, then exports.                                     |
| 2026-11-03 | Gradient and metallic text shimmers only when typing stops.                      |
| 2026-11-03 | Math: MathLive. Page format: one sheet with page-end lines.                      |
| 2026-11-03 | Sound: generated in the browser, plus the writer's own files.                    |
| 2026-11-03 | Google Docs: a Word download, then open it in Google Docs.                       |
| 2026-11-03 | About 20 Vlo fonts plus own fonts, with a warning before a font swap.            |
| 2026-11-05 | Phase 3 plan approved as written: no GSAP, extras E1 to E5, 3 packages.          |
| 2026-11-05 | CI on pull requests: checks, export files and Chromium. All browsers by hand.    |
| 2026-11-07 | Phase 5 plan approved: decisions S1 to S8 and the PGlite test package.           |
| 2026-11-07 | Share links are sealed in the browser, with the key in the fragment (ADR 0004).  |
| 2026-11-08 | Phase 6 plan approved: T1, T2, T4, T5 and T6 as recommended.                     |
| 2026-11-08 | Launch with sharing and usage counts off; the Supabase project comes later (T3). |
| 2026-11-08 | Pen mode blocks the deep AI check. The web originality check stays in Pen mode.  |
| 2026-11-08 | Production address: https://vlo-eight.vercel.app/                                |
| 2026-11-09 | Phase 7 plan approved: decisions P1 to P7 as recommended.                        |
| 2026-11-09 | Phase 8 plan approved: decisions Q1 to Q9 as recommended.                        |
| 2026-11-09 | Phase 9 plan approved: decisions R1 to R9 as recommended.                        |
| 2026-11-10 | Phase 10 plan approved: decisions J1 to J7 as recommended.                       |
| 2026-11-10 | Phase 11 plan approved: decisions K1 to K9 as recommended.                       |
| 2026-11-12 | Phase 17 from beta feedback: S1 to S5, M1 to M3, P1 and D1 as recommended.       |

## Spec changes

| Date       | Change                                                                                                                                                                                                                                                                                       | Reason                                                                                                                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-17 | Seven atmosphere themes (`src/app/themes.ts`). Each puts a free Unsplash photograph behind the app under a veil of its color (`atmospheres.css`), fetched only for that theme. Text keeps 4.5:1 over it. It drifts while the writer rests, and stays still in Calm mode.                     |
| 2026-11-17 | The six editor scenes are free Unsplash photographs (`src/assets/backdrops`), fetched only when shown, with motion drawn over them: drops on the glass, sparks, stars, fireflies, snow and glints. The product owner found the drawn scenes crude.                                           |
| 2026-11-17 | 30 Vlo fonts in seven groups. New: Alegreya, Bodoni Moda, Instrument Serif, Recursive, Dancing Script, Pinyon Script, and Storybook and fantasy (Grenze Gotisch, Uncial Antiqua, Macondo, Fredericka the Great). All OFL.                                                                    |
| 2026-11-17 | Type play (`typePlay` mark): exact weight, letter spacing and variable-font axes, the effects Outline, Engraved, Lifted and Echo, and the motions Breathe and Flicker. Screen only; exports keep 600+ weight as bold.                                                                        |
| 2026-11-16 | The Library is a bookshelf (Bookshelf.tsx). The list layout stays for a ruled view of every detail. The heading reads "Welcome to your library".                                                                                                                                             | The product owner found the card grid generic and asked for an interactive shelf like the virtual library guide they shared.                                                                                        |
| 2026-11-16 | The list layout is now a stack of books. The shelf always shows first. The bookends and plank are wood, and the seals are gone. A new version loads at the next visit with no notice.                                                                                                        | The product owner asked for a bookstack view, wooden bookends, no seals, smoother motion and updates that need no reload button.                                                                                    |
| 2026-11-11 | New palette: Ink `#0B0E14` (a blue-black) and Paper `#F5F4F1` (a stone white) as the two base colors, and Celadon as the accent (`#A9D4B3` in Ink, `#689373` in Paper, `#4D7758` for Paper text). Sepia and Contrast take a deep celadon accent. Text on the accent is Ink in Ink and Paper. | The terracotta accent was close to a default AI orange, and the cream page was a common AI trend. The product owner asked for a rare, calm accent. Each text color still meets 4.5:1, and the Contrast theme 7:1.   |
| 2026-11-10 | The version 1 non-goal "cloud sync of manuscripts" is now sealed sync (F49). The relay keeps sealed blobs only, and the key stays on the writer's devices.                                                                                                                                   | Roadmap decision D1. ADR 0008 holds the design.                                                                                                                                                                     |
| 2026-11-10 | `DOC_SCHEMA` is 7.                                                                                                                                                                                                                                                                           | Track changes adds suggestion marks (F44), so an older build must not open such a document.                                                                                                                         |
| 2026-11-08 | AI policy statement 3 (version 2): Pen mode loads no AI code and sends nothing unless you press "Check the web too". The deep AI check needs Reader or Co-writer mode.                                                                                                                       | The web originality check sends up to 6 phrases on a press in any mode, and the old words said Pen mode sends nothing (product owner decision).                                                                     |
| 2026-11-02 | `vercel.json` replaces `public/_headers`.                                                                                                                                                                                                                                                    | Hosting moved to Vercel.                                                                                                                                                                                            |
| 2026-11-02 | The CSP has no Supabase host until Phase 5.                                                                                                                                                                                                                                                  | The spec value is a placeholder.                                                                                                                                                                                    |
| 2026-11-02 | Routes arrive in the phase that builds their screen.                                                                                                                                                                                                                                         | No placeholder screens (section 0, rule 8).                                                                                                                                                                         |
| 2026-11-02 | Paper adds `--accent-text: #B83E28`.                                                                                                                                                                                                                                                         | `#C8452D` on `#F5F1E8` is 4.29:1 and fails WCAG AA for body text.                                                                                                                                                   |
| 2026-11-02 | Sepia adds surface `#F6ECD9`, muted `#6E5D48`, rule `#DCCBAA`.                                                                                                                                                                                                                               | The spec gives only three Sepia colors.                                                                                                                                                                             |
| 2026-11-02 | TypeScript 6.0, not 7.0.                                                                                                                                                                                                                                                                     | typescript-eslint 8.72 supports TypeScript below 6.1.                                                                                                                                                               |
| 2026-11-02 | ESLint 9.39, not 10.                                                                                                                                                                                                                                                                         | eslint-plugin-jsx-a11y 6.10 supports ESLint up to 9.                                                                                                                                                                |
| 2026-11-02 | The CSP adds `manifest-src 'self'`.                                                                                                                                                                                                                                                          | Tighter than the `default-src` fallback, same effect.                                                                                                                                                               |
| 2026-11-02 | `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`.                                                                                                                                                                                                                       | File names carry a content hash.                                                                                                                                                                                    |
| 2026-11-02 | The SPA rewrite skips `/assets/`, `/icons/`, `/sw.js`, `/workbox-*` and the manifest.                                                                                                                                                                                                        | A missing file must return 404, never `index.html`, or the service worker can cache HTML as a script.                                                                                                               |
| 2026-11-02 | In WebKit the offline test checks only the precache.                                                                                                                                                                                                                                         | Playwright cannot load a service-worker page in WebKit with the network off. Real Safari is a manual check in Phase 6.                                                                                              |
| 2026-11-02 | `@tiptap/y-tiptap` and `y-protocols` replace `y-prosemirror`.                                                                                                                                                                                                                                | `@tiptap/extension-collaboration` 3.32 needs them as peers.                                                                                                                                                         |
| 2026-11-02 | Shared-element transitions use React's `<ViewTransition name>`, not Motion `layoutId`.                                                                                                                                                                                                       | React Router 8 deprecates its `viewTransition` option and points to React 19.3 `<ViewTransition>` (rule 11).                                                                                                        |
| 2026-11-02 | Two tabs on one item sync live through `BroadcastChannel`.                                                                                                                                                                                                                                   | Better than the planned notice alone. Yjs merges both tabs, so no typing is lost.                                                                                                                                   |
| 2026-11-03 | Focus-line dimming uses 70 % opacity, not 40 %.                                                                                                                                                                                                                                              | 40 % gave 2.2:1 to 3.3:1 contrast. 70 % meets WCAG AA in every theme (product owner decision).                                                                                                                      |
| 2026-11-03 | CI WebKit holds the open budget to a 700 ms ceiling. Real Safari is checked by hand in Phase 6.                                                                                                                                                                                              | Linux WebKit in CI takes 364 to 567 ms and varies by up to 200 ms per run (product owner decision).                                                                                                                 |
| 2026-11-03 | CI WebKit holds plain typing on the 10,000-word scene to a 100 ms ceiling. Real Safari is checked by hand in Phase 6.                                                                                                                                                                        | Linux WebKit in CI takes 58 to 65 ms at p95 for this test. Chromium and Firefox stay under 50 ms (product owner decision).                                                                                          |
| 2026-11-03 | CI WebKit holds typing with 500 shimmering runs to a 120 ms ceiling. Real Safari is checked by hand before A1 merges.                                                                                                                                                                        | Linux WebKit in CI repaints every visible fill run on each key. A paint layer for texts with fills cut p95 from 141 ms to 65 ms, and runners vary by up to two times (product owner decision).                      |
| 2026-11-04 | CI WebKit holds typing with a moving scene to a 150 ms ceiling. Real Safari is checked by hand in Phase 6.                                                                                                                                                                                   | Linux WebKit in CI paints in software and takes 122 to 207 ms at p95 for this test. Chromium and Firefox stay under 50 ms (product owner decision).                                                                 |
| 2026-11-02 | Storage health says "Unknown" and "Limit for Vlo", not "Not available" and "Quota".                                                                                                                                                                                                          | "Limit for Vlo" says what the number means. "Unknown" matches the other rows.                                                                                                                                       |
| 2026-11-03 | New marks beyond section 7: `superscript`, `subscript`, `highlight` (color), `textStyle` (color, font size), `textFill`.                                                                                                                                                                     | Phase 2 editor tools (plan decision 12).                                                                                                                                                                            |
| 2026-11-03 | New attributes: `textAlign`, `lineSpacing`, `firstLineIndent` and `dropCap` on paragraphs and headings.                                                                                                                                                                                      | Phase 2 block tools, prose only.                                                                                                                                                                                    |
| 2026-11-03 | New node: `footnote`, an inline atom with its note in `content`. Poem lines hold `inline*`, not `text*`.                                                                                                                                                                                     | Footnotes in prose and poems (plan decision 4). Hard breaks stay off in poems.                                                                                                                                      |
| 2026-11-03 | Item documents store a schema version (`vlo` map, key `schema`, now 2). Tabs share edits only with tabs of the same schema, on a channel named for it.                                                                                                                                       | A Phase 1 tab drops formats it cannot show, and Yjs saves that loss. The guard keeps each later schema change safe.                                                                                                 |
| 2026-11-03 | New nodes: `mathInline` (prose and poems) and `mathBlock` (prose only), atoms with the LaTeX in `latex`. Item document schema is now 3.                                                                                                                                                      | Equations (plan Task A6). A build with schema 2 does not open a document that has equations, so it cannot drop them.                                                                                                |
| 2026-11-03 | New package: `mathlive` 0.111.4 (MIT), loaded on first use. Its fonts and keyboard are in the offline cache, which adds about 1.1 MB to the first install.                                                                                                                                   | Approved with the Phase 2 plan. Equations work offline, and Pen mode sends no request outside the app.                                                                                                              |
| 2026-11-03 | Fonts use the variable `@fontsource-variable` packages where they exist, and `@fontsource` for Spectral, IM Fell English, Courier Prime and Kalam.                                                                                                                                           | Rule 11: the plan named `@fontsource`. One variable file per style covers every weight, so a bold word loads no second file.                                                                                        |
| 2026-11-03 | New attribute: `font` on `textStyle`, a Vlo font id or `local:` and an installed font's name. New project settings: `font` and `page`. Schema stays 3.                                                                                                                                       | Fonts and page format (plan Task A7). Schema 3 is new in this same pull request, so no released build lacks the attribute.                                                                                          |
| 2026-11-03 | The writing fonts are not in the install cache. The service worker caches each font file on its first load.                                                                                                                                                                                  | 20 fonts add 5.7 MB. A font the writer never used is not offline; its text shows in the project font until the device is online once.                                                                               |
| 2026-11-03 | Page format text is 12 point, and every block lays out at once on the sheet.                                                                                                                                                                                                                 | Page ends then match a printed page, and the measure reads each block's real height. Pageless keeps skipping the layout of blocks far off screen.                                                                   |
| 2026-11-03 | Page zoom (E7) and page format sit in a Page button above the text. Zoom is per device; the page format is per project.                                                                                                                                                                      | Zoom suits the screen. The page format suits the manuscript, so every item and every tab follow it.                                                                                                                 |
| 2026-11-03 | New project setting: `scene`, a scene id or `none`. An unknown value shows no scene.                                                                                                                                                                                                         | Cozy scenes (plan Task A8). The scene suits the project, so every item and every tab follow it.                                                                                                                     |
| 2026-11-03 | Scenes draw in a worker on an OffscreenCanvas and stop while the writer types.                                                                                                                                                                                                               | Scene motion then never competes with typing. The CSS picture covers Calm mode, reduced motion and the first frame.                                                                                                 |
| 2026-11-03 | The Scene button sits next to the Page button above the text, not in the toolbar.                                                                                                                                                                                                            | The toolbar holds tools for the words. A scene, like the page format, is a setting for the whole project.                                                                                                           |
| 2026-11-03 | A tool chosen from a toolbar menu runs after the menu closes.                                                                                                                                                                                                                                | On a phone, the closing menu took focus from the equation panel and closed it. Footnote had the same risk.                                                                                                          |
| 2026-11-03 | Footnote numbers are not stored. A plugin counts them in text order.                                                                                                                                                                                                                         | A stored number goes stale after a cut, a paste, an undo or a change in another tab.                                                                                                                                |
| 2026-11-03 | An item's plain-text copy ends with its notes under "Notes". Word and line counts leave the notes out.                                                                                                                                                                                       | Search finds notes and readable backups keep them. Counts match the writing itself.                                                                                                                                 |
| 2026-11-03 | A copy from a Vlo poem pastes into a poem with its styles and footnotes. Text from other apps still pastes as plain text.                                                                                                                                                                    | Phase 2 gives poems inline styles, and the plain-text paste dropped them. A copy inside one line now stays one line in plain text too.                                                                              |
| 2026-11-03 | Gradient text is allowed in the writer's own words, and the toolbar never uses it.                                                                                                                                                                                                           | The product owner asked for gradient and metallic text. Interface surfaces keep plain colors.                                                                                                                       |
| 2026-11-03 | Scenes count as artwork, not interface surfaces, so they can use gradients and motion.                                                                                                                                                                                                       | Section 13 bans gradients on interface surfaces (plan decision 12).                                                                                                                                                 |
| 2026-11-03 | New Dexie table `audioFiles` (database version 2) for the writer's own music files.                                                                                                                                                                                                          | Plan decision 10. Music files stay on the device. The upgrade keeps every row of version 1 (upgrade test).                                                                                                          |
| 2026-11-03 | The CSP adds `media-src 'self' blob:`.                                                                                                                                                                                                                                                       | The writer's own music plays from a blob: URL. No outside host is allowed.                                                                                                                                          |
| 2026-11-03 | The sound engine is a separate chunk that loads on the first Play.                                                                                                                                                                                                                           | Initial JavaScript stays inside the budget, and a writer who never plays sound never loads it.                                                                                                                      |
| 2026-11-03 | Sound stops when the writer leaves the project.                                                                                                                                                                                                                                              | The sound belongs to the writing session, and the next project can have another scene.                                                                                                                              |
| 2026-11-03 | The Sound button sits next to the Scene button above the text, not in the toolbar.                                                                                                                                                                                                           | The toolbar holds tools for the words. Sound, like the scene, is a setting for the writing room.                                                                                                                    |
| 2026-11-03 | Music tempos run from 68 to 120 beats a minute, outside the plan's 70 to 90.                                                                                                                                                                                                                 | Deep house needs its pulse near 120 to sound like house. Melancholic at 68 leaves more space. The lofi moods stay inside 70 to 90.                                                                                  |
| 2026-11-03 | Find, Find and replace and Read aloud sit in the More menu, not on the toolbar row. Ctrl+F and Ctrl+H open the find bar.                                                                                                                                                                     | The toolbar row is full at the narrowest desktop column (binder and details open). A new button there wraps the bar to two rows.                                                                                    |
| 2026-11-03 | On a Mac, ⌘H hides the browser before Vlo sees it. Mac writers press ⌘F, then Tab, to reach Replace.                                                                                                                                                                                         | The plan's Mod-H is kept for other systems. The find bar shows both fields, so Replace is one Tab away.                                                                                                             |
| 2026-11-03 | Read aloud pauses by stopping the voice and starts the same sentence again on Resume.                                                                                                                                                                                                        | Browsers differ on pause and resume of speech, and some stop for good. A new start of the sentence works the same in each.                                                                                          |
| 2026-11-03 | Words written today start from the project total at the first look each day, kept in `appMeta`.                                                                                                                                                                                              | No new table is needed. Deleting a project deletes its record.                                                                                                                                                      |
| 2026-11-03 | Popovers, menus and dialogs fade in and close at once, with no fade-out.                                                                                                                                                                                                                     | Radix removes a closing layer only after its animationend event. With a scene on, WebKit did not send it, so a closed panel stayed on screen.                                                                       |
| 2026-11-04 | CI gives Firefox and WebKit a silent PulseAudio output (apt packages `pulseaudio` and `gstreamer1.0-pulseaudio` in the CI job only).                                                                                                                                                         | The runners have no sound card, and Firefox and WebKit keep Web Audio suspended without an output. Firefox's null audio setting kept the context suspended. No app package changes.                                 |
| 2026-11-04 | A moving scene goes still for the rest of the visit when the device draws it slowly (middle frame over 50 ms in a 2 s sample). The Scene panel says so and offers "Try the motion again".                                                                                                    | The CI WebKit drew a moving scene at about 3 frames a second, and keys then waited 210 ms. A weak device can do the same. The product owner chose this on 2026-11-04.                                               |
| 2026-11-04 | Own music files are stored as ArrayBuffer bytes, not Blob.                                                                                                                                                                                                                                   | Safari cannot store a Blob in IndexedDB in a private window, and the CI WebKit could not keep a file.                                                                                                               |
| 2026-11-04 | A plain click on the blank page under the last block puts the caret after the last word, in every browser.                                                                                                                                                                                   | WebKit put the caret before the first word, so the next words went to the wrong place.                                                                                                                              |
| 2026-11-03 | Play waits up to 3 s for the browser to start the sound. If the browser keeps it off, Vlo says so and shows Play again.                                                                                                                                                                      | A browser's autoplay rule can keep sound off. The panel must not say that sound plays when it does not.                                                                                                             |
| 2026-11-03 | Ambient sound (F22) moves from Phase 3 to Phase 2.                                                                                                                                                                                                                                           | The product owner asked for music and nature sounds with the editor upgrade.                                                                                                                                        |
| 2026-11-03 | New packages: `@floating-ui/dom` and the TipTap `bubble-menu`, `highlight`, `subscript`, `superscript`, `text-align`, `text-style` and `typography` extensions.                                                                                                                              | Approved with the Phase 2 plan. All MIT. `docs/licenses.md` lists them.                                                                                                                                             |
| 2026-11-04 | Word gets each equation as a Word equation (OMML), built from MathLive's MathML with the docx math parts. A part that docx cannot write, such as a matrix, becomes plain text inside the equation. A command that MathLive cannot convert keeps its LaTeX inside the equation.               | Plan decision 5 chose a picture of each equation, which Word cannot edit, because the common MathML to OMML converter has no open license. The docx package now writes equations itself, so no converter is needed. |
| 2026-11-04 | Vite builds workers as ES modules (`worker.format: 'es'`).                                                                                                                                                                                                                                   | The export worker loads each format's code only when the writer picks it. Classic workers cannot split code.                                                                                                        |
| 2026-11-04 | The license check accepts a dual license when one choice is allowed. jszip is `(MIT OR GPL-3.0-or-later)`, and Vlo uses it under MIT.                                                                                                                                                        | jszip was approved with the Phase 2 plan.                                                                                                                                                                           |
| 2026-11-04 | New packages: `docx` and `jszip` (runtime), `markdown-it` and `@types/markdown-it` (tests). `pdf-lib` and `@pdf-lib/fontkit` come with pull request B2.                                                                                                                                      | Approved with the Phase 2 plan. `docs/licenses.md` lists them.                                                                                                                                                      |
| 2026-11-04 | The PDF and EPUB fonts are static 400 and 700 TrueType files from the Google Fonts CSS API, pinned by SHA-256 in `pdf-fonts.lock.json`, not the variable files of the `google/fonts` repository.                                                                                             | fontkit makes broken glyphs and wrong default weights from variable fonts.                                                                                                                                          |
| 2026-11-04 | Vlo pads each subset glyph to an even length before pdf-lib writes the font.                                                                                                                                                                                                                 | fontkit writes short `loca` offsets that cannot point at an odd offset, and 8 Vlo fonts then drew no letters.                                                                                                       |
| 2026-11-04 | A font without a bold or italic file is drawn with a slant or a thicker stroke, and the done screen says which.                                                                                                                                                                              | Cinzel, Caveat, Kalam, IM Fell English and Noto Sans Math have no file for some styles.                                                                                                                             |
| 2026-11-04 | The manuscript word count rounds to the nearest 100 under 1,000 words.                                                                                                                                                                                                                       | "About 0 words" helps no one on a short story.                                                                                                                                                                      |
| 2026-11-04 | `lib/net.ts` holds `appFile`, the one same-origin fetch for the export fonts.                                                                                                                                                                                                                | Only `lib/net.ts` may call `fetch` (lint rule).                                                                                                                                                                     |
| 2026-11-04 | The EPUB language is `en`.                                                                                                                                                                                                                                                                   | Projects have no language setting yet.                                                                                                                                                                              |
| 2026-11-04 | PDF equations are drawn as text and lines from MathML, not as images.                                                                                                                                                                                                                        | The words stay sharp and selectable at every zoom.                                                                                                                                                                  |
| 2026-11-04 | `/fonts/*` gets `Cache-Control: public, max-age=86400`, and the SPA rewrite skips `/fonts/`.                                                                                                                                                                                                 | File names carry no hash, so they cannot be immutable. A missing font must return 404.                                                                                                                              |
| 2026-11-04 | The CI job `word-export` becomes `export-files` ("Export files open in other apps") and installs `poppler-utils`.                                                                                                                                                                            | It now checks PDF and EPUB files too.                                                                                                                                                                               |
| 2026-11-04 | The backup file has a `format`, a `version` and the item `docSchema` in `project.json`. Import refuses a newer version or a newer schema.                                                                                                                                                    | An older build would drop formats it cannot show, and Yjs would save that loss.                                                                                                                                     |
| 2026-11-04 | An imported project counts as backed up at the time its file was made.                                                                                                                                                                                                                       | The file on the device is a backup of exactly that state.                                                                                                                                                           |
| 2026-11-04 | The reminder needs changes since the last backup. A project with no backup counts from the day it was made.                                                                                                                                                                                  | A project that did not change since its backup is still safe.                                                                                                                                                       |
| 2026-11-04 | Import offers Replace or Keep both when the project is on this device.                                                                                                                                                                                                                       | The spec says replace after a confirm. Keep both is safer when the writer is not sure which copy is newer.                                                                                                          |
| 2026-11-04 | Music files are not part of a project, so a backup holds them only when the writer asks, and an import adds only the files that are not on the device.                                                                                                                                       | Music files are large and every project shares them.                                                                                                                                                                |
| 2026-11-04 | Folder save writes one Markdown file for the whole project, beside the backup.                                                                                                                                                                                                               | One file per project is easier to read in a cloud drive than one file per item, and the backup already holds each item.                                                                                             |
| 2026-11-04 | Folder save runs when the writer leaves a project or the tab, and only after a change.                                                                                                                                                                                                       | The spec says "after each session". Leaving is the end of a session, and the browser has no other safe moment.                                                                                                      |
| 2026-11-04 | A save to the folder counts as a backup for the card date and the reminder.                                                                                                                                                                                                                  | The folder holds the same `.vlo.zip` file that Back up makes.                                                                                                                                                       |
| 2026-11-05 | The plan's `person` mark (D3) uses the spec's name, `privateName`, with the attribute `personId`.                                                                                                                                                                                            | Spec section 5 names the mark. The plan used a short name for the same mark.                                                                                                                                        |
| 2026-11-05 | `nameCheck` lists the unmarked names for E5, next to `shareSafe`, and the export worker runs both.                                                                                                                                                                                           | The dialog needs the list before the file, and the file needs only the aliased text.                                                                                                                                |
| 2026-11-05 | A deleted person keeps the marks in the text, and Undo brings the person back with the same id.                                                                                                                                                                                              | A mark with no person does nothing, so a share-safe export still swaps any real name it finds.                                                                                                                      |
| 2026-11-05 | The ring preview hides each card that turns past the side, and each card in view keeps its full color.                                                                                                                                                                                       | A faded card fails the WCAG text contrast check. The 3D turn still shows the depth.                                                                                                                                 |
| 2026-11-05 | The ring is a slider for a screen reader, with the poem in front as its value.                                                                                                                                                                                                               | The arrow keys, Home and End choose one poem from a list, as a slider does.                                                                                                                                         |
| 2026-11-05 | Craft labels turn on from the More tools menu and the command menu, with a switch for each poem.                                                                                                                                                                                             | The spec layout puts Craft in a side panel with Notes, AI and Comments, and that panel comes in a later phase. The labels themselves need no panel.                                                                 |
| 2026-11-05 | A one-syllable word takes the stress of the meter that fits the line. A word of two or more syllables keeps its CMU stress.                                                                                                                                                                  | CMU gives every one-syllable word a stress, so "Shall I compare thee" would read as all stressed. The plan's test asks for the iambic stress of that line.                                                          |
| 2026-11-05 | A word that the CMU dictionary lacks gets no stress mark.                                                                                                                                                                                                                                    | The `syllable` package counts syllables only, and a guessed stress would mislead.                                                                                                                                   |
| 2026-11-05 | The scan uses the first CMU pronunciation for syllables and stress, and every pronunciation for rhyme.                                                                                                                                                                                       | One count for each word keeps the labels steady. "Temperate" counts 2 syllables, as the dictionary's first form says.                                                                                               |
| 2026-11-05 | The Submissions form checks its own fields (`noValidate`) and shows each refusal as words in the form.                                                                                                                                                                                       | A browser bubble on a number field gives no message that a screen reader keeps, and it differs in each browser.                                                                                                     |
| 2026-11-05 | A tinted Submissions row mixes its quiet text and accent text 25 to 30% toward the main text color.                                                                                                                                                                                          | The theme muted color is 4.5:1 on the page background only. On any tint it falls under WCAG AA.                                                                                                                     |
| 2026-11-05 | The project keeps the words of each local day in `settings.wordsByDay`, from each save.                                                                                                                                                                                                      | Spec section 5 has only timer sessions, and a streak from the timer alone would miss each day the writer types with no timer. The record is about 15 bytes a day and goes in the backup.                            |
| 2026-11-05 | Each day keeps its net change in words, and the Progress screen floors a day at 0.                                                                                                                                                                                                           | "Written today" in the editor counts the same way, so the two numbers agree. A cut and a paste of the same words add nothing.                                                                                       |
| 2026-11-05 | The goal calendar starts each week on Monday.                                                                                                                                                                                                                                                | A rest weekend then sits together at the end of each row.                                                                                                                                                           |
| 2026-11-05 | With no log entry, the network log names the mode of each project on the device, not only the last one.                                                                                                                                                                                      | One project in Reader mode can send, so the page counts each mode. The plan named only the last project.                                                                                                            |
| 2026-11-05 | The badge icon morph runs on `requestAnimationFrame`, not on the Web Animations API.                                                                                                                                                                                                         | Plan decision P1 named the Web Animations API. Safari cannot animate the `d` of a path with it, so the morph writes each frame itself, as CountUp does. It still needs no GSAP.                                     |
| 2026-11-05 | The AI provenance page counts characters of the writer's text. Equations, footnotes and the headings that Vlo adds do not count.                                                                                                                                                             | The spec asks for "the share of AI-origin text". Characters measure a short insert inside a sentence, where words split.                                                                                            |
| 2026-11-05 | The project records the time of its first Co-writer insert in `settings.aiInsertedAt`.                                                                                                                                                                                                       | The export dialog then offers the provenance page after a switch back to Pen, with no scan of every item.                                                                                                           |
| 2026-11-05 | On a phone the Assistant sheet opens only from its button.                                                                                                                                                                                                                                   | The mode dialog says that the panel opens beside the text. On a phone a sheet covers the text, so it waits for the writer.                                                                                          |
| 2026-11-05 | "Do not show this again" for the drawer applies to this device, for each project.                                                                                                                                                                                                            | The setting is about the writer's trust in the drawer, not about one project. Each request still goes in the network log.                                                                                           |
| 2026-11-05 | Ask the manuscript and the continuity check leave out notes.                                                                                                                                                                                                                                 | Notes are research, as in exports. A question about the story should come from its text.                                                                                                                            |
| 2026-11-07 | Vlo calls the Supabase functions through PostgREST with `vloFetch`. It has no supabase-js.                                                                                                                                                                                                   | Each call goes in the network log, and the reader view loads no client library (plan decision S2).                                                                                                                  |
| 2026-11-07 | The share bundle is a reader schema made from the export tree, not `ExportSection` itself. It drops fonts, colors and fills, and each equation goes as a MathML tree.                                                                                                                        | The reader view has less to check, and it never loads MathLive or parses markup (Review Focus 1).                                                                                                                   |
| 2026-11-07 | `ShareRecord` adds `title`, `comments` and `commentsReadAt`.                                                                                                                                                                                                                                 | The Share panel lists each link by its title and keeps the comments it read.                                                                                                                                        |
| 2026-11-07 | The Supabase URL and anon key go in a committed `.env`, and the host goes in `vercel.json` by hand. `vite preview` adds the build's host to the CSP.                                                                                                                                         | Vercel headers are static. A unit test checks that the CSP lists exactly the network module's hosts.                                                                                                                |
| 2026-11-07 | `ai_mode_counts` counts AI requests by mode.                                                                                                                                                                                                                                                 | The spec names the key only. Requests by mode show which modes writers use.                                                                                                                                         |
| 2026-11-07 | A usage report covers the last full ISO week, in local time, and the Library asks only when that week has writing or counts.                                                                                                                                                                 | A report of an empty week tells nothing, and the prompt would come every week.                                                                                                                                      |
| 2026-11-17 | The natural voices are Supertonic 2 in Transformers.js, not Kokoro or Piper.                                                                                                                                                                                                                 | It reads the letters of the text, so it needs no eSpeak NG phonemizer (GPL-3.0), and invented names do not break it.                                                                                                |
| 2026-11-17 | Live dictation does not end a clip at a pause while an earlier clip turns into text.                                                                                                                                                                                                         | A slow device then gets fewer, longer clips, so it never falls behind the writer.                                                                                                                                   |
