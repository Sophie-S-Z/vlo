# Phase 10: Finished books

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer can turn a project into a book that is ready to print or sell, post a poem on the web with every indent kept, and send a submission packet in one step. The whole app also gets a design pass from the product owner's UI and motion rules. This phase builds the roadmap's "Finished books" features: F51, F52 and F53. Repository Phase 9 built roadmap Phase 8, so this repository phase is roadmap Phase 9.

**Architecture:** Book settings live in `Project.settings.book`, so save, backup, sync and import carry them with no new table. The PDF layout engine gets trim sizes, mirrored gutter margins, widow and orphan control, chapter styles and front and back matter. Its pages go to pdf-lib for the file, or to SVG for the live preview, through one small drawing interface. The e-reader and phone previews show the EPUB's own XHTML and CSS in a sandboxed frame. Web copies are one more reader of the export tree. A submission packet runs the existing exports and writes one zip, then logs a submission row.

**Tech Stack:** pdf-lib and fontkit (as now), the export tree, JSZip, Dexie, React, Vitest, Playwright. No new runtime package. EPUBCheck (W3C, BSD-3, Java) runs only in CI.

**Spec and sources:** the roadmap doc ("Vlo roadmap: beat every writing app", F51, F52, F53 and the design rules), `docs/VLO_SPEC.md` sections 9, 12 and 13, `docs/STATUS.md`, `docs/plans/phase-9.md`, and the product owner's UI and motion rules of 2026-11-10 (Part J0 below).

**Already done:** PDF, EPUB, Word and Markdown exports from one export tree. Standard manuscript format. Drop caps in the text. The Submissions tracker with venues and follow-up days. The walkaway export. A structure test for EPUB files.

**Not in this phase:** cover design and ISBN barcodes. Print on demand upload. A style editor for each heading. Large print and audio book files.

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| J1 | Trim sizes (F51) | Five trim sizes for print: 5 x 8 in, 5.25 x 8 in, 5.5 x 8.5 in, 6 x 9 in and A5. The inner margin (gutter) grows with the page count, by the KDP and IngramSpark table. Letter and A4 stay for a plain PDF. | A custom width and height too. |
| J2 | Front and back matter (F51) | A Book panel makes the half title, title page, copyright page and contents from the project. The dedication, epigraph, acknowledgments and "About the author" are short text fields in the panel. | Each one is a binder item with the full editor. |
| J3 | Chapter styles (F51) | Three chapter styles: Classic (centered number and title, drop cap), Modern (large number at the left) and Plain. A scene break style (three stars, a fleuron or a blank line). Widow and orphan control is always on. | A style editor for each heading, as Vellum has. |
| J4 | Live preview (F51) | A Book screen with three previews: print pages, an e-reader and a phone. The print pages come from the same layout as the PDF, so the preview and the file match line for line. The previews update one second after a change. | A preview only of the finished PDF file. |
| J5 | Web copies (F52) | "Copy for the web" in the Export dialog. "Substack, Medium and blogs" copies rich text. "AO3" copies the HTML for AO3's HTML field. Each line break stays, and indents become no-break spaces. | A downloaded .html file only. |
| J6 | Submission packets (F53) | "Make a packet" in Submissions: pick the pieces, then edit a cover letter, a bio and a synopsis. Vlo saves one zip in Word or PDF (standard manuscript format for prose) and logs a "Sent" row. The letter and the bio stay in the project for next time. | Separate files and no automatic log. |
| J7 | EPUBCheck (F51) | The export files job in CI runs EPUBCheck on the book EPUBs. The runner has Java. The job downloads a pinned release and checks its SHA-256. | Keep the structure test only. |

## Part J0: The UI and motion rules

These rules come from the product owner on 2026-11-10. Task J1 applies them to every screen, and each later task follows them.

- Motion: ease-out for entrances and ease-in-out for movement on screen. Menus and popovers open in 150 to 250 ms from scale 0.95, from their trigger (the Radix transform origin), never from the center. An exit is about 20% shorter than its entrance. List rows stagger by 30 ms. Buttons scale to 0.97 on press. A switch knob stretches 12% while it is pressed. No spring overshoot in everyday UI. A success gets a short pulse. An icon swap crossfades with scale and blur. Calm mode and reduced motion stop all of it, as now.
- Shape: concentric corners. An inner radius is the outer radius minus the padding.
- Type and color: mono only for code and figures that line up in a table. Counts, times and other figures use tabular numbers. Text meets 4.5:1 in each theme, and secondary text gets one size and one color.
- Content: no filler badges and no label that repeats its heading. One primary action for each screen. Each lazy part has a real loading state in its own shape.
- Background: the Library and welcome screen keep their light paper grain. The book preview draws its pages as paper.
- Avoid: dithering, ASCII art, the one italic word, all-caps eyebrows, pulsing live dots, sparkle icons, liquid glass, three-icon cards, decorative flow charts, marquees and squircles.

## Global Constraints

- Everything in the Phase 0 to 9 plans' Global Constraints still holds: only `src/lib/net.ts` makes requests, Pen mode sends no AI request, WCAG 2.2 AA in each theme, and each budget in spec section 12.
- Never lose a word (roadmap rule 1). Book and packet settings get a test for save, reload, backup and import.
- Simple first (roadmap rule 2). The Book screen shows at the Full level. The command menu opens it at every level.
- Initial JavaScript stays under 250 KB gzip. The Book screen, its preview and the packet dialog load on use.
- A share-safe export and the name check run for each book, web copy and packet, as for every export now.

## Review Focus

1. **A preview that does not match the file.** Expected: the preview and the PDF have the same page count and the same first words on each page. Pinned in Task J5.
2. **A widow or an orphan.** Expected: no page starts with the last line of a paragraph, and no page ends with the first line of a paragraph of three lines or more. Pinned in Task J4.
3. **A poem that loses an indent on the web.** Expected: each leading space and each line break of the fixture poem is in the Substack copy and the AO3 HTML. Pinned in Task J2.
4. **A memoir real name in a packet.** Expected: a packet of a memoir runs the name check on its pieces, its letter, its bio and its synopsis. Pinned in Task J3.
5. **An EPUB that fails EPUBCheck.** Expected: 0 errors for the novel, the memoir and the poetry fixtures with front and back matter. Pinned in Task J6.

---

## Part J: Finished books (three pull requests)

Pull request J-A: Task J1. J-B: Tasks J2 and J3. J-C: Tasks J4 to J7. Each one merges alone.

### Task J1: The design pass (Part J0)

**Files:** Modify `src/styles/tokens.css`, `src/styles/motion.css`, `src/ui/*`, and each screen that breaks a Part J0 rule.

- [x] Motion tokens in `tokens.css`: `--ease-out`, `--ease-in-out`, `--duration-menu` (200 ms) and `--duration-menu-exit` (160 ms). Menus, popovers and selects open from their trigger at scale 0.95.
- [x] Buttons scale to 0.97 on press. The switch knob stretches 12% on press. Copy and save confirmations pulse once, and their icons crossfade with scale and blur.
- [x] The Library stagger is 30 ms. The sequence drop has no overshoot.
- [x] Concentric corners in menus, option cards and segmented controls.
- [x] Mono only where figures line up in a table. Every count and time uses tabular numbers.
- [x] Remove each redundant label and filler line. Fix the project tabs that the AI mode badge covers at 1280 px.
- [x] Each lazy panel shows a loading state in its own shape.
- [x] Run the a11y suite in each theme, the motion tests and the screenshots by hand. Commit, then open pull request J-A.

### Task J2: Web and archive copies (F52)

**Files:** Create `src/features/export/web.ts`, `tests/unit/web-copy.test.ts`. Modify `src/features/export/ExportDialog.tsx`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: `toWebHtml(doc: ExportDoc): string` and `toWebText(doc): string`. A stanza is a `<p>`, and each poem line ends with `<br>`. A space at a line start or after another space becomes U+00A0. The HTML uses only the tags that AO3 keeps: `p`, `br`, `em`, `strong`, `u`, `s`, `sup`, `sub`, `h2` to `h4`, `blockquote`, `ol`, `ul`, `li`, `hr` and `a`. One HTML serves both targets: the blog target copies it as rich text with `toWebText` beside it, and the AO3 target copies it as text.
- Produces: the export format `web` and `ExportFile.text?`.

- [x] Tests first: the poetry fixture keeps each leading space and each line break in the HTML and the text; the HTML holds no `style`, `class` or `span`; a footnote becomes a numbered note at the end. Web editors have no hanging indent, so the notice says that poem lines keep their leading spaces.
- [x] "Web copy" in the Export dialog with the two targets. The done screen has the Copy button, because a browser copies only on the writer's own press. The blog target writes `text/html` and `text/plain`. The AO3 target writes the HTML as text. A pulse confirms the copy. Commit.

### Task J3: Submission packets (F53)

**Files:** Create `src/features/submissions/packet.ts`, `src/features/submissions/PacketDialog.tsx`, `tests/unit/packet.test.ts`, `tests/e2e/packet.spec.ts`. Modify `src/lib/db.ts` (`Project.settings.packet?`), `src/features/backup/file.ts`, `src/features/submissions/SubmissionsPage.tsx`, `src/features/help/help.ts`.

**Interfaces:**

- Produces: `Project.settings.packet?: { letter: string; bio: string }`, each at most 6,000 characters.
- Produces: `packetRequests(input: PacketInput)`, one export request for each piece and for `Cover letter`, `Bio` and `Synopsis` (each only when it has text), in Word or PDF. `ExportRequest.text?` exports plain text with no title line. `startPacket(input)` prepares each file in an export worker and gives the name check of all files. `zipPacket(venue, files)` makes `Packet for <venue>.zip`.

- [x] Tests first: the zip holds the right files in the right format; prose pieces use standard manuscript format when the details exist; an empty part makes no file; a memoir packet with an unmarked real name in the letter stops at the name check; the settings round trip through backup and import.
- [x] "Make a packet" in Submissions opens the dialog: venue, pieces, letter, bio, synopsis (from the pieces' synopses at first) and format. "Save the packet" saves the zip, keeps the letter and bio, and logs a "Sent" row for today. A memoir packet starts share-safe, and the name check runs over every file.
- [x] `packet.spec.ts`: make a packet, check the zip's file names, see the new row, reload, and the letter is still there; axe passes in each theme. Commit, then open pull request J-B.

### Task J4: Book layout in the PDF (F51)

**Files:** Create `src/features/book/book.ts`, `src/features/export/pdf/sink.ts`, `tests/unit/book.test.ts`, `tests/unit/book-pdf.test.ts`. Modify `src/lib/db.ts` (`Project.settings.book?`), `src/features/backup/file.ts`, `src/features/export/model.ts`, `src/features/export/build.ts`, `src/features/export/pdf/pdf.ts`, `src/features/export/pdf/draw.ts`.

**Interfaces:**

- Produces: `BookSettings = { trim: Trim; chapter: 'classic' | 'modern' | 'plain'; sceneBreak: 'stars' | 'fleuron' | 'space'; dropCaps: boolean; contents: boolean; copyright: string; dedication: string; epigraph: string; acknowledgments: string; about: string }` with `Trim = '5x8' | '5.25x8' | '5.5x8.5' | '6x9' | 'a5'`.
- Produces: `ExportDoc.book?: BookSettings`. Only a PDF and an EPUB read it.
- Produces: `gutterFor(pages: number): number` in points, by the KDP table.
- Produces: a `Sink` interface with the drawing calls of `Drawer`. `Drawer` writes pdf-lib pages. `SvgSink` records each page as SVG for the preview.

- [x] Tests first: each trim gives its page size; the inside margin is on the right of even pages and the left of odd pages; the gutter follows the page count; a chapter starts on a right-hand page with a blank page before it when needed; no widow and no orphan on any page of the 100,000-word fixture; front matter comes in the order half title, title, copyright, dedication, epigraph, contents; contents page numbers match the chapter pages; back matter comes after the last chapter; a plain PDF with no book settings does not change.
- [x] Commit.

### Task J5: The Book screen and live preview (F51)

**Files:** Create `src/features/book/BookPage.tsx`, `src/features/book/BookPreview.tsx`, `src/features/export/pdf/svg.ts`, `tests/e2e/book.spec.ts`. The export worker lays out and draws the preview pages, so no second worker holds a copy of the PDF code. Modify `src/app/routes.tsx`, `src/features/project/ViewTabs.tsx`, `src/features/editor/commands/registry.ts`, `src/features/help/help.ts`.

- [x] A Book tab (Full level, and "Open Book" in the command menu at every level). The left column holds the settings and the matter fields. The right column holds the preview with Print, E-reader and Phone. Print shows two facing pages on paper, with page numbers and a page slider. E-reader and Phone show the EPUB text in a sandboxed frame of that size.
- [x] The preview builds in a worker one second after a change. A loading state holds the page shape while it builds.
- [x] "Export the book" opens the Export dialog with PDF and book layout chosen.
- [x] `book.spec.ts`: change the trim and the chapter style, see the preview change, export the PDF, and its page count equals the preview's; reload and the settings stay; axe passes in each theme. Commit.

### Task J6: Book EPUB and EPUBCheck (F51)

**Files:** Modify `src/features/export/epub.ts`, `src/features/book/BookPreview.tsx`, `.github/workflows/ci.yml`. Create `tests/unit/book-epub.test.ts`.

- [x] Tests first: the EPUB holds the front and back matter as their own files with the right `epub:type`; the contents page lists the chapters; the chapter style and the scene break style are in the CSS.
- [x] CI downloads EPUBCheck 5.3.0, checks its SHA-256, and runs it on the three fixture books. Expected: 0 errors. Commit.

### Task J7: Gate 10 and the release

- [ ] Update STATUS, the help page and `docs/privacy.md` if needed. Run `npm run typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone suites. Expected: PASS.
- [ ] A fresh review agent that has not seen the implementation reviews the Phase 10 diff against Review Focus 1 to 5. Fix each high finding.
- [ ] Open pull request J-C. Ask the product owner to run "Run workflow" for all 4 browsers.
