# Phase 19: The best page to write on

> **Status:** approved by the product owner on 2026-11-17. Parts A, B and C are built (see `docs/STATUS.md`). Parts D to F follow, each in its own pull request.

**Goal:** A writer who comes from Google Docs, Word, Scrivener, Ulysses or iA Writer finds every tool that they use each day, and finds each tool in fewer steps than in the old app. The page stays calm. Each tool waits in a clear place until the writer needs it. The writer can make the page look and work the way they like.

**Why:** The product owner asked for the most complete, most customizable and most pleasant writing editor. Writers leave an app for the one missing tool that they use each day: a grammar check, margin comments, an outline, clean paste or a table. They stay for the feel of the page. This plan closes the daily gaps first and makes the page feel better in the same pull request.

**Not in this phase:** live co-writing by many writers at once (decision D7), new AI features, the profile and the "Welcome back" greeting (a separate thread does that work), and a native app.

---

## 1. What Vlo has now (audit of 2026-11-17)

The audit read `src/features/editor/**`, the command registry, `docs/STATUS.md`, the spec, and the plans of Phases 0 to 18. A script opened a new novel at 1440 px and at 390 px in the Ink theme.

### 1.1 Vlo already matches or beats the other apps here

| Area | What Vlo has |
| --- | --- |
| Text styles | Bold, italic, underline, strikethrough, superscript, subscript, 20 fonts and own fonts, size, color, highlight, gradient and shimmer text, clear formatting |
| Paragraphs | Body text, Heading 2 and 3, quote, bulleted and numbered lists, alignment, line spacing, first-line indent, drop cap, scene break |
| Inserts | Footnotes, equations (in a line and on a line), images, citations, about 900 special characters, links |
| Forms | Prose, poems with exact spaces and hanging indents, screenplays with Fountain |
| Review | Comments, track changes with 5 revision passes, Word round trip of changes and comments, share links with reader comments |
| History | Snapshots each 10 active minutes, named versions, word diff, restore |
| Focus | Focus mode, typewriter scrolling, line dimming, hide the text, timer, sprints, goals, scenes and sound |
| Checks | Style check (repeats, filler, cliches, long sentences), continuity check, Insights (readability, keywords), originality |
| Find | Find and replace in one item, with match case and whole word |
| Speech | Read aloud with on-device voices, table read, speak to write |
| Layout | Pageless, Letter or A4 sheets, zoom 80 to 200 percent, split view, comfort spacing, RTL and CJK |
| Access | One command registry behind the toolbar, the selection menu, the `/` menu, Mod-K and the shortcut sheet. WCAG 2.2 AA in each theme |

### 1.2 Gaps against Google Docs and the leading writing apps

| Gap | Who has it | Vlo now |
| --- | --- | --- |
| Grammar check and a personal dictionary | Google Docs, Word, Grammarly, ProWritingAid | Only the browser's spell check. The writer cannot add a word, and the browser marks each fantasy name. |
| Margin comments with replies | Google Docs, Word, Dabble | One note for each comment, in a list under the text. No replies. |
| Editing, Suggesting and Viewing modes | Google Docs | Track changes is a switch deep in the More menu. |
| An outline of the open document | Google Docs, Word, Ulysses | None. The binder shows items, not the headings and scene breaks inside an item. |
| Clean paste, paste without formatting | Google Docs, Word, Notion | No paste cleanup. Mod-Shift-V has no Vlo action. |
| Paint format and change case | Google Docs, Word | None. |
| Return to the last place in an item | Scrivener, Ulysses, Google Docs | An item opens with the caret at the end. |
| Thesaurus, dictionary and rhymes | Word, Google Docs, Scrivener, iA Writer | None. Vlo has the CMU pronouncing data for the Craft labels only. |
| Find in the whole project, with patterns | Scrivener, Word, VS Code-style editors | Project search finds text. It cannot replace, and it has no pattern option. |
| Move a paragraph by keys or by a handle | Notion, Word, Ulysses | None. |
| A target for each document | Scrivener, Ulysses | Goals exist for the project and the day only. |
| Text width, paragraph spacing, typography sets | Ulysses, iA Writer, Bear | Zoom and comfort spacing only. The text width is fixed. |
| A toolbar that the writer can change | Word, Google Docs (partly), Ulysses | Fixed. 23 tools sit in one flat More menu. |
| Writer's own text shortcuts and autocorrect | Word, macOS, Scrivener | None. |
| Name completion from the story bible | Novelcrafter, Sudowrite | The Codex marks names but does not complete them. |
| Links between items, and backlinks | Scrivener, Obsidian, Notion, Google Docs smart chips | Links go to web pages only. |
| Tables | Google Docs, Word, Notion | None. The new Essay, Article and Research modes need them. |
| Checklists, page break, more heading levels | Google Docs, Notion, Word | None, none, and Heading 2 and 3 only. |
| Paragraph styles with names | Word, Scrivener, Ulysses | None. A novelist cannot keep a look for letters, epigraphs or text messages. |
| Page margins, page numbers, headers | Google Docs, Word | One fixed 1 inch margin on screen. Exports add numbers. |
| Sentence focus and parts-of-speech colors | iA Writer | Paragraph and line focus only. |
| Print | Google Docs, Word | Mod-P prints the whole app screen. |

### 1.3 What the screen shows now

These problems come from the 1440 px and 390 px screenshots:

1. The More menu is one list of 23 tools with no groups. Link and Comment are daily tools, and they are only in that list.
2. The toolbar icons for Font, Font color, Highlight and Gradient look alike at a glance. Only a tooltip names each one.
3. The selection menu covers the line above the selection. In the test it covered "way her father taught her."
4. On a 390 px phone the text starts at 410 px from the top. Three rows of tools sit above it: the project tools, the item row and the format bar. The on-screen keyboard then covers most of what is left.
5. The help line "Type / for tools..." shows under the text at all times. A writer who knows it sees it each day.
6. The stats line, the help line and the details control sit in three places at the foot of the page.

---

## 2. Ranked plan

Each row gets a score for reach (how many writers use it), use (how often), pull (does a writer leave or join an app because of it) and cost. The rank comes from reach times use times pull, against cost.

| Rank | Feature | Reach | Use | Pull | Cost | Part |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Toolbar and menus with groups, and the phone keyboard bar | All | Each session | High | M | A |
| 2 | Open each item at the last place | All | Each session | Medium | S | A |
| 3 | Spelling and grammar on the device, with a personal dictionary | Most | Each session | Very high | L | D |
| 4 | Margin comments with replies, and Editing, Suggesting and Viewing modes | Most | Each week | Very high | L | C |
| 5 | Document outline | Most | Each session | High | S | B |
| 6 | Clean paste, paste without formatting, paint format, change case | All | Each week | High | S | B |
| 7 | Page look: text width, spacing and typography sets | All | Once, then always | High | M | A |
| 8 | Thesaurus, dictionary and rhymes | Most | Each session | High | M | D |
| 9 | Move paragraphs by keys and by a handle | Most | Each week | Medium | M | B |
| 10 | A word target for each item, and the count line | Most | Each session | Medium | S | A |
| 11 | Find and replace in the whole project, with patterns | Many | Each month | High | M | B |
| 12 | Writer's toolbar and keys | Many | Once, then always | Medium | M | E |
| 13 | Text shortcuts and autocorrect | Many | Each session | Medium | S | D |
| 14 | Codex name completion | Novelists | Each session | Medium | S | D |
| 15 | Links between items, and backlinks | Many | Each week | Medium | M | F |
| 16 | Tables | Essay, article, research | Each week | High for those modes | L | F |
| 17 | Paragraph styles with names | Novelists, memoirists | Each week | Medium | M | E |
| 18 | Checklists, page break, Heading 1 and 4 | Many | Each week | Medium | S | B |
| 19 | Page setup: margins, page numbers, header and footer | Essay, research | Each month | Medium | M | F |
| 20 | Sentence focus and parts-of-speech colors | Some | Each session | Medium | M | D |
| 21 | Print | Some | Each month | Low | S | A |

---

## 3. Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| D1 | Build order | Parts A, B, C, D, E, F in that order, one pull request each. Part A changes what each writer sees, so it goes first. | Grammar first (Part D). |
| D2 | Grammar engine | Harper (`harper.js`, Apache-2.0). It runs as WebAssembly in a worker and sends nothing. English only. | LanguageTool, which needs a server and sends the text. That breaks principle 2 of the spec. |
| D3 | Grammar default | On for English prose, after the first 1.5 s typing pause. One switch turns it off. Poems and scripts start with it off. | Off until the writer turns it on. |
| D4 | Comment layout | Cards in the right margin beside their words on screens 1280 px wide or more. A sheet from the bottom on phones. The list under the text goes away. | Keep the list under the text, and add replies. |
| D5 | Thesaurus data | Open English WordNet (CC BY 4.0), built into a small file at build time, loaded on first use. | No thesaurus. |
| D6 | Tables | Prose only, in every mode, with a simple grid (no cell colors or nested tables in this phase). | Only the Essay, Article and Research modes. |
| D7 | Live co-writing (spec non-goal) | Not in this phase. Plan it as Phase 20 with end-to-end sealed Yjs updates over the sync relay, after the profile work gives each account a name. | Add it to this phase. |
| D8 | Writer's toolbar | The writer can pin and unpin tools and reorder them. "Reset the toolbar" puts the default back. The setting goes with the account. | A fixed toolbar with better groups only. |

---

## 4. Global constraints

- Everything in the Phase 0 to 18 constraints holds: only `src/lib/net.ts` makes requests, Pen mode sends nothing, WCAG 2.2 AA in Ink, Paper, Sepia and Contrast, and the budgets of spec section 12.
- Initial JavaScript is 221,647 bytes gzip of a 250,000 budget. Each new feature loads on first use. Part A can add at most 6,000 bytes to the initial chunk. Each other part adds 0 bytes to it.
- Keystroke to paint stays under 50 ms at the 95th percentile on the 100,000-word project, with grammar, the outline and margin comments all on. Grammar and the thesaurus run in workers.
- Nothing animates inside the text while the writer types. Underlines and margin cards appear only after a typing pause.
- No tool goes away. Each tool keeps its accessible name, so a screen reader and the tests find it the same way. Each new tool goes in the command registry, so the toolbar, the selection menu, `/`, Mod-K and the shortcut sheet all get it.
- Each new mark or node gets a schema version step, a backup format step, a Markdown, Word, PDF and EPUB path, and a round-trip test. A comment, a grammar mark and a dictionary entry never go in an export, a share or an AI request.
- Each new setting works with sync: device settings stay in `localStorage`, and writer settings go in the account row once the profile work adds it.
- Each part ends with a design audit: screenshots at 1440 px and 390 px in each theme, axe on each new surface, and a check that no surface is wider than the screen.

---

## 5. UI and UX direction

### 5.1 Principles

1. **Quiet first, complete second.** A new writer sees about 10 tools. Every other tool is two steps away at most: one click on a menu with a clear name, or one word in `/` or Mod-K.
2. **Group by the writer's task.** The menus follow the words that writers use: Insert, Format, Review and View. They do not follow the code's groups.
3. **One place for each job.** Checks live in one Review menu and one card. The count, the target and the save state live in one foot line.
4. **The text stays visible.** No menu or card covers the line that the writer reads or the words that they selected.
5. **Calm motion.** Menus grow from their trigger in 150 ms. Margin cards slide 8 px and fade in 200 ms. Calm mode and reduced motion stop both.
6. **Words over icons when space allows.** At 1280 px and wider, the Style, Insert, Format and Review menus show their names. Icons alone are for phones.

### 5.2 The new toolbar (prose, 1280 px and wider)

```
[↶ ↷] | [Body text ▾] | [B  I  U] | [🔗 Link] [💬 Comment] | [Insert ▾] [Format ▾] [Review ▾] | [Editing ▾]      [☰ Outline]
```

- **Insert ▾**, in three groups. Notes: Footnote, Citation, Comment. Media: Image, Table, Equation, Equation on its own line. Breaks and marks: Scene break, Page break, Special characters, Link to an item, Checklist.
- **Format ▾**, in three groups. Text: Font, Size, Color, Highlight, Gradient and shimmer, Superscript, Subscript, Strikethrough, Change case. Paragraph: Paragraph styles, Line and paragraph spacing, First-line indent, Drop cap, Alignment. Tools: Paint format, Clear formatting.
- **Review ▾**: Find and replace, Find in project, Spelling and grammar, Style check, Continuity check, Thesaurus, Read aloud, Speak to write, Show AI text, Show Codex names.
- **Editing ▾** is the Google Docs mode menu: Editing, Suggesting (track changes on) and Viewing (read only, with comments). The menu shows the revision pass in Suggesting.
- **Outline** opens the document outline on the left of the text.
- Under 1280 px the menus show icons with names for screen readers. Under 640 px the bar shows Undo, Style, Bold, Italic, Insert and More.
- A writer can pin any tool to the bar (D8). A pinned tool shows after Comment.

### 5.3 Phones

- While the on-screen keyboard is open, the project tools and the item row slide up and out. The text starts at the top of the screen. A tap on the title or a scroll to the top brings them back.
- A keyboard bar sits on top of the on-screen keyboard (`visualViewport`): Undo, Bold, Italic, Style, Comment, Insert, and Hide keyboard. It scrolls sideways with a fade at the edge to show more tools.
- Comments, the outline and the thesaurus open as sheets from the bottom, with a drag handle and a 44 px close target.

### 5.4 The page

- **Page look** (a new popover on the item row, next to Page): text width (Narrow 56 ch, Medium 68 ch, Wide 80 ch, Full), paragraph spacing (None, Small, Book), line height (1.5 to 2.3), first-line indent on screen (Book style or Block style), and caret (Thin, Thick, Block). A row of typography sets fills all of them at once: Book (Newsreader, Book spacing, indent), Manuscript (Courier Prime, double spacing), Modern (Inter, block paragraphs), Quiet (Literata, wide margins). The writer can save their own set. These change the screen only. Exports keep the project font and the manuscript format.
- **The foot line** holds the count, the item target ring, the save state and a menu to pick what the count shows (words, characters, reading time, selection). The help line "Type / for tools" shows for the first 5 visits, then only when the item is empty.
- **The selection menu** sits above the selection with 8 px of space, and flips below when the selection is near the top. It never covers the selected line or the line above it.

### 5.5 Marks in the text

Each check uses its own line shape, so color is never the only signal:

| Mark | Shape | Color token |
| --- | --- | --- |
| Spelling | Wavy line | `--mark-spelling` (warm red, 3:1 against the page in each theme) |
| Grammar | Solid line, 2 px | `--mark-grammar` (blue) |
| Style check (now) | Wavy line, light | as now |
| Continuity (now) | Double line | as now |
| Comment | Tint behind the words, a stronger tint on the open comment | `--mark-comment` |
| Suggestion (now) | Underline or strikethrough in the pass color | as now |

A click or Enter on a mark opens one small card: the reason in plain words, up to 3 fixes, "Ignore", and for spelling "Add to dictionary". Arrow keys move through the fixes. Mod-' jumps to the next mark.

---

## 6. Part A: A calmer, faster page (one pull request)

### Task A1: Toolbar, menus and the phone keyboard bar (rank 1)

- Change `LAYOUTS` in `src/features/editor/toolbar/Toolbar.tsx` to the layout of 5.2. Add `InsertMenu`, `FormatMenu`, `ReviewMenu` and `ModeMenu` components. Each menu reads the command registry by a new `menu` field (`'insert' | 'format' | 'review'`) and a `section` label.
- Add an `Editing`, `Suggesting`, `Viewing` mode to `trackingStore.ts`. Viewing sets `editable: false` and keeps comments open.
- Add `PhoneKeyboardBar.tsx`. It reads `window.visualViewport` and sits at the top edge of the keyboard. It shows only on touch devices with the keyboard open.
- Collapse the project tools and the item row on phones while the editor has focus and the keyboard is open (a `data-typing-phone` attribute on the shell, with a CSS transform).
- Move the selection menu placement in `SelectionMenu.tsx` to `@floating-ui/dom` with `offset(8)`, `flip()` and `shift({ padding: 16 })`, placed on the selection's first line box.
- **Tests:** each tool keeps its accessible name (the existing `editor-tools.spec.ts` and `tool-level.spec.ts` pass with new menu steps); a new test opens each menu, checks the groups and runs one tool from each; on the phone profile the text top is under 120 px while typing; the selection menu box does not intersect the selected line or the line above; axe on each menu in each theme.

### Task A2: Open each item at the last place (rank 2)

- Keep `{ anchor, head, scrollRatio }` for each item in `appMeta` on this device, written after a 1 s pause and on `pagehide`. Use Yjs relative positions so an edit in another tab or on another device keeps the place right.
- On open, put the caret there and scroll the line to 40 percent of the view height. A new item opens at the end, as now.
- **Tests:** type, open another item, come back, and find the caret at the same word; an edit before the caret in another tab keeps the caret on the same word; the open time of the 10,000-word scene stays under 300 ms.

### Task A3: Page look and typography sets (rank 7)

- Add `pageLook` to `writingPrefs.ts`: `width`, `paragraphSpacing`, `lineHeight`, `indentStyle`, `caret`, and `sets` (the writer's saved sets). Fold the comfort `lineHeight` into it, and keep old stored values.
- Add `PageLookPanel.tsx` on the item row and in Mod-K. Each choice shows a live preview on the page at once.
- CSS variables on `[data-vlo-editor]`: `--vlo-measure`, `--vlo-para-gap`, `--vlo-caret-width`. A block caret uses a decoration at the caret, drawn only after a 120 ms pause, so typing does not wait for it.
- **Tests:** each choice changes the measured line width or gap; an export does not change; a reload keeps the choice; the keystroke budget holds with each set.

### Task A4: Item targets and the foot line (rank 10)

- Add `target?: number` to the item row (database version step, backup format step). Set it from the binder item menu, the foot line, or Mod-K "Set a word target".
- The foot line shows a small ring for the target, and the count kind that the writer picks. At the target the ring fills, with no sound and no confetti.
- The binder row shows a thin bar under the title when the item has a target.
- **Tests:** unit tests for the target rules and the backup check; a browser test sets a target, types to it and sees the ring full.

### Task A5: Print (rank 21)

- Add a `@media print` sheet: only the manuscript, footnotes at the end of the item, the page format margins, and no marks of checks or comments.
- Mod-P in the editor prints the open item. "Print…" in Mod-K and in the item menu.
- **Tests:** `page.pdf()` in Chromium holds the text and no toolbar text.

---

## 7. Part B: Google Docs essentials (one pull request)

### Task B1: Document outline (rank 5)

- `OutlineRail.tsx`: a 220 px rail on the left of the page at 1280 px and wider, and a sheet on phones. It lists Heading 1 to 4, scene breaks (as "Scene 2", "Scene 3") and, in a script, scene headings. Each row shows its words.
- The rail follows the caret: the row of the section with the caret has the accent bar. A click or Enter moves the caret to the start of that section and scrolls it to 20 percent of the view height.
- The outline reads the document in one pass after a 400 ms pause, and keeps the result between passes if the block list did not change.
- Mod-K lists the headings of the open item under "In this item".
- **Tests:** the rail lists each heading in order; a click moves the caret; the rail updates after a new heading; a 10,000-word item builds the outline in under 8 ms.

### Task B2: Clean paste, paint format and change case (rank 6)

- Paste from Google Docs, Word, a web page or a PDF keeps bold, italic, underline, strikethrough, links, headings, lists, quotes, footnotes (Google Docs and Word footnote markup) and images. It drops fonts, sizes, colors, backgrounds, classes and empty spans. A small toast says "Pasted with clean formatting" with a "Keep the original look" button, which puts the paste again with fonts and colors.
- Mod-Shift-V pastes plain text with the marks at the caret.
- Paint format: a tool in Format and on the selection menu. One click copies the marks and the paragraph look of the caret, and the next selection takes them. A double click keeps it on until Escape.
- Change case: UPPERCASE, lowercase, Title Case (with the short words rule of the project's style), Sentence case. Shift-F3 steps through them, as in Word.
- **Tests:** paste fixtures from Google Docs, Word and a web page (HTML files in `tests/fixtures/paste/`) and compare the result tree; plain paste; paint format on a word and on a paragraph; each case rule in English and in Turkish (dotted i).

### Task B3: Move paragraphs (rank 9)

- Alt-Shift-Up and Alt-Shift-Down move the block with the caret, or the selected blocks, one block up or down. In a poem they move the line, and with Mod they move the stanza.
- A hover handle at the left of each prose block (`@tiptap/extension-drag-handle-react`, MIT). Drag moves the block. A click opens a menu: Turn into (Body, Headings, Quote, Lists, Checklist), Paragraph style, Duplicate, Move up, Move down, Copy link to this paragraph, Delete.
- The handle shows only on a pointer device, and only after the pointer moves. It never shows while the writer types.
- **Tests:** each key move, the undo of a move, drag with mouse, and the menu by keyboard; footnote numbers follow a moved paragraph.

### Task B4: Find in the whole project, and patterns (rank 11)

- The find bar gets a "Use a pattern" switch (JavaScript regular expressions, with `$1` in Replace) and a "This item / Whole project" control.
- Whole project lists each match with its item and a line of context. "Replace all in project" shows the count first, takes a snapshot of each item that it changes, and runs in a worker on stored documents for closed items.
- A wrong pattern shows its error under the field, and nothing runs.
- **Tests:** a pattern with groups; a bad pattern; replace across 120 scenes of the seeded project in under 3 s with a snapshot for each changed item; Undo in the open item.

### Task B5: Checklists, page break and headings (rank 18)

- Checklist items from `@tiptap/extension-list` (`TaskList`, `TaskItem`), prose only. `[ ] ` at the start of a line makes one. Exports: a checkbox character in Word, PDF and EPUB, `- [ ]` in Markdown.
- Page break (Mod-Enter in prose): a block node that starts a new page in the page format, Word, PDF and the book layout. Pageless shows a quiet "Page break" rule.
- Heading 1 and Heading 4 in the Style menu. Heading 1 is for essays, articles and papers. The export maps each level.
- **Tests:** round trip in each format, schema version step, backup step, and the outline lists the new levels.

---

## 8. Part C: Review like Google Docs (one pull request)

### Task C1: Comments with replies in the margin (rank 4)

- Change the comment entry to a thread: `{ id, replies: [{ id, text, by, at, reactions? }], resolvedAt? }`. Old single comments become a thread with one reply. Schema version step and backup step.
- `CommentMargin.tsx`: on screens 1280 px and wider, cards sit in the right margin beside their words. Cards that collide stack down, and the open card moves to its words. A thin connector shows from the card to its words on hover and focus.
- A card has the quote, the replies, a reply field, Resolve, and a menu (Edit, Delete, Copy link). Mod-Alt-M adds a comment, as now. Mod-Alt-Shift-A opens all comments.
- "Resolved" in the comment menu shows resolved threads. Reopen puts a thread back on its words if they still exist.
- On phones, a small count badge sits in the margin of each line with comments. A tap opens the thread as a sheet.
- Share comments from readers come in as threads with the reader's name, and the writer can reply. A reply stays on the device until the writer shares again.
- **Tests:** add, reply, resolve, reopen, delete with Undo; cards follow their words after edits above them; 200 comments on the 10,000-word scene keep the keystroke budget; the Word round trip keeps replies as Word comment replies; no comment goes in an export, a share copy or an AI request.

### Task C2: Editing, Suggesting and Viewing (rank 4, with C1)

- The mode menu of A1 drives the track-changes switch and the revision pass. Suggesting shows each waiting change as a card in the margin with Accept and Reject, and with the pass color.
- "Accept all" and "Reject all" in the Review menu, with one Undo step.
- **Tests:** the existing `track-changes.spec.ts` passes through the menu; Viewing blocks typing and keeps comments open; accept and reject from a card.

---

## 9. Part D: Words on the device (one pull request)

### Task D1: Spelling and grammar (rank 3)

- Add `harper.js` (Apache-2.0). Run it in `grammar.worker.ts`, loaded on the first pause in an English prose item with grammar on. Measure the WASM file size in the spike and keep it out of the install cache, as the writing fonts are. The worker checks only changed blocks.
- Vlo turns off the browser's spell check when grammar is on, and Harper checks spelling too. With grammar off, the browser's spell check stays.
- A personal dictionary for each writer: "Add to dictionary" from the mark card, and a list in Settings to edit. The Codex names and private names of each project count as known words with no step.
- "Ignore" keeps a rule off for that phrase in that item. A Settings list turns each rule kind on or off (for example, "Sentence starts with And").
- Marks show after a 1.5 s pause and only in the visible blocks plus 2 screens.
- **Tests:** unit tests for the span mapping from plain text to document positions (with footnotes, equations and comments in the text); a browser test marks "teh" and "a apple", fixes them, adds a name to the dictionary, and finds no mark on a Codex name; keystroke p95 with grammar on in the 100,000-word project; the network log shows 0 requests.

### Task D2: Thesaurus, dictionary and rhymes (rank 8)

- `scripts/build-thesaurus.mjs` turns Open English WordNet into a compact file of words, senses, short definitions and synonyms, sorted by sense frequency. Measure its gzip size, and load it on first use from Vlo's own files.
- Mod-Shift-T, the right-click menu, and Review > Thesaurus open a card at the word: senses with a short definition, synonyms under each sense, and antonyms. A click replaces the word and keeps its case and marks.
- Poems and the Workshop get a Rhymes tab: perfect rhymes, near rhymes and the same syllable count, from the CMU data that Vlo already has.
- **Tests:** "bright" lists "brilliant" under its light sense; a replace keeps bold and a capital; rhymes for "light" include "night"; 0 network requests after the first load.

### Task D3: Text shortcuts and autocorrect (rank 13)

- Settings > Writing > Text shortcuts: a list of "type this" and "get this" pairs, with a switch for each. A shortcut runs after a space or a punctuation mark. Backspace right after it undoes it.
- A starter list of common typos (for example "teh", "adn", "recieve") as one switch, on for English prose.
- **Tests:** each rule, the Backspace undo, and no change inside a word or in a poem with smart punctuation off.

### Task D4: Codex name completion (rank 14)

- After 3 letters that start a Codex name or alias in the project, a faint completion shows after the caret after a 300 ms pause. Tab accepts, and any other key goes on as normal.
- `@` opens a list of Codex entries and items. A choice inserts the name as plain text (an item makes a link in Part F).
- It works in every AI mode, Pen included, because it reads only the writer's own Codex on the device. One switch in Settings turns it off.
- **Tests:** completion of a name and an alias; Tab and other keys; no completion inside a word; screen readers hear "Completion: Marigold. Press Tab to accept."

### Task D5: Sentence focus and parts-of-speech colors (rank 20)

- The Focus menu gets "Sentence": the sentence with the caret stays clear and the rest dims, from the same sentence rules as Read aloud.
- Review > "Show parts of speech" colors adjectives, adverbs, verbs, nouns and conjunctions in an English item, each with its own switch. A tagger (`wink-pos-tagger`, MIT) runs in a worker on visible blocks after a pause. The legend names each color, and each color also has a line shape for color-blind writers.
- **Tests:** sentence focus moves with the caret; a known sentence gets the right tags; the keystroke budget holds.

---

## 10. Part E: Make it yours (one pull request)

### Task E1: The writer's toolbar and keys (rank 12)

- "Customize toolbar" at the end of each menu and in Settings: a list of each tool with a pin switch and a drag handle to order the pinned tools. "Reset the toolbar" puts the default back.
- Settings > Keyboard: each command with its key. The writer can record a new key. A key that clashes with another command or with a browser key gets a warning and a choice.
- Both settings are writer settings and follow the account.
- **Tests:** pin, order and reset; a new key runs its command; a clash shows the warning; the shortcut sheet shows the writer's keys.

### Task E2: Paragraph styles with names (rank 17)

- A project has paragraph styles: a name, a font, a size, an alignment, an indent, the space before and after, and italic. Vlo starts each prose project with Epigraph, Letter, Text message, Song lyrics and Sign.
- Format > Paragraph styles, the block handle menu, `/` and Mod-K apply a style. "Update the style to match" and "New style from this paragraph" work as in Word.
- A style is a block attribute (`styleId`). Word export writes real Word paragraph styles. PDF, EPUB and the book layout use the style values. Markdown keeps the text only.
- **Tests:** apply, change a style and see each paragraph follow, round trip in Word, and a backup step.

---

## 11. Part F: Structure (one pull request)

### Task F1: Links between items, and backlinks (rank 15)

- `[[` or Insert > "Link to an item" opens a picker of items and headings. The link is a mark with the item id and an optional heading id, and it shows the item's current title.
- A click opens the item. Mod-click opens it beside, in split view. A link to a deleted item shows a quiet broken style and offers "Remove link".
- The details panel lists "Links here" for the open item.
- Exports: an internal link in Word, EPUB and PDF when the target is in the export, and plain text when it is not.
- **Tests:** make, follow, rename the target, delete the target, backlinks, and exports.

### Task F2: Tables (rank 16)

- `@tiptap/extension-table` (MIT), prose only. Insert > Table opens a grid picker up to 8 by 8. A table menu adds and deletes rows and columns, turns the header row on and off, merges and splits cells, and sets column widths by drag.
- Tab and Shift-Tab move between cells. Tab in the last cell adds a row. Screen readers hear the row and column of the caret.
- Exports: Word tables, PDF tables drawn by Vlo's PDF code, EPUB tables, Markdown pipe tables, and the publish copies. Each platform note in Publish says if the platform drops tables.
- **Tests:** keyboard, merge, round trip in each format with Poppler and LibreOffice in CI, and axe on a table.

### Task F3: Page setup (rank 19)

- The Page popover gets margins (Normal, Narrow, Wide, Custom in inches or millimeters), page numbers (none, bottom center, top right), and a header and footer line with the project title, the item title or own text.
- Page format on screen and each export use the same values.
- **Tests:** each margin, page numbers in Word and PDF, and the page-end lines after a margin change.

---

## 12. Packages

| Package | License | Part | Loads |
| --- | --- | --- | --- |
| `@tiptap/extension-drag-handle-react` | MIT | B | With the editor chunk, about 4 KB gzip (measure) |
| `@tiptap/extension-list` (TaskList, TaskItem; already present through StarterKit) | MIT | B | Editor chunk |
| `harper.js` | Apache-2.0 | D | Worker, on first use |
| Open English WordNet data (built by a script) | CC BY 4.0 | D | On first use |
| `wink-pos-tagger` | MIT | D | Worker, on first use |
| `@tiptap/extension-table` | MIT | F | Editor chunk, or on first table |

Each TipTap package uses the same version as `@tiptap/core` (3.32.2 now). `docs/licenses.md` and `npm run licenses` list each new package and the WordNet credit.

## 13. Review focus

1. No mark of a check, a comment or a dictionary word reaches an export, a share or an AI request.
2. The worker results map to the right document positions after edits during the check.
3. Each new node and mark round-trips in backup, Markdown, Word, PDF and EPUB.
4. The phone layout keeps the caret line in view above the keyboard bar in Safari and Chrome.
5. Every budget of spec section 12, with every new feature on at once.

## 14. Gate 19

For each part: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, the Chromium browser suite, the size check, and "Run workflow" on all four browsers before the merge. A fresh code review of the part. The design audit of section 4 with screenshots in the project files under `editor-phase-19/`. `docs/STATUS.md`, Help and the privacy page change with each part.

## 15. Rough size

| Part | Pull request | Work |
| --- | --- | --- |
| A | A calmer, faster page | 4 to 5 days |
| B | Google Docs essentials | 5 to 6 days |
| C | Review like Google Docs | 4 to 5 days |
| D | Words on the device | 6 to 8 days |
| E | Make it yours | 3 to 4 days |
| F | Structure | 6 to 7 days |

## Sources

- Google Docs features of 2026: https://workspaceupdates.googleblog.com/2026/04/new-gemini-capabilities-in-google-docs-help-you-go-from-blank-page-to-brilliance.html
- iA Writer, Ulysses and Scrivener in 2026: https://www.mayhemcode.com/2026/08/ia-writer-vs-ulysses-vs-scrivener-in.html
- Harper in the browser: https://writewithharper.com/docs/harperjs/introduction
- Package licenses: the npm registry on 2026-11-17.
