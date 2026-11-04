# Phase 2: Editor Upgrade, Export and Backup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer formats text with every common style, special characters, math, 20 fonts and their own fonts, gradient and metallic colors, footnotes and a page format. They write in a cozy scene with generated sound or their own music. Then they export to Word, PDF, EPUB and Markdown with every format kept, and back up and restore a whole project.

**Architecture:** New marks and nodes join the prose and poem schemas in `src/features/editor/extensions/`. One toolbar, one selection menu and one `/` menu share a single command registry, so each tool has one definition. Heavy parts load on first use: MathLive, each font, the gradient editor, the sound engine and each scene. Exports run in `export.worker.ts` and read the Yjs documents, so the open editor never blocks. Every export passes through one share-safe text pipeline (`lib/privacy.ts`).

**Spec:** `docs/VLO_SPEC.md` sections 3 (F06, F07, F22, F29), 7, 8.4 (ambient sound), 9, 12, 13, 14 (Phase 2 and Phase 3 task 8), 15.

**Order (product owner decision, 2026-11-03):** the editor upgrade comes first, then the Phase 2 exports, so each exporter is written once and carries every format.

## Decisions from the product owner (2026-11-03)

| Topic | Decision |
| --- | --- |
| Order | Editor upgrade, then exports. |
| Math | Visual math editor (MathLive). Writers build equations with buttons and a symbol keyboard. Vlo stores LaTeX. |
| Gradient and metallic colors | They shimmer only when typing stops. They pause while the writer types and stay still in Calm mode and under reduced motion. |
| Page format | One sheet with page-end lines and page numbers, Letter or A4. Pageless stays the default. |
| Music and sounds | Generated in the browser (nature sounds and lofi), plus the writer's own audio files. No hosted recordings. |
| Google Docs | Word download, then 2 short steps to open it in Google Docs. Nothing leaves the device unless the writer uploads it. |
| Fonts | About 20 Vlo fonts plus the writer's own installed fonts. When an export must swap a font, Vlo names each swapped font and asks before it continues. |
| Tools | A slim toolbar above the page (hidden in focus mode), a selection menu, and a `/` menu. |
| Special colors | A full gradient editor: any number of color stops, angle, look and shimmer speed. Presets are starting points. |
| Space around the page | Cozy scenes around the page, with gentle motion outside the page. Calm mode keeps scenes still and silent. |

## Decisions this plan makes

1. **Which forms get which tools.** Prose items (scenes, memories, notes) get every tool. Poems get every inline tool (styles, colors, gradients, fonts, size, superscript, subscript, special characters, inline math, footnotes). Poems do not get block tools (alignment, lists, headings, line spacing, drop caps, block math), because those can break exact line layout (F01).
2. **One command registry.** `src/features/editor/commands/registry.ts` lists every tool once: id, label, icon, shortcut, the forms it applies to, an `isActive` test and a `run` function. The toolbar, the selection menu, the `/` menu, the command menu (Mod-K) and the shortcut sheet all read it.
3. **Typing state for shimmer.** The editor root carries `data-typing="true"` from the first key until 1.5 s after the last key. CSS pauses every shimmer animation under that attribute. No script runs on each frame for shimmer.
4. **Footnotes.** An inline atom node `footnote` holds its own note text in a `content` attribute (plain text with inline marks stored as JSON). Numbers come from document order, so they never go stale. The note shows in a popover on click and in a list at the end of the item. Exports write real footnotes where the format has them (DOCX footnotes, EPUB 3 `epub:type="footnote"` asides, PDF notes at the foot of each page, Markdown `[^1]`).
5. **Math export.** EPUB gets MathML (MathLive converts LaTeX to MathML). Markdown keeps `$...$` and `$$...$$`. DOCX and PDF get a sharp image of the equation at 3x scale, with the LaTeX as alt text. Word cannot edit those equations as equations. The export notice says so. A true Word equation needs a MathML to OMML converter, and the common one (Microsoft's MML2OMML.XSL) has no open license.
6. **Gradient export.** EPUB keeps the CSS gradient. DOCX writes a Word gradient text fill (`w14:textFill`), which Word 2010 and later show. Google Docs and LibreOffice show the first color stop. PDF draws a real gradient behind each run with a clipping text path. Markdown has no color, so it keeps the plain text. The export notice lists every format that drops or simplifies a look.
7. **Own fonts.** Chrome and Edge list installed fonts through the Local Font Access API (`queryLocalFonts`) after the writer allows it. Other browsers get a "Type a font name" field. For exports, Vlo reads the font's embedding flags (OS/2 `fsType`). A font that forbids embedding, or that Vlo cannot read, is swapped for the closest Vlo font in PDF and EPUB. DOCX keeps the font name, so it shows only on a computer that has the font. Before any export with a swap, a dialog names each swapped font and its stand-in, and asks to continue.
8. **Page-end lines.** In page format, the manuscript sits on a sheet of the chosen size with 1 inch margins. After each typing pause (600 ms), Vlo measures the text height and places a thin line and a page number at each page end, as an overlay outside ProseMirror. A block that crosses a page end shows the line across it. Lines are close to the PDF export, and the PDF is the exact layout. The help text says so.
9. **Sound and Calm mode.** Sound never starts by itself. It plays only after the writer presses Play. Calm mode stops scene motion and stops a scene from starting its sound. Music that the writer starts by hand is a choice, not decoration, so it still plays in Calm mode.
10. **Own music files.** The writer adds audio files from the device. Vlo keeps them in IndexedDB (Dexie table `audioFiles`) and plays them through `blob:` URLs. No file leaves the device. The CSP gains `media-src 'self' blob:`.
11. **Scenes.** Six scenes: Rainy window, Fireplace, Night sky, Forest, Snowy cabin, Ocean at dusk. Each sets the backdrop around the sheet and a matching sound mix. Motion draws in an `OffscreenCanvas` worker where the browser has one, and on the main thread at 30 fps elsewhere. Motion stops when the tab is hidden, under Calm mode and under reduced motion. The page itself keeps its theme colors, with no texture inside the text area (section 13).
12. **Spec changes to record in STATUS.** Gradients and motion in scenes break "no gradients on interface surfaces", so scenes count as artwork, not interface surfaces. Ambient sound (F22) moves from Phase 3 to Phase 2. Focus-line dimming is already 70 %. The editor tools exceed the schema in section 7, and STATUS lists each new mark and node.

## Extra features I propose (need your approval)

| # | Feature | What it does |
| --- | --- | --- |
| E1 | Find and replace | Mod-F finds, Mod-H replaces. Match case and whole word. Works in prose and poems. |
| E2 | Read aloud | Reads the text with the device's own voices, for proofreading. Vlo offers only voices that run on the device, so no text leaves it. |
| E3 | Smart typography | Curly quotes, ellipsis, arrows and fractions as you type. One switch turns it off. Poems keep straight quotes until the poet turns it on. |
| E4 | Writing stats | Words, characters, reading time and words written today, in the details panel. |
| E5 | Drop caps | A large first letter for chapter and memory openings. Prose only. |
| E6 | Shortcut sheet | Mod-/ shows every shortcut, read from the command registry. |
| E7 | Page zoom | 80 % to 200 %, separate from browser zoom. |
| E8 | Typewriter key sounds | Soft generated key clicks while typing. Off by default. Calm mode turns them off. |

## Packages (need your approval)

| Package | License | Ships to browser | Reason |
| --- | --- | --- | --- |
| @tiptap/extension-superscript, -subscript, -highlight, -text-style, -text-align, -typography | MIT | yes, project chunk | Superscript, subscript, highlight, font color, font family, font size, line height, alignment, smart typography |
| @tiptap/extension-bubble-menu, @floating-ui/dom | MIT | yes, project chunk | Selection menu placement |
| mathlive | MIT | yes, lazy on first math | Visual math editor, LaTeX to MathML and markup |
| 16 font packages from @fontsource (EB Garamond, Libre Baskerville, Lora, Crimson Pro, Literata, Cormorant Garamond, Spectral, Merriweather, Playfair Display, Cinzel, IM Fell English, Atkinson Hyperlegible Next, Nunito, Courier Prime, Caveat, Kalam) | OFL-1.1 | yes, each font lazy on first use | 20 fonts with the 4 that Vlo has. Courier Prime is the Courier-style option from Phase 0. |
| docx | MIT | yes, lazy in export worker | DOCX export (section 6) |
| pdf-lib, @pdf-lib/fontkit | MIT | yes, lazy in export worker | PDF export with embedded fonts (section 6) |
| jszip | MIT (dual MIT or GPL, Vlo uses MIT) | yes, lazy in export worker | EPUB and backups (section 6) |
| markdown-it | MIT | no, tests only | Markdown export tests (section 6) |

Each font keeps its own lazy chunk, so the initial JavaScript budget (250 KB) does not change. The project route chunk grows by the TipTap extensions only.

## Global Constraints

- Everything in the Phase 0 and Phase 1 plans' Global Constraints still holds.
- No animation code runs while the writer types. Shimmer and scene motion pause under `data-typing`. Keystroke to screen stays under 50 ms at the 95th percentile in the 100,000-word project, with a scene and a shimmer gradient on screen.
- Every new mark and node survives save, reload, snapshot restore and every export. A round-trip test pins each one.
- Poem lines keep leading spaces, internal spaces, hanging indents and stanza breaks exactly, with any inline format on them.
- Pen mode sends nothing. US09 still passes with every new tool used, a scene on and music playing.
- Every color and gradient choice shows its contrast on the current theme. A look under 4.5:1 shows a warning, and Vlo never blocks the choice.
- Each tool works by keyboard and has an accessible name. Menus follow the WAI-ARIA menu pattern. axe finds zero serious issues.
- Calm mode and reduced motion stop shimmer, scene motion and menu animations.

## Review Focus

1. **Typing inside a gradient run.** Expected: the caret stays visible (`caret-color` set), selection stays readable, and new text joins the run. Pinned in Task A4.
2. **Footnote numbering after cut, paste, undo and a second tab.** Expected: numbers always match document order. Pinned in Task A5.
3. **A font that forbids embedding.** Expected: the export dialog names it and its stand-in before the file is made, and the PDF embeds only the stand-in. Pinned in Task B5 with a fixture font that has `fsType` restricted.
4. **Math in a poem line with a hanging indent.** Expected: the indent and spaces stay exact around the equation in the editor and every export. Pinned in Task A6 and Task B3 to B6.
5. **Page-end lines on a 10,000-word scene.** Expected: measuring runs only after a typing pause and takes under 16 ms on local Chromium. Pinned in Task A7.
6. **Own music file over 50 MB or a broken file.** Expected: a clear message, no crash, and other tracks keep playing. Pinned in Task A9.

---

## Part A: Editor upgrade (pull request A1 and A2)

### Task A1: Command registry, toolbar, selection menu and `/` menu

**Files:** Create `src/features/editor/commands/registry.ts`, `src/features/editor/toolbar/Toolbar.tsx`, `SelectionMenu.tsx`, `SlashMenu.tsx`, `ShortcutSheet.tsx`. Modify `EditorPane.tsx`, `ProjectPage.tsx` (command menu reads the registry).

- [x] Write unit tests: the registry has unique ids and shortcuts; each command lists its forms; poem items get no block command.
- [x] Build the toolbar with grouped controls, overflow into a "More" menu under 640 px, hidden in focus mode.
- [x] Build the selection menu (bubble menu) with the most used inline styles.
- [x] Build the `/` menu: typing `/` at a block start or after a space opens a filtered list. Escape closes it and keeps the `/`.
- [x] Build the shortcut sheet (E6).
- [x] Playwright: each surface runs Bold on the same text; keyboard-only use; axe.

### Task A2: Text styles

Bold, italic, underline, strikethrough, superscript, subscript, highlight (palette and custom), font color (palette and custom), font size, clear formatting. Prose also gets alignment, line spacing, first-line indent and drop caps (E5).

- [x] Unit tests for each mark's schema, parse and render. Round-trip tests through save and reload.
- [x] Color picker: theme-aware palette, a custom picker, recent colors, contrast readout.
- [x] Playwright: apply each style by toolbar, shortcut and `/` menu; reload; check the DOM.

### Task A3: Special characters (and smart typography E3)

- [x] A searchable picker with categories: punctuation and typography, accented letters, Greek, math, arrows, currency, fractions, superscript and subscript digits, symbols, emoji (a curated list of about 300). Each entry has a name for search. Recent picks come first.
- [x] `/` menu entries for the most used characters.
- [x] Smart typography with a switch in Settings (E3).
- [x] Tests: search finds "em dash", "alpha", "section sign"; inserting keeps poem spaces.

### Task A4: Gradient, metallic and prismatic colors

- [x] Mark `textFill` with attributes `stops` (color and position), `angle`, `look` (`gradient`, `metallic`, `prismatic`, `glow`), `shimmer` (on or off) and `speed`.
- [x] Full gradient editor: add, move and remove stops, angle dial, look, shimmer speed, live preview on the current theme, contrast check of each stop, save as a named look. 16 presets as starting points (for example Gold leaf, Rose gold, Chrome, Opal, Aurora, Nebula, Prism, Ember, Lagoon, Moonstone).
- [x] CSS only: `background-clip: text`, `caret-color`, a shimmer keyframe on `background-position`, paused under `data-typing`, Calm mode and reduced motion.
- [x] Tests: typing inside a run (Review Focus 1); shimmer paused while typing (computed `animation-play-state`); Calm mode shows no animation; keystroke budget with 500 shimmer runs on screen.

### Task A5: Footnotes

- [x] Node `footnote` (Decision 4), insert by toolbar, `/` menu and Mod-Alt-F.
- [x] Popover editor for the note, list at the end of the item, numbers from document order.
- [x] Tests: numbering after cut, paste, undo and a second tab (Review Focus 2); footnotes in a poem line keep its spaces.

### Task A6: Math with MathLive

- [x] Nodes `mathInline` and `mathBlock` (block only in prose) with attribute `latex`.
- [x] A popover with `<math-field>` and the MathLive virtual keyboard. Templates for fractions, roots, powers, sums, integrals, matrices and chemistry. The writer never needs to see LaTeX, and a "Show LaTeX" switch shows it for writers who want it.
- [x] Static render in the node view with MathLive markup. MathLive loads on first use only.
- [x] Tests: insert a fraction with buttons only; reload keeps it; a poem line with math keeps its hanging indent (Review Focus 4); Pen mode test shows no new origin.

### Task A7: Fonts and page format

- [x] Font menu: 20 Vlo fonts grouped as Book serifs, Display, Sans, Typewriter, Handwriting, Reading-friendly. Each font loads on first use. A project default font and a per-selection font.
- [x] Own fonts: Local Font Access in Chrome and Edge after the writer allows it; a "Type a font name" field elsewhere (Decision 7).
- [x] Page format setting per project: Pageless (default), Letter, A4. Sheet, margins and page-end lines with page numbers (Decision 8). Page zoom (E7).
- [x] Tests: font loads only when picked; page lines appear after a pause and not during typing; measuring time on the 10,000-word scene (Review Focus 5).

### Task A8: Cozy scenes

- [x] Six scenes (Decision 11) with a still fallback image drawn in CSS for Calm mode and reduced motion.
- [x] Scene picker in the toolbar. The choice saves per project.
- [x] Tests: motion stops under Calm mode, reduced motion and a hidden tab; keystroke budget with a scene on; axe.

### Task A9: Sound: nature, lofi and own music

- [x] Web Audio engine, loaded on first Play: rain, waves, wind, stream, fire, café murmur, forest birds and a night chorus, each from filtered noise and simple synthesis.
- [x] Generative lofi: a soft drum kit made from noise and oscillators, warm chords from a set of progressions, bass, vinyl crackle, tempo 70 to 90. Moods: Lofi, Melancholic, Soulful, Deep house, Dream pop. Each mood changes chords, tempo and drum pattern.
- [x] Mixer with a volume per layer, a master volume and a sleep timer.
- [x] Own music: add files, a playlist, shuffle and repeat, kept in Dexie table `audioFiles` (Decision 10). Schema version bump with an upgrade test.
- [x] Typewriter key sounds (E8).
- [x] Tests: nothing plays before Play; Calm mode stops scene sound from starting; a broken or very large file shows a message (Review Focus 6); US09 with music on.

### Task A10: Find and replace, read aloud, writing stats

- [x] Find and replace (E1) with decorations, match case and whole word.
- [x] Read aloud (E2) with device voices only (`localService === true`), and a message when the device has none.
- [x] Writing stats (E4) in the details panel.
- [x] Tests for each, and the impeccable audit of the editor (section 13).

**Pull request A1:** Tasks A1 to A5. **Pull request A2:** Tasks A6 to A10.

---

## Part B: Export and backup (pull request B, spec Phase 2)

### Task B1: Share-safe text pipeline

- [x] `lib/privacy.ts`: one tested function turns an item's document into an export tree and applies aliases when "Share-safe export" is on (default on for memoir). People and aliases arrive in Phase 3, so this task builds the function and its tests with the memoir fixture's alias list.

### Task B2: Export worker and export dialog

- [x] `export.worker.ts`, a dialog with format, scope (item, chapter, whole project), share-safe switch, standard manuscript switch (novels), and the notice that lists font swaps and simplified looks (Decisions 5 to 7).
- [x] After a DOCX download, the dialog shows the 2 steps to open it in Google Docs.

### Task B3 to B6: Markdown, DOCX, EPUB 3 and PDF exporters

- [x] Each follows section 9 and carries every new mark and node (styles, colors, gradients, fonts, footnotes, math, alignment, drop caps).
- [x] Each passes the export fidelity suite: the poem fixture keeps every space and hanging indent (US01).
- [x] DOCX opens in LibreOffice by script in CI; PDF text and fonts read back by script; EPUB passes a structure check; screenshots of the poem fixture for a check by eye.

### Task B7: Standard manuscript format (novels)

- [x] Section 9 rules, as a switch in the export dialog for DOCX and PDF.

### Task B8: Full-project backup and import, reminder, Safari steps

- [ ] `.vlo.zip` with `project.json`, `items/<id>.yjs`, `items/<id>.md`, `snapshots/`, and the new `audioFiles` only when the writer ticks "Include my music".
- [ ] Import as a new project, or replace after a confirm. US04 passes.
- [ ] Last backup date on each card, a reminder after 7 days, Safari install steps.

### Task B9: Folder save for Chromium (F29), if time allows

**Gate 2:** US01 and US04 pass. The export fidelity suite passes at 100 % for every format and every new format. Each export opens in a reader by script where possible. Keystroke and open budgets still pass with a scene and shimmer on screen.
