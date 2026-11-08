# Vlo status

Last update: 2026-11-08

## Done

- Writing insights (ADR 0006): a stats bar under the text, an Insights panel with full statistics,
  readability and keyword density, an AI writing check trained and tested with `scripts/train-ai-detector.mjs`,
  and an originality check against the writer's own work, pasted sources and, on request, Wikipedia and
  OpenAlex (network purpose `originality`).
- Deep AI check (ADR 0007): the co-writer's in-browser model scores the text with the Fast-DetectGPT
  criterion, with cuts set on the device from reference passages (`scripts/build-deep-references.mjs`).

- Spec saved as `docs/VLO_SPEC.md`.
- Section 17 questions answered.
- Phase 0 plan approved (`docs/plans/phase-0.md`).
- Phase 0 tasks 1 to 7 built on branch `phase-0-foundation` (pull request #2):
  - Vite, React, TypeScript (strict), Tailwind, shadcn/ui pieces, React Router.
  - ESLint network rule (only `src/lib/net.ts` may make network requests).
  - Ink, Paper and Sepia themes, self-hosted fonts, Calm mode and reduced motion (F08).
  - App shell, Library empty state, Settings, 404, route and root error screens.
  - PWA: offline app shell, manifest, update prompt that never reloads a tab by itself (F09).
    Chromium reports no installability errors (CDP check in `tests/e2e/pwa.spec.ts`).
  - `vercel.json` with the CSP and security headers. `vite preview` sends the same headers.
  - Bundle-size check: 121 KB gzip of a 250 KB budget.
  - CI on GitHub Actions, with Playwright on Chromium, Firefox, WebKit and mobile Chrome.

- Phase 0 merged (pull request #2). The product owner imported the repository in Vercel for preview links.
- Phase 1 plan approved (`docs/plans/phase-1.md`), as two pull requests.
- Phase 1 tasks 1 to 9 built on branch `phase-1-core-writing`:
  - Dexie schema with `itemTexts` and `appMeta` (ADR 0003), fractional ordering, word counts with `Intl.Segmenter`.
  - Yjs item documents in `vlo-item-<itemId>` databases. Only the open item loads.
  - Templates for Novel, Memoir and Poetry collection (F03). Library cards with create, rename and delete.
  - Onboarding in three steps with Pen mode preselected and Skip on every step (F13, US15).
  - Binder with mouse, touch, keyboard and menu reorder (F02).
  - Prose and poem editors. Poems keep every space, stanza and hanging indent (F01).
  - Autosave within 1 s, save status, word count, and live sync between tabs (F04, US02).
- Snapshots after every 10 active minutes and on demand, a word diff between any two versions, and restore
  in 2 clicks that saves the current text first (F05, US03). The history panel and `diff` load on first open.
- Focus mode (hides the binder, details and site header; Escape leaves), typewriter scrolling, focus-line
  dimming, a session timer with a gentle close prompt, and a Mod-K command menu that finds items by title or
  text and runs actions (F10, F11). The menu, cmdk and MiniSearch load on first open.
- Library grid and list layouts, a staggered card entrance, card morphs between layouts and into the project,
  and a theme change that spreads from the chosen control. Calm mode and reduced motion stop every animation and
  start no view transition (F14, US14).
- Phase 0 follow-ups: each page sets its tab title and moves focus to its heading after navigation. The update
  notice uses a live region that is always present. Theme radios carry only the theme name. The unchecked switch
  track meets 3:1 contrast. The browser bar takes the theme's page color. Preferences save only after the
  writer's own change, and a cleared storage resets them. The app checks for an update each hour while online.
  An open editor takes a new name at once after a rename. `engines.node` is `22.x`, and Tailwind is a
  development package.
- Gate 1 tests: fixtures for the novel and memoir (spec section 15), a seeded 100,000-word project (40 chapters,
  120 scenes, 30 poems, one 10,000-word scene), a poem round trip that compares every character and hanging
  indent after reload, and the performance budgets. Each time runs to the first painted frame. Local Chromium
  results on the 100,000-word project:
  - Open the 10,000-word scene from the binder: 55 to 96 ms (budget 300 ms). On the phone layout, about 140 ms.
  - Keystroke to the next painted frame, 95th percentile of 200 keys typed 30 ms apart: about 19 ms (budget
    50 ms).
  - Only the open item's `vlo-item-*` database opens.
  - In CI, Firefox opens the scene in 61 ms with a keystroke time of 7 ms. Linux WebKit takes 364 to 567 ms. Its
    log shows the editor library filling the empty editor with all 10,000 words in one step (about 135 ms) and
    then painting (about 45 ms).
  - A cold page load straight to the scene, app start included: 450 to 500 ms on the desktop layout and about
    370 ms on the phone layout, where the binder is closed. The test logs it and does not hold it to the budget.
  - Manuscript blocks use `content-visibility: auto`, which took about 60 ms off the open.
  - The block with the caret always renders (`content-visibility: visible`). After a scene change, WebKit
    kept that block skipped, put the caret before the first word, and the next key deleted the paragraph.
- Binder speed fix: the drag sensors and the sortable list now keep the same objects between renders. Before,
  opening an item re-rendered all 191 binder rows, and WebKit in CI took 383 to 433 ms to open the long scene.
  Now only the 2 changed rows render.
- Design audit (Task 14, impeccable rules applied by hand, because the skill's scripts are not in the
  workspace). Fixed: on phones the project tools took over half of the first screen, so they show icons only
  under 640 px and keep their names for screen readers. Fixed: template labels were in tracked capitals, and now
  use sentence case. Left as they are: the 2 px quote rule on block quotes, white text on the accent color
  (the contrast tests pass), and the prose toolbar that wraps to two rows on phones.
- Review fixes for pull request 2:
  - The History diff runs in a Web Worker with a 10 s limit. A very large change shows "Too many changes to
    mark. Restore still works." and the page stays responsive.
  - Automatic snapshots count active minutes per item across editors, compare against the newest snapshot, keep
    the minutes after a failed save, and tell the writer when a save fails.
  - The session timer ends the session with its real totals when the writer leaves the project or the tab.
  - Turning reduced motion on keeps the open editor, its text and its focus.
  - The timer button reads "Session timer, 10:00 left". Snapshot names show seconds.
  - Typewriter scrolling centers on the visible area above an on-screen keyboard, and centers at once when the
    writer turns it on.
  - The command menu leaves out chapters and parts, shows a snippet for prefix and near-miss hits, and does not
    open over another dialog.
  - The hourly update check stops when the app unmounts. The theme reveal grows from the chosen radio in Safari
    too.
- Phase 1 merged (pull requests #3 and #4).
- Phase 2 plan approved (`docs/plans/phase-2.md`): editor upgrade first (pull requests A1 and A2), then exports
  (pull request B).
- Phase 2 tasks A1 to A5 built on branch `claude/project-thread-9q00v8`:
  - One command registry behind the toolbar, the selection menu, the `/` menu, the command menu (Mod-K) and a
    shortcut sheet (Mod-/). Under 640 px the wide toolbar groups move into the More menu. Alt-F10 moves focus to
    the tools.
  - Text styles: superscript, subscript, highlight and font color (theme palette, custom color, recent colors,
    contrast readout), font size, line spacing, first-line indent, drop caps, alignment and clear formatting.
    Poems get the inline styles only.
  - Special characters: about 900 searchable characters in 10 groups, recent picks first, and quick inserts in
    the `/` menu. Smart punctuation with a switch for prose and one for poems in Settings.
  - Gradient, metallic, prismatic and glowing text with a full gradient editor: color stops, angle dial, look,
    shimmer speed, contrast of the weakest stop, 16 presets and saved looks. Shimmer pauses while the writer
    types, and Calm mode and reduced motion stop it. Keystroke p95 with 500 shimmering runs on screen: about
    26 ms (budget 50 ms).
  - Footnotes: insert from the toolbar, the `/` menu, the command menu or Mod-Alt-F. A note panel edits the note
    with inline styles. A list of notes sits under the text. Numbers follow the text order after every cut,
    paste, undo and change in another tab.
  - Review fixes: a tab with an older Vlo build no longer shares edits with a newer one, and each tab warns
    when another tab runs another version. Item documents carry a schema version, and a build does not open a
    document newer than its own schema. Typing or pasting over a selected footnote goes after it. The note
    panel stays on its footnote when another tab edits the paragraph. Gradient stops can pass each other.
    Smart punctuation changes only quotes, dashes and dots. History word counts leave notes out. In poems,
    highlights and footnote references add no padding. The `/` list follows the page when it scrolls.
- Phase 2 pull request A1 merged (pull request #5).
- Phase 2 task A6 built on branch `claude/project-thread-9q00v8` (pull request A2): equations with MathLive.
  - Equation in a line (prose and poems) and equation on its own line (prose), from the `/` menu, the More
    menu, the poem toolbar and the command menu. A selected piece of LaTeX turns into an equation.
  - The equation panel: a MathLive field, 28 one-press parts in four groups (Basics, Calculus, Matrices,
    Chemistry), a themed symbol keyboard, and a "Show LaTeX" switch (off by default, kept on this device).
    Enter, Done, Escape or a click outside returns to the text after the equation. An equation left empty goes
    away.
  - MathLive, its fonts and its keyboard load on first use only and come from Vlo's own files. They are in the
    offline cache, so equations work offline. Screen readers hear each equation in words.
  - Search text, backups and plain-text copies keep an equation as `$...$` in a line and `$$...$$` on its own
    line. Shift-Tab in a poem never removes an equation or footnote at the start of a line.
  - A tool chosen from a toolbar menu now runs after the menu closes, so a panel it opens keeps its focus.
- Initial JavaScript: 187,284 bytes gzip (budget 250,000). Project route chunk: 196,417 bytes gzip. Command
  menu: 11,087 bytes. History panel: 5,201 bytes. Diff worker: 3,205 bytes.
- Phase 2 task A7 built on the same branch: fonts, page format and page zoom.
  - A font menu (toolbar, selection menu, `/` menu and command menu) with 20 Vlo fonts in six groups: Book
    serifs, Reading-friendly, Display, Sans, Typewriter and Handwriting. A search field, and a preview that
    shows the font under the pointer or focus in a sentence and in italic. A font without its own italic says
    so.
  - The font goes on the selected text, or on the whole project. With no selected text the menu starts on the
    whole project. The project font is the manuscript font for every item in the project.
  - Own fonts: "Show fonts on this device" lists installed fonts in Chrome and Edge after the browser asks the
    writer. Every browser has a "Type a font name" field. A typed name that the device lacks shows a warning
    and a "Use the name anyway" button. The last 8 own fonts stay on this device.
  - Each font file loads the first time text or the preview uses it. Font files sit under `assets/fonts/`,
    out of the install cache, and the service worker keeps each one after its first load.
  - Page format per project: Pageless (default), Letter or A4, from the Page button above the text. The sheet
    has 1 inch margins and 12 point text. After a 600 ms typing pause Vlo draws a dashed line and a page number
    at each page end; the lines hide while the writer types. A page end inside a paragraph moves to the last
    whole line. A window too narrow for readable pages shows the text pageless and says so.
  - Page zoom from 80 to 200 percent on this device, in pageless and page format.
  - Measuring page ends on the 10,000-word scene takes about 1 ms on local Chromium (budget 16 ms).
- Initial JavaScript after A7: 191,229 bytes gzip (budget 250,000). The writing fonts add 5.7 MB of files that
  load one font at a time and are not in the install cache.
- Phase 2 task A8 built on the same branch: cozy scenes.
  - Six scenes around the page: Rainy window, Fireplace, Night sky, Forest, Snowy cabin and Ocean at dusk. The
    Scene button above the text picks one or "No scene". The choice belongs to the project.
  - The page sits on the scene with its own theme background, so the text keeps its contrast. The scene fills
    the space around the page, is never taller than the window, and stays in view while a long text scrolls.
  - Each scene is drawn on a canvas in a worker (OffscreenCanvas), at 30 frames a second, at most 1.5 device
    pixels for each CSS pixel. A browser without OffscreenCanvas draws on the main thread at the same rate.
  - The scene moves only while the writer rests. It stops from the first key until 1.5 s after the last key,
    in a hidden tab, when it is off screen, and in Calm mode or with reduced motion. A CSS picture of each scene
    shows at once and stays when motion is off.
  - Keystroke to paint with a moving scene: p95 about 24 ms on local Chromium (budget 50 ms).
- Phase 2 task A9 built on the same branch: sound.
  - The Sound button above the text opens the sound panel. Nothing plays and no audio context exists until the
    writer presses Play. Pause, the sleep timer and leaving the project stop the sound. A reload is silent.
  - Vlo makes all of its sound as it plays, with Web Audio. Eight nature layers: rain, waves, wind, stream,
    fire, café murmur, forest birds and a night chorus. Five music moods: Lofi, Melancholic, Soulful, Deep
    house and Dream pop, each with its own chords, tempo, swing, drums, bass and room echo.
  - "Match the scene" lets the project's scene set the nature sounds. A slider the writer moves turns it off
    and keeps the mix. In Calm mode a scene starts no sound, and key sounds stay off.
  - Your music: the writer adds music files (MP3, M4A, AAC, OGG, Opus, WAV, FLAC or WebM, up to 50 MB each).
    They stay on the device in IndexedDB and play from a blob: URL, with shuffle, repeat, previous and next.
    A file that is not music, is empty, is too large or does not play gets a message with the reason.
  - A volume for the music, each nature layer and all sound, and a sleep timer of 15 to 90 minutes that fades
    out over 10 s.
  - Typewriter keys (E8): a soft click for each key and a bell for Enter, off by default.
  - The settings stay on the device. No sound sends a request (US09 test with music, nature, own files and
    key sounds on).
  - The sound engine loads on the first Play: initial JavaScript stays at 186,511 bytes gzip.
- Phase 2 task A10 built on the same branch: find and replace, read aloud and writing stats.
  - Find and replace (E1): Ctrl+F (⌘F) opens a bar under the toolbar, and Ctrl+H opens it at Replace. It
    counts the matches ("2 of 7"), marks every match and the current one, and steps with Enter and
    Shift+Enter. Match case and Whole word work in any script. Replace keeps the styles of the words, and
    Replace all is one Undo step. A match stays inside one paragraph or poem line, and an equation or a note
    marker breaks it, so a replacement never changes them. Escape returns to the text with the match selected.
  - Read aloud (E2): reads the selection, or from the sentence at the cursor to the end. It speaks one
    sentence at a time and marks it. A bar under the toolbar holds Pause, Resume and Stop. The voice and the
    speed stay on the device. Vlo lists and uses on-device voices only (`localService`), so no text leaves
    the device, and says so when the device has none. Background sound plays at 30% while it reads.
  - Writing stats (E4) in the details panel: words written today in the project (words added less words
    removed, from the first look each day), and for the open item its words, selected words, characters
    with and without spaces, paragraphs or lines, sentences, reading time (238 words a minute) and read
    aloud time (150 words a minute).
- Design audit of the editor (section 13, impeccable rules applied by hand, because the skill's scripts are
  not in the workspace). A script opened each of the 18 tool surfaces in Ink, Paper and Sepia at 1280 px and
  360 px, and checked axe, page overflow and content wider than its panel. Axe found no serious issue.
  Fixed:
  - On phones the toolbar took two rows. It now fits one row at 360 px, with no separators on phones.
  - On phones History took its own row. It shows as an icon there, like Page, Scene and Sound, and the word
    Saving no longer shows on phones, so the row does not jump on each save.
  - The selection menu scrolled sideways on phones with no sign of more tools. It now wraps to two rows.
  - The find bar wrapped untidily on phones. Find, Previous, Next and Close share the first row, and the
    match options sit before Replace with. Ctrl+H with an empty search goes to Find first.
  - The font panel was 32 px wider than the screen at 360 px. It now fits.
  - Selected text used the system blue. It uses the theme accent, the same as a held selection.
  - Selected words that became an equation lost their spaces, and a % cut off the rest. Spaces between
    words and numbers now stay, and % # & $ stay as typed.
  - The dialog backdrop is a warm tint, and the sound panel headings have no letter spacing.

- Phase 2 pull request B1: the export tree, share-safe export, Markdown and Word (plan Tasks B1 to B4).
  - One export tree (`features/export/model.ts`) feeds every format. It reads each item's stored Yjs
    document in the export worker, with no editor and no DOM. Colors resolve to their Paper values, a
    highlight with no color is the yellow swatch, and only http, https and mailto links stay.
  - Share-safe export (`lib/privacy.ts`) swaps each private name for its alias in the text, the headings,
    the notes and the titles. It matches whole words in any script, prefers the longest name and keeps the
    style of the run where a name starts. The switch is on by default for memoir. People and their aliases
    arrive in Phase 3, so the dialog says that the project has no private names yet.
  - Markdown keeps every poem space: leading spaces become no-break spaces, a run of spaces keeps its
    width, each line ends with a backslash break and a blank line separates stanzas. Footnotes are `[^1]`,
    equations stay as `$...$` and `$$...$$`, and underline, highlight, superscript and subscript use HTML
    tags.
  - Word: every run keeps its spaces, a hanging indent becomes a hanging paragraph indent, an empty
    paragraph separates stanzas and a scene break is a centered "#". Footnotes are Word footnotes, lists
    keep their first number, a drop cap is a framed first letter, and each equation is a Word equation that
    Word and Google Docs can edit. A gradient is a Word gradient text fill, with its first color for other
    readers. The sheet is Letter or A4, from the page format.
  - The export dialog (Export button next to Search, and "Export…" in the command menu): format, this
    item, this chapter or the whole project, and the share-safe switch. After the download it lists what the
    format changes and, for Word, the two steps to Google Docs.
  - Checks: unit tests read each file back (Markdown through markdown-it, Word through its XML). A CI job
    installs LibreOffice, opens the Word files by script and checks the poem spaces and both equations.

- Phase 2 pull request B2: PDF, EPUB, standard manuscript format and the font check (plan Tasks B2 to B7).
  - PDF (`features/export/pdf/`): Vlo lays out each page itself with pdf-lib and puts a subset of each
    font in the file. Poems keep every space and hanging indent, and a copy from the PDF keeps the spaces.
    Footnotes sit at the foot of their page, equations are drawn from their MathML, gradients are a shading
    inside the letters, and only safe links stay. A long project gets a title page and page numbers. The
    sheet is Letter or A4, from the page format.
  - The PDF and EPUB fonts are static TrueType files in `public/fonts/`, each with its OFL text.
    `scripts/fetch-fonts.mjs` downloads them and checks each file against `pdf-fonts.lock.json`. The service
    worker caches each file on its first export, so exports work offline after that.
  - EPUB 3 (`features/export/epub.ts`): one XHTML file for each chapter, a contents page, the fonts in the
    book, footnotes as pop-up notes, equations as MathML and gradients with a first-color fallback. The done
    screen says how to send the book to a Kindle.
  - Standard manuscript format (novels, Word and PDF): the name, contact lines and rounded word count on the
    first page, the title at mid page, a "Surname / TITLE / page" header from page 1, double spacing,
    indented first lines and each chapter a third of the way down a new page. Newsreader 12 pt, or Courier
    Prime with the typewriter switch. The details stay with the project, on this device.
  - The font check: before a PDF or EPUB, the dialog reads the writer's own fonts (only when the browser
    already allows local fonts) and checks each license. A font that forbids embedding, or that the device
    cannot read, gets a stand-in of the same kind, and the dialog names each swap before the file is made.
    After the download, the dialog names each style that the PDF draws by slant or weight.
  - Checks: unit tests read each PDF back with pdf-lib, and with Poppler for the text, the space widths and
    the fonts. The EPUB test opens every part as XML and checks the package, the contents and the poem
    spaces. The CI job "Export files open in other apps" installs LibreOffice and Poppler and runs them all.
    The browser tests download a PDF, an EPUB and a manuscript Word file.

- Phase 2 pull request B3: full-project backup and import, the backup reminder and the Safari install steps
  (plan Task B8, F06, US04).
  - A backup (`features/backup/file.ts`) is one `.vlo.zip` file: `project.json` with every Dexie row of the
    project, `items/<id>.yjs` with each item's text, `items/<id>.md` with a readable Markdown copy,
    `snapshots/<id>.yjs`, and `music/<id>` only when the writer switches on "Include my music".
  - Back up from the card menu in the Library, from the reminder, or with "Back up project…" in the
    command menu. The card shows the last backup date. After 7 days without a backup, and with changes
    since the last one, the card turns to the accent color and the Library shows "Time for a backup".
  - Import backup (Library) checks the whole file before it stores anything: the format and its version,
    each row, each id, each order key, the item tree, and each Yjs update and its schema. A backup of a
    project that is not on this device goes in with its own ids. A backup of a project that is here asks
    first: Replace, or Keep both (new ids and "(copy)" after the title). A failed import removes the text it
    stored.
  - Safari on a Mac, iPhone or iPad shows the steps to install Vlo as an app, in the Library (the writer can
    close them) and in Settings. The steps say that the app has its own storage, so projects move to it
    through backups.
  - Checks: unit tests for the file, the round trip (identical rows and text after a delete and an
    import), replace, copy, music, a failed import, each damaged-file case, the reminder and the Safari
    check. Browser tests back up, import in a fresh profile (US04), keep both, replace, refuse a wrong
    file, show and end the reminder, and show and close the Safari steps.

- Phase 2 pull request B4: folder save in Chromium browsers (plan Task B9, F29).
  - Settings > Backups > Save to a folder: the writer picks a folder once. Vlo keeps the folder in
    `appMeta` and the browser keeps the permission.
  - When the writer leaves a project, or leaves the tab, and the project changed after its last backup, Vlo
    writes two files to a subfolder named after the project: the `.vlo.zip` backup (no music) and one
    Markdown copy of the whole project. Each save replaces the two files. Vlo never deletes a file there.
  - A save to the folder counts as a backup, so the card date and the reminder use it. Settings shows the
    last save, or the save that failed. A failed save never stops the writer, and the text stays in the
    browser.
  - After a browser restart, Chrome asks again. The Library and Settings show "Allow saving to <folder>",
    because the browser takes the answer only from a click.
  - Firefox and Safari have no folder picker, so Settings shows no folder controls there.
  - Checks: unit tests write to a folder in memory (the files, no folder, no permission, no change, a full
    disk). The browser test picks a folder in the private file system of the browser, leaves a project and
    reads the two files back.

- Phase 3 pull request C1: data model version 3 and backup format version 2 (plan Task C1).
  - Dexie version 3 adds the tables of the template views: `cards`, `threads`, `cardLinks`, `lifeStages`,
    `sequences`, `people` and `submissions`. Opening a version 2 database keeps every row and the music.
  - A backup (version 2) holds the rows of these tables. Vlo still imports a version 1 backup. Each
    reference must point to a row of the same file. An import as a copy gives each row a new id and points
    each reference into the copy. An older build refuses a version 2 file, so it cannot drop the new rows.
  - Deleting a project removes its view rows. Deleting an item unlinks its board cards and drops it from
    each poem order. A submission keeps the id, so the tracker can show "Deleted piece".
  - Checks: an upgrade test from version 2, delete rules, a round trip with every new table, the copy remap,
    a version 1 file, and damaged references.

- Phase 3 pull request C2: Story Board, List view and Plot Grid (plan Tasks C2 and C3, F15, F14).
  - A novel project has view tabs under its title: Write, Board and Plot Grid. Each view is a lazy route
    with its own tab title and `h1`. A memoir or a poetry project shows no tabs until its views exist.
  - Board: cards on a canvas. Drag the empty board or use one finger to pan. Use the wheel, a pinch or the
    zoom buttons to zoom, from 10 % to 400 %. "Fit all cards" shows every card.
  - Cards: add, edit (title, note, color, scene), delete with Undo. A card drags with a glide and snaps to
    the 8 px grid. Arrow keys move a focused card by 8 px, Shift and an arrow key by 64 px. A new card goes
    in the middle of the visible board, next to any card that is already there.
  - Threads: add, rename, color, order and delete. Link two cards by a drag from the handle on a card's
    right edge, or with Links… in the card menu. A link on a thread takes its color. A plain link is dashed.
  - "Cards from scenes" (E1) makes a card for each scene that has no card, with its title and synopsis.
  - Double-click or Enter on a card with a scene zooms to the card, then the card grows into the scene
    editor (F14). The scene opens in under 1 s (US05). A card with no scene opens its form.
  - List view: every card in a table that sorts by card, scene, threads or note, with the full card menu.
    Under 600 px the board opens as the List view (decision of 2026-11-02). The canvas is one tap away.
  - Plot Grid: chapters by threads. A card on two threads shows in both columns. "No chapter" and
    "No thread" hold the rest. "Move scene to chapter…" moves the scene to the end of another chapter,
    after the writer picks it in a dialog. "Move to thread…" moves the card's links on that column's thread
    to another thread, and the dialog names the cards at their other ends, which move too. A card with no
    link picks a card to link to. A switch between the board and the grid moves each card to its cell.
    Calm mode switches at once.
  - On a touch screen, the card menu opens on a tap, so a pan or a pinch can start on a card. A second
    finger stops a card drag and pinches the board.
  - Checks: unit tests for the geometry, the glide, the card and thread data, the Plot Grid fixture (3
    chapters, 2 threads, 6 cards), chapter and thread moves, and the thread order. Browser tests for US05, keyboard moves, delete and
    Undo, a link by menu and by drag, list sort, grid cells, a chapter move, a thread move, Calm mode, axe on all three
    views, and touch pan and pinch at 390 px. A pinch over 200 cards with the CPU at a quarter speed keeps a
    median frame of 16.7 ms on local Chromium (Review Focus 3). CI has a 25 ms ceiling for that test.
  - The board chunk is 20 KB gzip (budget 60 KB). The first load is 197 KB gzip (budget 250 KB).

- Phase 3 pull request C3, part 1: Memory Timeline (plan Task C4, F16, US07).
  - A memoir project has a Timeline tab. The track shows life stages as colored bands and memories as cards
    at their dates, stacked when they overlap. A date is a year, a month or a day. A partial date sits at
    the middle of its year or month.
  - The vertical wheel moves the track sideways. Ctrl-wheel and a pinch change the scale, and the Years,
    Months and Days buttons jump to each scale. One finger pans the track on a touch screen.
  - A drag moves a memory to a new date, as exact as the scale: a year at Years, a month at Months, a full
    date only at Days. Left and Right move a focused memory by one unit of the scale. Enter opens it.
  - Undated shelf (E3): memories with no date sit under the track. A drag from the shelf onto the track
    gives a date, and a drag onto the shelf takes it away. Near the top or bottom of the window a drag
    scrolls the page.
  - "Add memory" and each memory's form set the title, the date, the life stage and the themes. "Life
    stages" adds, renames, dates, colors, orders and deletes the stages. A deleted stage leaves its memories
    in place.
  - By theme (US07): a column for each theme, with each memory once under each of its themes, and "No
    theme" for the rest. The memory count stays the same. The cards move to their columns with a view
    transition. Calm mode switches at once.
  - List view: every memory by date, undated ones last. Under 600 px the timeline opens as the List view.
  - Checks: unit tests for dates (parse, spans, scale units, drops, key steps, words, rows, axis marks)
    and for the memory and life stage data. Browser tests for US07, drags on the track and to and from the
    shelf, key steps at each scale, life stages, Calm mode, axe on all three views, and touch pan and pinch
    at 390 px.
  - The timeline chunk is 11 KB gzip (budget 60 KB).

- Phase 3 pull request C3, part 2: People and private names (plan Task C5, F17, US06, E5).
  - A memoir project has a People tab. Each person has a label and one or more real names, each with an
    alias ("Aunt Rosa" to "Aunt Maria", "Rosa" to "Maria"). A real name belongs to one person. A deleted
    person comes back with Undo, and the marks in the text find the person again.
  - The `privateName` mark (spec section 5) holds the person id in the item's Yjs text (plan decision D3).
    The document schema is now 4, so an older build never opens a text with marks. Typing inside a name
    keeps the mark, and typing after it does not. Clear formatting keeps the mark. A marked name has a
    dotted line under it.
  - "Mark as person" is in the selection menu, the More tools menu and the command menu. The panel picks a
    person, or adds one with the selected text as the real name. "Mark all names" on the People screen marks
    every exact whole-word match in the project, longest name first: "Rosa" never matches "Rosalind"
    (Review Focus 1). Open editors get the marks at once.
  - "Show aliases" in the More tools menu shows each alias in place of the real name. The text does not
    change. A real name with no mark shows a dashed edge.
  - Share-safe export puts the alias of the matching name in place of each marked name, then each unmarked
    match, in the text, the headings, the notes and the titles. Marked text that an edit split gets the
    person's first alias, so no part of the real name shows (Review Focus 2).
  - Name check before export (E5): the export dialog lists each unmarked real name with a count, and marked
    text that is no longer a name, before the file is made. "Mark all" marks them from the dialog.
  - A backup imported as a copy points each mark in the text and the snapshots to the copy's people.
  - Checks: unit tests for the person rules, Mark all, the scan counts, the copy remap, the mark through
    edits, a reload, a clear of the formats and a snapshot restore, exact poem spaces, and share-safe
    export with marks. The leak test (US06) exports the memoir fixture to Markdown, Word, EPUB, PDF and
    standard manuscript format in Word and PDF, reads each file back as text, and finds "Rosa" and "Teo" 0
    times. Browser tests for US06, Mark as person, the name check, Show aliases, delete with Undo, and axe,
    at desktop and phone widths.
  - Fixes after the code review of C3 part 2:
    - Names match in the same way everywhere: curly and straight apostrophes, no-break and plain spaces,
      and both Unicode forms of an accent count as the same text. Mark all, the scan, Show aliases, the
      name check and the export all use one match.
    - A mark on "Rosa and Teo" gives each name its own alias, and the check lists "Teo" as unmarked.
    - A name in a note that two styles split is swapped. An equation gets the aliases. A link whose
      address holds a real name keeps its text and loses its address.
    - An alias with "$" in it stays as typed.
    - The export and Mark all read the people from the database at that time, so a person added a moment
      before is never missed. The dialog ignores a Mark all result that comes after Back.
    - Undo of a deleted person keeps a real name that another person took in the meantime with that
      person, and says so. The People fields put the saved value back when a change is refused.

- Phase 3 pull request C4, part 1: Collection Sequencer (plan Task C6, F18, US08, E2).
  - A poetry collection has a Sequences tab and the command "Open the Collection Sequencer". The poet
    keeps named orders of the same poems, for a chapbook, a contest or a reading. A new order starts in
    binder order. Rename, Copy and Delete with Undo act on the order on show. The binder never changes.
  - Each poem is a card with its number, title, words and status. A drag, the keyboard (Space, the arrow
    keys, Space) or the card menu (Move to the start, Move earlier, Move later, Move to the end) moves it.
    A drop settles with a small spring. Calm mode drops at once.
  - Each order is independent (US08). A new poem joins the end of each order. A deleted poem leaves each
    order with no gap (Review Focus 4).
  - The ring preview stands the titles on a 3D ring. A drag, the wheel or the arrow keys, Home and End
    turn it, and it settles with the nearest poem in front. A screen reader hears it as a slider with the
    poem in front as its value. Calm mode and reduced motion show a still numbered list.
  - Export (E2) opens the export dialog with "This order" chosen. The file holds the poems in the order,
    with the order name after the project title.
  - Checks: unit tests for the order data (US08, new and deleted poems, copy, rename, delete with undo),
    the ring (front poem, radius, keys, a changed order, the still list) and the order export. Browser
    tests for US08 after a reload, keyboard reorder, the ring keys, copy, rename, delete with Undo, a new
    poem, the export of an order, Calm mode, and axe, at desktop and phone widths.

- Phase 3 pull request C4, part 2: Craft labels (plan Task C7, F19, Review Focus 6).
  - In a poetry collection, "Craft labels" in the More tools menu and the command menu turns the labels on
    for the open poem. Each poem keeps its own switch, off by default, and a backup carries it.
  - Each line shows its syllable count and rhyme letter at the end, and a stress mark above each syllable
    (˘ unstressed, / stressed). A line under the labels tells the poet what each label means. A screen
    reader gets the same facts as a list: "Line 1: 10 syllables, iambic, rhyme A".
  - The scan runs in a Web Worker after each typing pause of 250 ms. The CMU pronouncing dictionary (958 KB
    gzip) loads with the first scan and stays out of the install. The service worker caches it on first
    use (plan decision D2). A word that the dictionary lacks gets its syllables from `syllable` and no
    stress mark.
  - Stress: a word of two or more syllables keeps its CMU stress. A one-syllable word and a secondary
    stress take the stress of the meter that fits the line (iambic, trochaic, anapestic or dactylic). With
    no meter, a small word such as "the" is unstressed. "Shall I compare thee to a summer’s day" scans as
    10 iambic syllables.
  - Rhyme: two lines rhyme when the phones of their last words match from the last stressed vowel. "Cough"
    and "bough" do not rhyme, and "bough" and "cow" do.
  - The labels sit in a layer outside ProseMirror, so the poem text never changes. A changed line hides its
    labels until the next scan. Only lines within one screen of the view get label elements, so a key on
    a 300-line poem takes about the same time as with the labels off. Each line fades in with a short
    stagger. Calm mode and reduced motion show the labels at once.
  - Checks: unit tests for the scan (the Shakespeare line, trochaic and plain stress, unknown words,
    apostrophes, rhyme by sound, letters after Z, 300 lines in under 100 ms), the switch, and the backup
    check. Browser tests for F19 with a reload, a changed line, the text kept the same, axe, the dictionary
    out of the install, and Review Focus 6: on 300 lines the labels came 30 to 40 ms after the scan
    request, and each key took 7 to 32 ms from key to screen (budget 50 ms).

- Phase 3 pull request C5, part 1: Submissions tracker (plan Task C8, F20, E4).
  - Every template has a Submissions tab after its views, and the command menu has "Open Submissions".
  - "Log a submission" opens a form above the table, so the writer sees the earlier rows while typing. A
    row holds one or more pieces (any item but a note), the venue, the sent date, the status, the reply
    date and notes. The venue box suggests the earlier venues.
  - The table sorts by each column in both directions. Text sorts without regard to case, and an empty
    reply date or note goes last. On a phone each row is a block and a "Sort by" box sorts.
  - The status box in each row saves at once. The row eases to the tint of the new status: a gray tint for
    Accepted, quiet text for Declined, Withdrawn and No reply. The status text always shows too.
  - E4: each venue keeps its own follow-up days, 90 by default. " agni " and "Agni" are the same venue. A
    sent piece with no reply after those days gets the accent tint and a "Follow up" badge. A backup
    carries the days.
  - A deleted piece stays in its rows as "Deleted piece". Delete has Undo.
  - Checks: unit tests for the dates, follow-up, sort, the draft checks, the data functions and the backup
    check. Browser tests for F20 with a reload, sort, status change, edit, E4 in each theme with axe, a
    deleted piece, delete with Undo, and the tab and command on every template, at desktop and phone widths.

- Phase 3 pull request C5, part 2: Progress (plan Task C9, F21).
  - Every template has a Progress tab after Submissions, and the command menu has "Open Progress". The tab
    row scrolls on a phone and brings the tab of the screen into view.
  - The total words and the timer sessions count up from 0. Calm mode and reduced motion show the numbers
    at once, and a screen reader hears the final number only.
  - The map has one tile per item in binder order, filled by status: a dashed edge for Idea, a light accent
    for Draft, a deeper accent for Revised and the full accent for Done. A key above it counts each status.
    The tiles enter as a mosaic from the center. A tile opens its item, and a part or chapter opens its
    first scene. Submissions links a part or chapter the same way.
  - The daily goal and streak are off by default. With them on, the writer sets the words a day (500 at
    first) and the rest days. The screen shows today's words against the goal, the streak, the best streak
    and the last 4 weeks as a calendar, Monday first.
  - Each save adds the change in words to the local date of that moment. A day keeps its net change, so a
    cut and a paste of the same words add nothing. The screen floors a day at 0, as "Written today" does. A met day counts. A rest day under the goal keeps the streak and adds nothing.
    Today keeps the streak open until it ends. Days are calendar dates, so a daylight saving change never
    makes or loses a day.
  - Checks: unit tests for the streak rules, time zones and daylight saving changes, the day record on
    save, the goal settings, the item that a tile opens, and the backup check. Browser tests for F21, the
    rest day, the goal limits, a reload, the mosaic and Calm mode, the tab and command on every template,
    and axe, at desktop and phone widths.

- Code review of Submissions and Progress (10 findings, all fixed):
  - Each day keeps its net change in words (see Decisions).
  - The tile and link targets come from one pass over the binder, so a binder of thousands of items stays
    fast.
  - Focus: the form heading takes focus when the form opens. Save and Cancel put focus on the button that
    opened the form. Undo puts focus on the restored row.
  - On a phone the sort header buttons leave the tab order, and the "Sort by" box sorts.
  - The piece list in the form is in binder order.
  - A venue named "constructor" or "toString" gets the default follow-up days.
  - The day key follows the device time zone at once after a flight.
  - The tab row scrolls only itself, never the page, and it no longer widens the page at 360 px.
  - A rest day changes inside the write, so quick taps on several days keep each one.
  - The status box in a row shows the new status at once and goes back only when the save fails.

- Phase 4 Task D1: network module and network log (F25, US09).
  - Dexie version 4 adds the table `networkLog`. The upgrade keeps every row of version 3 (upgrade test).
  - `vloFetch` sends only to the hosts on the list for each purpose, over https (http only for Ollama and
    LM Studio on localhost). It refuses any other host before a request starts. It sends no cookie and no
    referrer.
  - Each request writes one log entry: host, path, purpose, bytes sent and the HTTP status, or "error". The
    log keeps no text, key or header, and it keeps the newest 1,000 entries.
  - `/network` shows the log newest first, with a purpose filter and "Clear log" with Undo. On a phone each
    request is a small block. The footer link "See the network log" opens it from each screen.
  - US09 browser test: 60 s of typing, find, an export, the views and a backup in Pen mode send no request
    off the app, load no AI code, and the log says "0 requests.".

- Phase 4 Task D2: AI mode setting, badge and dialog (F23).
  - The mode badge ends the row of view tabs, so it shows on every project screen. Pen is quiet, Reader has
    the accent line, and Co-writer is filled. Its button is 44 px tall.
  - The badge icon morphs between a pen, an eye and two pens. Each icon is two closed shapes of 6 cubic
    curves, so the morph moves point by point. Calm mode and reduced motion swap the icon at once.
  - The mode dialog lists the three modes. A choice other than the current mode lists what will change, and
    the switch happens only on "Switch to … mode". A memoir with aliases on says that requests carry
    aliases.
  - The command menu has "Change AI mode…" and, outside Pen, "Turn off AI (Pen mode)", which switches at
    once with no confirm.

- Phase 4 Task D3: engine layer and adapters (F24).
  - One `Engine` interface streams text for each adapter: OpenAI-compatible (OpenRouter, Groq, Gemini,
    Ollama, LM Studio), Anthropic and WebLLM. Stop ends the stream at once and keeps the words so far.
  - Anthropic uses raw HTTP through `vloFetch` with `anthropic-dangerous-direct-browser-access`, and streams
    only the text blocks. A refusal and an overload have their own messages.
  - Errors: 401 and 403 say the key is wrong, 429 shows the provider's words once with no retry, a blocked
    request says that the provider may block requests from a browser, and a local server that is off gets
    setup help such as `OLLAMA_ORIGINS`.
  - WebLLM 0.2.87 is its own chunk in `assets/ai-model/`, outside the install precache, with a cache-first
    runtime cache. Each model download goes in the network log as a model download.
- Phase 4 Task D4: keys and free-tier terms (F24, US11).
  - A key stays in memory for the tab. "Remember on this device" stores it with AES-GCM under a key from the
    passphrase (PBKDF2, SHA-256, 600,000 rounds). Three wrong passphrases lock it for 30 seconds.
  - OpenRouter, Groq and Gemini show their data terms in plain words, and a key works only after the writer
    ticks the box.
- Phase 4 Task D5: Reader actions, the Assistant panel and the "What will be sent" drawer (F23, US10).
  - The Assistant panel loads only outside Pen mode (15 KB gzip). It is a right column beside the text, and
    a bottom sheet on a phone. It opens by itself on a large screen when the writer turns AI on.
  - Reader actions: Feedback, Ask the manuscript (MiniSearch, top 8 passages under 3,000 tokens),
    Summarize for synopsis ("Use as synopsis" writes the synopsis field), Suggest tags or themes, and the
    continuity check.
  - The drawer shows the exact text, the host and the tokens before each request. "Do not show this again"
    turns it off on this device. A memoir with aliases on sends aliases, and the answer shows the real
    names again.
  - A Reader answer has no Insert and is no drag source (US10 browser test).
- Phase 4 Task D6: Co-writer actions, the AI mark and the provenance page (F23, F26).
  - Co-writer adds Continue (50 to 300 words), Rewrite selection, Three alternatives and Brainstorm.
  - Insert puts the draft at the cursor, or in place of the words it rewrites, with the `aiOrigin` mark
    (provider, model, time). One Undo takes out the whole draft. Text that the writer types, also inside AI
    text, is the writer's own. A paste, a drop and a snapshot restore keep the mark.
  - `DOC_SCHEMA` is 5, so an older build does not open a document with AI marks.
  - "Show AI text" in More tools tints AI words with a dashed line. Clear formatting keeps the mark.
  - The export dialog offers "Add an AI provenance page" in Co-writer mode and in each project with AI text.
    The page gives the share of AI text for the export and for each item, and the models.
- Phase 4 Task D7: AI policy page.
  - `/ai-policy` states the four rules of spec section 10 with a version and a date. `docs/ai-policy.md`
    holds the same words, and a unit test keeps the two the same. The footer links to it.
- Phase 4 code review fixes (before the Phase 4 pull request).
  - A memoir AI request aliases each name that the writer marked anywhere in the memoir, such as "Gran"
    marked as Rosa, with the alias that a share-safe export prints. Vlo reads each item once, and again
    after it changes. While the people load, or when Vlo cannot read the marks, the panel sends nothing.
  - A share-safe export with the provenance page counts the AI mark on aliases too.
  - A plain-text paste or a drop of the writer's own words inside AI text is the writer's. A paste or a
    move of AI text keeps its mark. Words typed with an input method get the same rule when the
    composition ends.
  - A rewrite keeps the place of its words. If the writer types before them, Vlo finds the words again by
    a single match. Each "Insert version N" replaces the version before it. If the words changed, the card
    asks the writer to select the words to replace. After an Insert the cursor goes after the new words.
    Before this fix, the new AI words stayed selected, and the next key replaced them.
  - The in-browser model gets at most 1,000 tokens of other passages, and Vlo refuses a request that does
    not fit in 3,500 tokens with its answer. The models read 4,096 tokens.
  - "Stop loading" stops a model load, and Pen mode stops it too. WebLLM cannot stop a download in the
    middle of a file, so the file ends and Vlo then frees the model. The fix found a second bug: the
    download log read the last entries in a wrong way, so each in-browser model load failed at its end. A
    unit test now loads a fake model.
  - Change engine has the switch "Show what will be sent before each request", so a writer who chose
    "Do not show this again" can turn the drawer back on. The drawer focuses the exact text, not Send.
  - Focus stays in a useful place after Stop, Remove and the key dialog. "Prepare the request" waits for
    the request before it takes a second press.

## In progress

- Phase 2: every pull request merged.
- CI: the free Actions minutes ran out in November. A pull request now runs the checks, the export files job
  and Chromium, and skips a change to docs only. "Run workflow" on the Actions tab runs all four browsers;
  run it before each phase gate. Until the minutes reset, run every check in the build container before each
  push.
- Phase 4: pull request #12 merged on 2026-11-06. The checks by hand for OpenRouter and Groq with a key,
  the in-browser model on WebGPU, and input method typing inside AI text are still open.
- Phase 5: the plan is `docs/plans/phase-5.md`, approved on 2026-11-07. E0 to E6 are built on the branch
  `claude/project-thread-9q00v8`. Sharing stays off in each build until the Supabase project exists
  (`docs/sharing-setup.md`, decision S1): the product owner makes it and gives the URL and the anon key.
  Then the values go in a committed `.env`, and the host goes in the CSP in `vercel.json`.
- Phase 5, Gate 5: a fresh security review found no critical issue. Its high findings are fixed: long quotes,
  share records kept on Replace import, comments read before Stop sharing, and the project limits in
  migration 0004. The minor findings are fixed too: purpose data in the seal, a size cap on opening, safe
  MathML values, the grants and search path of each function, and clearer messages.
- The craft labels timing test (`craft.spec.ts`, Review Focus 6) fails at times on the first keystroke in
  the build container: 47 to 120 ms against a 50 ms limit. The main branch fails it 4 times in 5 there, so
  Phase 5 did not cause it. The later keystrokes take 7 to 29 ms. It needs a look in Phase 6.
- Phase 5, open by hand: a real Supabase project with the 4 migrations, a share opened on a real phone, and
  the keepalive workflow once the Actions minutes reset.
- Phase 3: the plan is `docs/plans/phase-3.md`, approved on 2026-11-05. C1 (data model and backup format) and
  C2 (Story Board, Plot Grid and List view) are in review. C3 (Memory Timeline, People and private names) is
  built. C4 (Collection Sequencer and Craft labels) is built. C5 (Submissions and Progress) is built. Gate 3 is next.
- Chromium stops when a page reads a folder back from IndexedDB in a private profile (Playwright test
  contexts). The folder save browser test uses a profile on disk. Check folder save in a Chrome Incognito
  window by hand.
- Left for later: an EPUBCheck run in CI. EPUBCheck needs Java and a download from outside npm, so B2 uses
  its own structure test.
- Real Safari: check the 300 ms open budget by hand in Phase 6. CI WebKit runs on Linux and has a 700 ms ceiling.
- Real Safari: check typing with 500 shimmering runs (budget 50 ms) by hand. Pull request A1 merged, and this
  check has no result yet. CI WebKit has a 120 ms ceiling for that test.
- Real Safari: check plain typing on the 10,000-word scene (budget 50 ms) by hand in Phase 6. CI WebKit has a
  100 ms ceiling for that test.
- Real Safari: check typing with a moving scene (budget 50 ms) by hand in Phase 6. CI WebKit has a 150 ms
  ceiling for that test. It takes 122 to 207 ms there. Timing each part alone showed the page shadow and the
  scene layer cost the most. A scene image and a shadow layer did not help, so they were taken back.
- CI Firefox: 3 to 9 tests a run time out in their first page.goto, on every run since the first phases. Each
  one passes on its retry. The stuck load never reaches DOMContentLoaded, so the stall is before the page
  runs. A wait for the HTML first and a fixed 127.0.0.1 address did not change it, so both were taken back.
- Known after review, left for later: while the gradient editor is open, the selected words show in plain
  theme color, and the preview shows the look. Each step of a color or gradient drag is one change, and the
  undo history groups changes within half a second. Ctrl+Shift+J (Justify) and Cmd+, (Subscript) are TipTap's
  keys, and some browsers keep those keys for themselves. Palette colors copy into other apps without their
  color; exports resolve them in pull request B.
- Firefox in CI: about one `page.goto` in 50 waits 30 s for the load event, then passes on retry. Main showed the
  same thing in Phase 0. Firefox does not run in the build container, so the cause is still open. The CI
  retry covers it.

- Two board timing tests are sensitive to load in the build container. "US05: a double-click on a linked
  card opens its scene in under 1 s" failed twice and "a pinch over 200 cards keeps 60 frames a second"
  failed twice on the phone profile, each time with two workers running other tests beside them. Each
  passed every time alone (US05 9 times, the pinch 2 times). CI runs one worker.
- "Review Focus 6" in craft.spec (typing with Craft labels on a 300-line poem) fails most runs alone in the
  build container: 3 of 4 runs with the AI mark taken out of the poem schema, and 4 of 4 with it. In each run
  only the first key is slow (39 to 125 ms), and the other 7 keys take 10 to 37 ms. CI runs it on a quieter
  machine.
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

| Date       | Decision                                                                        |
| ---------- | ------------------------------------------------------------------------------- |
| 2026-11-02 | Repository: `Sophie-S-Z/vlo`.                                                   |
| 2026-11-02 | License: MIT.                                                                   |
| 2026-11-02 | Hosting: Vercel, built from GitHub (ADR 0002).                                  |
| 2026-11-02 | Supabase project: create in Phase 5.                                            |
| 2026-11-02 | Phones: full editing. Board and timeline show as lists under 600 px.            |
| 2026-11-02 | AI presets: OpenRouter, Anthropic, Groq, Gemini, Ollama, LM Studio.             |
| 2026-11-02 | Manuscript font: Newsreader 12 pt, with a Courier-style option.                 |
| 2026-11-02 | Marketing site: https://vlo-landing-page.vercel.app/                            |
| 2026-11-02 | Phase 1 motion uses CSS and View Transitions, no GSAP (plan decision 1).        |
| 2026-11-02 | Plain-text copies of items live in `itemTexts` (ADR 0003).                      |
| 2026-11-03 | Phase 2 order: editor upgrade, then exports.                                    |
| 2026-11-03 | Gradient and metallic text shimmers only when typing stops.                     |
| 2026-11-03 | Math: MathLive. Page format: one sheet with page-end lines.                     |
| 2026-11-03 | Sound: generated in the browser, plus the writer's own files.                   |
| 2026-11-03 | Google Docs: a Word download, then open it in Google Docs.                      |
| 2026-11-03 | About 20 Vlo fonts plus own fonts, with a warning before a font swap.           |
| 2026-11-05 | Phase 3 plan approved as written: no GSAP, extras E1 to E5, 3 packages.         |
| 2026-11-05 | CI on pull requests: checks, export files and Chromium. All browsers by hand.   |
| 2026-11-07 | Phase 5 plan approved: decisions S1 to S8 and the PGlite test package.          |
| 2026-11-07 | Share links are sealed in the browser, with the key in the fragment (ADR 0004). |

## Spec changes

| Date       | Change                                                                                                                                                                                                                                                                         | Reason                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-02 | `vercel.json` replaces `public/_headers`.                                                                                                                                                                                                                                      | Hosting moved to Vercel.                                                                                                                                                                                            |
| 2026-11-02 | The CSP has no Supabase host until Phase 5.                                                                                                                                                                                                                                    | The spec value is a placeholder.                                                                                                                                                                                    |
| 2026-11-02 | Routes arrive in the phase that builds their screen.                                                                                                                                                                                                                           | No placeholder screens (section 0, rule 8).                                                                                                                                                                         |
| 2026-11-02 | Paper adds `--accent-text: #B83E28`.                                                                                                                                                                                                                                           | `#C8452D` on `#F5F1E8` is 4.29:1 and fails WCAG AA for body text.                                                                                                                                                   |
| 2026-11-02 | Sepia adds surface `#F6ECD9`, muted `#6E5D48`, rule `#DCCBAA`.                                                                                                                                                                                                                 | The spec gives only three Sepia colors.                                                                                                                                                                             |
| 2026-11-02 | TypeScript 6.0, not 7.0.                                                                                                                                                                                                                                                       | typescript-eslint 8.72 supports TypeScript below 6.1.                                                                                                                                                               |
| 2026-11-02 | ESLint 9.39, not 10.                                                                                                                                                                                                                                                           | eslint-plugin-jsx-a11y 6.10 supports ESLint up to 9.                                                                                                                                                                |
| 2026-11-02 | The CSP adds `manifest-src 'self'`.                                                                                                                                                                                                                                            | Tighter than the `default-src` fallback, same effect.                                                                                                                                                               |
| 2026-11-02 | `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`.                                                                                                                                                                                                         | File names carry a content hash.                                                                                                                                                                                    |
| 2026-11-02 | The SPA rewrite skips `/assets/`, `/icons/`, `/sw.js`, `/workbox-*` and the manifest.                                                                                                                                                                                          | A missing file must return 404, never `index.html`, or the service worker can cache HTML as a script.                                                                                                               |
| 2026-11-02 | In WebKit the offline test checks only the precache.                                                                                                                                                                                                                           | Playwright cannot load a service-worker page in WebKit with the network off. Real Safari is a manual check in Phase 6.                                                                                              |
| 2026-11-02 | `@tiptap/y-tiptap` and `y-protocols` replace `y-prosemirror`.                                                                                                                                                                                                                  | `@tiptap/extension-collaboration` 3.32 needs them as peers.                                                                                                                                                         |
| 2026-11-02 | Shared-element transitions use React's `<ViewTransition name>`, not Motion `layoutId`.                                                                                                                                                                                         | React Router 8 deprecates its `viewTransition` option and points to React 19.3 `<ViewTransition>` (rule 11).                                                                                                        |
| 2026-11-02 | Two tabs on one item sync live through `BroadcastChannel`.                                                                                                                                                                                                                     | Better than the planned notice alone. Yjs merges both tabs, so no typing is lost.                                                                                                                                   |
| 2026-11-03 | Focus-line dimming uses 70 % opacity, not 40 %.                                                                                                                                                                                                                                | 40 % gave 2.2:1 to 3.3:1 contrast. 70 % meets WCAG AA in every theme (product owner decision).                                                                                                                      |
| 2026-11-03 | CI WebKit holds the open budget to a 700 ms ceiling. Real Safari is checked by hand in Phase 6.                                                                                                                                                                                | Linux WebKit in CI takes 364 to 567 ms and varies by up to 200 ms per run (product owner decision).                                                                                                                 |
| 2026-11-03 | CI WebKit holds plain typing on the 10,000-word scene to a 100 ms ceiling. Real Safari is checked by hand in Phase 6.                                                                                                                                                          | Linux WebKit in CI takes 58 to 65 ms at p95 for this test. Chromium and Firefox stay under 50 ms (product owner decision).                                                                                          |
| 2026-11-03 | CI WebKit holds typing with 500 shimmering runs to a 120 ms ceiling. Real Safari is checked by hand before A1 merges.                                                                                                                                                          | Linux WebKit in CI repaints every visible fill run on each key. A paint layer for texts with fills cut p95 from 141 ms to 65 ms, and runners vary by up to two times (product owner decision).                      |
| 2026-11-04 | CI WebKit holds typing with a moving scene to a 150 ms ceiling. Real Safari is checked by hand in Phase 6.                                                                                                                                                                     | Linux WebKit in CI paints in software and takes 122 to 207 ms at p95 for this test. Chromium and Firefox stay under 50 ms (product owner decision).                                                                 |
| 2026-11-02 | Storage health says "Unknown" and "Limit for Vlo", not "Not available" and "Quota".                                                                                                                                                                                            | "Limit for Vlo" says what the number means. "Unknown" matches the other rows.                                                                                                                                       |
| 2026-11-03 | New marks beyond section 7: `superscript`, `subscript`, `highlight` (color), `textStyle` (color, font size), `textFill`.                                                                                                                                                       | Phase 2 editor tools (plan decision 12).                                                                                                                                                                            |
| 2026-11-03 | New attributes: `textAlign`, `lineSpacing`, `firstLineIndent` and `dropCap` on paragraphs and headings.                                                                                                                                                                        | Phase 2 block tools, prose only.                                                                                                                                                                                    |
| 2026-11-03 | New node: `footnote`, an inline atom with its note in `content`. Poem lines hold `inline*`, not `text*`.                                                                                                                                                                       | Footnotes in prose and poems (plan decision 4). Hard breaks stay off in poems.                                                                                                                                      |
| 2026-11-03 | Item documents store a schema version (`vlo` map, key `schema`, now 2). Tabs share edits only with tabs of the same schema, on a channel named for it.                                                                                                                         | A Phase 1 tab drops formats it cannot show, and Yjs saves that loss. The guard keeps each later schema change safe.                                                                                                 |
| 2026-11-03 | New nodes: `mathInline` (prose and poems) and `mathBlock` (prose only), atoms with the LaTeX in `latex`. Item document schema is now 3.                                                                                                                                        | Equations (plan Task A6). A build with schema 2 does not open a document that has equations, so it cannot drop them.                                                                                                |
| 2026-11-03 | New package: `mathlive` 0.111.4 (MIT), loaded on first use. Its fonts and keyboard are in the offline cache, which adds about 1.1 MB to the first install.                                                                                                                     | Approved with the Phase 2 plan. Equations work offline, and Pen mode sends no request outside the app.                                                                                                              |
| 2026-11-03 | Fonts use the variable `@fontsource-variable` packages where they exist, and `@fontsource` for Spectral, IM Fell English, Courier Prime and Kalam.                                                                                                                             | Rule 11: the plan named `@fontsource`. One variable file per style covers every weight, so a bold word loads no second file.                                                                                        |
| 2026-11-03 | New attribute: `font` on `textStyle`, a Vlo font id or `local:` and an installed font's name. New project settings: `font` and `page`. Schema stays 3.                                                                                                                         | Fonts and page format (plan Task A7). Schema 3 is new in this same pull request, so no released build lacks the attribute.                                                                                          |
| 2026-11-03 | The writing fonts are not in the install cache. The service worker caches each font file on its first load.                                                                                                                                                                    | 20 fonts add 5.7 MB. A font the writer never used is not offline; its text shows in the project font until the device is online once.                                                                               |
| 2026-11-03 | Page format text is 12 point, and every block lays out at once on the sheet.                                                                                                                                                                                                   | Page ends then match a printed page, and the measure reads each block's real height. Pageless keeps skipping the layout of blocks far off screen.                                                                   |
| 2026-11-03 | Page zoom (E7) and page format sit in a Page button above the text. Zoom is per device; the page format is per project.                                                                                                                                                        | Zoom suits the screen. The page format suits the manuscript, so every item and every tab follow it.                                                                                                                 |
| 2026-11-03 | New project setting: `scene`, a scene id or `none`. An unknown value shows no scene.                                                                                                                                                                                           | Cozy scenes (plan Task A8). The scene suits the project, so every item and every tab follow it.                                                                                                                     |
| 2026-11-03 | Scenes draw in a worker on an OffscreenCanvas and stop while the writer types.                                                                                                                                                                                                 | Scene motion then never competes with typing. The CSS picture covers Calm mode, reduced motion and the first frame.                                                                                                 |
| 2026-11-03 | The Scene button sits next to the Page button above the text, not in the toolbar.                                                                                                                                                                                              | The toolbar holds tools for the words. A scene, like the page format, is a setting for the whole project.                                                                                                           |
| 2026-11-03 | A tool chosen from a toolbar menu runs after the menu closes.                                                                                                                                                                                                                  | On a phone, the closing menu took focus from the equation panel and closed it. Footnote had the same risk.                                                                                                          |
| 2026-11-03 | Footnote numbers are not stored. A plugin counts them in text order.                                                                                                                                                                                                           | A stored number goes stale after a cut, a paste, an undo or a change in another tab.                                                                                                                                |
| 2026-11-03 | An item's plain-text copy ends with its notes under "Notes". Word and line counts leave the notes out.                                                                                                                                                                         | Search finds notes and readable backups keep them. Counts match the writing itself.                                                                                                                                 |
| 2026-11-03 | A copy from a Vlo poem pastes into a poem with its styles and footnotes. Text from other apps still pastes as plain text.                                                                                                                                                      | Phase 2 gives poems inline styles, and the plain-text paste dropped them. A copy inside one line now stays one line in plain text too.                                                                              |
| 2026-11-03 | Gradient text is allowed in the writer's own words, and the toolbar never uses it.                                                                                                                                                                                             | The product owner asked for gradient and metallic text. Interface surfaces keep plain colors.                                                                                                                       |
| 2026-11-03 | Scenes count as artwork, not interface surfaces, so they can use gradients and motion.                                                                                                                                                                                         | Section 13 bans gradients on interface surfaces (plan decision 12).                                                                                                                                                 |
| 2026-11-03 | New Dexie table `audioFiles` (database version 2) for the writer's own music files.                                                                                                                                                                                            | Plan decision 10. Music files stay on the device. The upgrade keeps every row of version 1 (upgrade test).                                                                                                          |
| 2026-11-03 | The CSP adds `media-src 'self' blob:`.                                                                                                                                                                                                                                         | The writer's own music plays from a blob: URL. No outside host is allowed.                                                                                                                                          |
| 2026-11-03 | The sound engine is a separate chunk that loads on the first Play.                                                                                                                                                                                                             | Initial JavaScript stays inside the budget, and a writer who never plays sound never loads it.                                                                                                                      |
| 2026-11-03 | Sound stops when the writer leaves the project.                                                                                                                                                                                                                                | The sound belongs to the writing session, and the next project can have another scene.                                                                                                                              |
| 2026-11-03 | The Sound button sits next to the Scene button above the text, not in the toolbar.                                                                                                                                                                                             | The toolbar holds tools for the words. Sound, like the scene, is a setting for the writing room.                                                                                                                    |
| 2026-11-03 | Music tempos run from 68 to 120 beats a minute, outside the plan's 70 to 90.                                                                                                                                                                                                   | Deep house needs its pulse near 120 to sound like house. Melancholic at 68 leaves more space. The lofi moods stay inside 70 to 90.                                                                                  |
| 2026-11-03 | Find, Find and replace and Read aloud sit in the More menu, not on the toolbar row. Ctrl+F and Ctrl+H open the find bar.                                                                                                                                                       | The toolbar row is full at the narrowest desktop column (binder and details open). A new button there wraps the bar to two rows.                                                                                    |
| 2026-11-03 | On a Mac, ⌘H hides the browser before Vlo sees it. Mac writers press ⌘F, then Tab, to reach Replace.                                                                                                                                                                           | The plan's Mod-H is kept for other systems. The find bar shows both fields, so Replace is one Tab away.                                                                                                             |
| 2026-11-03 | Read aloud pauses by stopping the voice and starts the same sentence again on Resume.                                                                                                                                                                                          | Browsers differ on pause and resume of speech, and some stop for good. A new start of the sentence works the same in each.                                                                                          |
| 2026-11-03 | Words written today start from the project total at the first look each day, kept in `appMeta`.                                                                                                                                                                                | No new table is needed. Deleting a project deletes its record.                                                                                                                                                      |
| 2026-11-03 | Popovers, menus and dialogs fade in and close at once, with no fade-out.                                                                                                                                                                                                       | Radix removes a closing layer only after its animationend event. With a scene on, WebKit did not send it, so a closed panel stayed on screen.                                                                       |
| 2026-11-04 | CI gives Firefox and WebKit a silent PulseAudio output (apt packages `pulseaudio` and `gstreamer1.0-pulseaudio` in the CI job only).                                                                                                                                           | The runners have no sound card, and Firefox and WebKit keep Web Audio suspended without an output. Firefox's null audio setting kept the context suspended. No app package changes.                                 |
| 2026-11-04 | A moving scene goes still for the rest of the visit when the device draws it slowly (middle frame over 50 ms in a 2 s sample). The Scene panel says so and offers "Try the motion again".                                                                                      | The CI WebKit drew a moving scene at about 3 frames a second, and keys then waited 210 ms. A weak device can do the same. The product owner chose this on 2026-11-04.                                               |
| 2026-11-04 | Own music files are stored as ArrayBuffer bytes, not Blob.                                                                                                                                                                                                                     | Safari cannot store a Blob in IndexedDB in a private window, and the CI WebKit could not keep a file.                                                                                                               |
| 2026-11-04 | A plain click on the blank page under the last block puts the caret after the last word, in every browser.                                                                                                                                                                     | WebKit put the caret before the first word, so the next words went to the wrong place.                                                                                                                              |
| 2026-11-03 | Play waits up to 3 s for the browser to start the sound. If the browser keeps it off, Vlo says so and shows Play again.                                                                                                                                                        | A browser's autoplay rule can keep sound off. The panel must not say that sound plays when it does not.                                                                                                             |
| 2026-11-03 | Ambient sound (F22) moves from Phase 3 to Phase 2.                                                                                                                                                                                                                             | The product owner asked for music and nature sounds with the editor upgrade.                                                                                                                                        |
| 2026-11-03 | New packages: `@floating-ui/dom` and the TipTap `bubble-menu`, `highlight`, `subscript`, `superscript`, `text-align`, `text-style` and `typography` extensions.                                                                                                                | Approved with the Phase 2 plan. All MIT. `docs/licenses.md` lists them.                                                                                                                                             |
| 2026-11-04 | Word gets each equation as a Word equation (OMML), built from MathLive's MathML with the docx math parts. A part that docx cannot write, such as a matrix, becomes plain text inside the equation. A command that MathLive cannot convert keeps its LaTeX inside the equation. | Plan decision 5 chose a picture of each equation, which Word cannot edit, because the common MathML to OMML converter has no open license. The docx package now writes equations itself, so no converter is needed. |
| 2026-11-04 | Vite builds workers as ES modules (`worker.format: 'es'`).                                                                                                                                                                                                                     | The export worker loads each format's code only when the writer picks it. Classic workers cannot split code.                                                                                                        |
| 2026-11-04 | The license check accepts a dual license when one choice is allowed. jszip is `(MIT OR GPL-3.0-or-later)`, and Vlo uses it under MIT.                                                                                                                                          | jszip was approved with the Phase 2 plan.                                                                                                                                                                           |
| 2026-11-04 | New packages: `docx` and `jszip` (runtime), `markdown-it` and `@types/markdown-it` (tests). `pdf-lib` and `@pdf-lib/fontkit` come with pull request B2.                                                                                                                        | Approved with the Phase 2 plan. `docs/licenses.md` lists them.                                                                                                                                                      |
| 2026-11-04 | The PDF and EPUB fonts are static 400 and 700 TrueType files from the Google Fonts CSS API, pinned by SHA-256 in `pdf-fonts.lock.json`, not the variable files of the `google/fonts` repository.                                                                               | fontkit makes broken glyphs and wrong default weights from variable fonts.                                                                                                                                          |
| 2026-11-04 | Vlo pads each subset glyph to an even length before pdf-lib writes the font.                                                                                                                                                                                                   | fontkit writes short `loca` offsets that cannot point at an odd offset, and 8 Vlo fonts then drew no letters.                                                                                                       |
| 2026-11-04 | A font without a bold or italic file is drawn with a slant or a thicker stroke, and the done screen says which.                                                                                                                                                                | Cinzel, Caveat, Kalam, IM Fell English and Noto Sans Math have no file for some styles.                                                                                                                             |
| 2026-11-04 | The manuscript word count rounds to the nearest 100 under 1,000 words.                                                                                                                                                                                                         | "About 0 words" helps no one on a short story.                                                                                                                                                                      |
| 2026-11-04 | `lib/net.ts` holds `appFile`, the one same-origin fetch for the export fonts.                                                                                                                                                                                                  | Only `lib/net.ts` may call `fetch` (lint rule).                                                                                                                                                                     |
| 2026-11-04 | The EPUB language is `en`.                                                                                                                                                                                                                                                     | Projects have no language setting yet.                                                                                                                                                                              |
| 2026-11-04 | PDF equations are drawn as text and lines from MathML, not as images.                                                                                                                                                                                                          | The words stay sharp and selectable at every zoom.                                                                                                                                                                  |
| 2026-11-04 | `/fonts/*` gets `Cache-Control: public, max-age=86400`, and the SPA rewrite skips `/fonts/`.                                                                                                                                                                                   | File names carry no hash, so they cannot be immutable. A missing font must return 404.                                                                                                                              |
| 2026-11-04 | The CI job `word-export` becomes `export-files` ("Export files open in other apps") and installs `poppler-utils`.                                                                                                                                                              | It now checks PDF and EPUB files too.                                                                                                                                                                               |
| 2026-11-04 | The backup file has a `format`, a `version` and the item `docSchema` in `project.json`. Import refuses a newer version or a newer schema.                                                                                                                                      | An older build would drop formats it cannot show, and Yjs would save that loss.                                                                                                                                     |
| 2026-11-04 | An imported project counts as backed up at the time its file was made.                                                                                                                                                                                                         | The file on the device is a backup of exactly that state.                                                                                                                                                           |
| 2026-11-04 | The reminder needs changes since the last backup. A project with no backup counts from the day it was made.                                                                                                                                                                    | A project that did not change since its backup is still safe.                                                                                                                                                       |
| 2026-11-04 | Import offers Replace or Keep both when the project is on this device.                                                                                                                                                                                                         | The spec says replace after a confirm. Keep both is safer when the writer is not sure which copy is newer.                                                                                                          |
| 2026-11-04 | Music files are not part of a project, so a backup holds them only when the writer asks, and an import adds only the files that are not on the device.                                                                                                                         | Music files are large and every project shares them.                                                                                                                                                                |
| 2026-11-04 | Folder save writes one Markdown file for the whole project, beside the backup.                                                                                                                                                                                                 | One file per project is easier to read in a cloud drive than one file per item, and the backup already holds each item.                                                                                             |
| 2026-11-04 | Folder save runs when the writer leaves a project or the tab, and only after a change.                                                                                                                                                                                         | The spec says "after each session". Leaving is the end of a session, and the browser has no other safe moment.                                                                                                      |
| 2026-11-04 | A save to the folder counts as a backup for the card date and the reminder.                                                                                                                                                                                                    | The folder holds the same `.vlo.zip` file that Back up makes.                                                                                                                                                       |
| 2026-11-05 | The plan's `person` mark (D3) uses the spec's name, `privateName`, with the attribute `personId`.                                                                                                                                                                              | Spec section 5 names the mark. The plan used a short name for the same mark.                                                                                                                                        |
| 2026-11-05 | `nameCheck` lists the unmarked names for E5, next to `shareSafe`, and the export worker runs both.                                                                                                                                                                             | The dialog needs the list before the file, and the file needs only the aliased text.                                                                                                                                |
| 2026-11-05 | A deleted person keeps the marks in the text, and Undo brings the person back with the same id.                                                                                                                                                                                | A mark with no person does nothing, so a share-safe export still swaps any real name it finds.                                                                                                                      |
| 2026-11-05 | The ring preview hides each card that turns past the side, and each card in view keeps its full color.                                                                                                                                                                         | A faded card fails the WCAG text contrast check. The 3D turn still shows the depth.                                                                                                                                 |
| 2026-11-05 | The ring is a slider for a screen reader, with the poem in front as its value.                                                                                                                                                                                                 | The arrow keys, Home and End choose one poem from a list, as a slider does.                                                                                                                                         |
| 2026-11-05 | Craft labels turn on from the More tools menu and the command menu, with a switch for each poem.                                                                                                                                                                               | The spec layout puts Craft in a side panel with Notes, AI and Comments, and that panel comes in a later phase. The labels themselves need no panel.                                                                 |
| 2026-11-05 | A one-syllable word takes the stress of the meter that fits the line. A word of two or more syllables keeps its CMU stress.                                                                                                                                                    | CMU gives every one-syllable word a stress, so "Shall I compare thee" would read as all stressed. The plan's test asks for the iambic stress of that line.                                                          |
| 2026-11-05 | A word that the CMU dictionary lacks gets no stress mark.                                                                                                                                                                                                                      | The `syllable` package counts syllables only, and a guessed stress would mislead.                                                                                                                                   |
| 2026-11-05 | The scan uses the first CMU pronunciation for syllables and stress, and every pronunciation for rhyme.                                                                                                                                                                         | One count for each word keeps the labels steady. "Temperate" counts 2 syllables, as the dictionary's first form says.                                                                                               |
| 2026-11-05 | The Submissions form checks its own fields (`noValidate`) and shows each refusal as words in the form.                                                                                                                                                                         | A browser bubble on a number field gives no message that a screen reader keeps, and it differs in each browser.                                                                                                     |
| 2026-11-05 | A tinted Submissions row mixes its quiet text and accent text 25 to 30% toward the main text color.                                                                                                                                                                            | The theme muted color is 4.5:1 on the page background only. On any tint it falls under WCAG AA.                                                                                                                     |
| 2026-11-05 | The project keeps the words of each local day in `settings.wordsByDay`, from each save.                                                                                                                                                                                        | Spec section 5 has only timer sessions, and a streak from the timer alone would miss each day the writer types with no timer. The record is about 15 bytes a day and goes in the backup.                            |
| 2026-11-05 | Each day keeps its net change in words, and the Progress screen floors a day at 0.                                                                                                                                                                                             | "Written today" in the editor counts the same way, so the two numbers agree. A cut and a paste of the same words add nothing.                                                                                       |
| 2026-11-05 | The goal calendar starts each week on Monday.                                                                                                                                                                                                                                  | A rest weekend then sits together at the end of each row.                                                                                                                                                           |
| 2026-11-05 | With no log entry, the network log names the mode of each project on the device, not only the last one.                                                                                                                                                                        | One project in Reader mode can send, so the page counts each mode. The plan named only the last project.                                                                                                            |
| 2026-11-05 | The badge icon morph runs on `requestAnimationFrame`, not on the Web Animations API.                                                                                                                                                                                           | Plan decision P1 named the Web Animations API. Safari cannot animate the `d` of a path with it, so the morph writes each frame itself, as CountUp does. It still needs no GSAP.                                     |
| 2026-11-05 | The AI provenance page counts characters of the writer's text. Equations, footnotes and the headings that Vlo adds do not count.                                                                                                                                               | The spec asks for "the share of AI-origin text". Characters measure a short insert inside a sentence, where words split.                                                                                            |
| 2026-11-05 | The project records the time of its first Co-writer insert in `settings.aiInsertedAt`.                                                                                                                                                                                         | The export dialog then offers the provenance page after a switch back to Pen, with no scan of every item.                                                                                                           |
| 2026-11-05 | On a phone the Assistant sheet opens only from its button.                                                                                                                                                                                                                     | The mode dialog says that the panel opens beside the text. On a phone a sheet covers the text, so it waits for the writer.                                                                                          |
| 2026-11-05 | "Do not show this again" for the drawer applies to this device, for each project.                                                                                                                                                                                              | The setting is about the writer's trust in the drawer, not about one project. Each request still goes in the network log.                                                                                           |
| 2026-11-05 | Ask the manuscript and the continuity check leave out notes.                                                                                                                                                                                                                   | Notes are research, as in exports. A question about the story should come from its text.                                                                                                                            |
| 2026-11-07 | Vlo calls the Supabase functions through PostgREST with `vloFetch`. It has no supabase-js.                                                                                                                                                                                     | Each call goes in the network log, and the reader view loads no client library (plan decision S2).                                                                                                                  |
| 2026-11-07 | The share bundle is a reader schema made from the export tree, not `ExportSection` itself. It drops fonts, colors and fills, and each equation goes as a MathML tree.                                                                                                          | The reader view has less to check, and it never loads MathLive or parses markup (Review Focus 1).                                                                                                                   |
| 2026-11-07 | `ShareRecord` adds `title`, `comments` and `commentsReadAt`.                                                                                                                                                                                                                   | The Share panel lists each link by its title and keeps the comments it read.                                                                                                                                        |
| 2026-11-07 | The Supabase URL and anon key go in a committed `.env`, and the host goes in `vercel.json` by hand. `vite preview` adds the build's host to the CSP.                                                                                                                           | Vercel headers are static. A unit test checks that the CSP lists exactly the network module's hosts.                                                                                                                |
| 2026-11-07 | `ai_mode_counts` counts AI requests by mode.                                                                                                                                                                                                                                   | The spec names the key only. Requests by mode show which modes writers use.                                                                                                                                         |
| 2026-11-07 | A usage report covers the last full ISO week, in local time, and the Library asks only when that week has writing or counts.                                                                                                                                                   | A report of an empty week tells nothing, and the prompt would come every week.                                                                                                                                      |
