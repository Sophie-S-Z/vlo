# Phase 16: Images in the text

> **Status:** approved on 2026-11-12. The product owner approved decisions G1 to G8. Pull request G-A builds Tasks G1 and G2.

**Goal:** A writer puts an image in a scene, a memory or a page: a photo in a memoir, a map in a fantasy novel, or a picture beside a poem. The image stays where the writer drops it. A drag moves it. Every export, a share link, a backup and sealed sync keep it.

**Why:** Ellipsus added drag to move images and drop at the pointer in October 2026. Vlo keeps images in the Research folder only, so a memoir writer cannot put a family photo next to the memory. The roadmap's memoir and fantasy writers need images in the text most.

**Architecture:** An image is a block node `image` in the item's Yjs document. The node holds an id, the alt text, a caption, a width and an alignment. The bytes do not go in the Yjs document. They go in a new Dexie table `images` (one row for each image: id, projectId, type, size, width, height, the bytes as a Blob). So a 10,000-word scene with photos opens as fast as now, and a typed key never copies image bytes. Each export reads the bytes by id. The existing Research file code shows the pattern for Blob rows, backups and sync.

**Tech Stack:** React, TipTap, Yjs, Dexie, Vitest, Playwright. No new runtime package: the browser decodes and resizes images with `createImageBitmap` and `OffscreenCanvas`.

**Not in this phase:** text that wraps around an image, image editing (crop, filters), images in poems inside a stanza, images in Script items, an image from a web address (it would need a network request).

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| G1 | Where the bytes live | A new `images` table (database version 15), out of the Yjs document. The node holds only the id. | The bytes in the Yjs document. That is simple, but each sync round and each snapshot copies the photo again. |
| G2 | Size on the device | Vlo makes the long side at most 2,400 px and stores JPEG at 85% (PNG for an image with transparency). A 12 MB phone photo becomes about 600 KB. The original is not kept. | Keep the original file. Storage on a phone fills fast. |
| G3 | Which items | Prose items: scene, memory, page and chapter text. A poem gets an image only between stanzas. Script items get none. | All items, the stanza line included. |
| G4 | Alt text | Vlo asks for the alt text when the image goes in, with "Decorative" as a choice. An export and a share link use it. The accessibility check names each image with no alt text. | Alt text optional and not asked. |
| G5 | Exports | Word, PDF and EPUB embed each image at its width. Markdown writes `![alt](images/<name>.jpg)` and a zip with the image files. Standard manuscript format leaves the image out and writes "[Image: caption]", as agents ask. | Leave images out of every export. |
| G6 | Share links | A share link includes each image, sealed with the share key, at most 1,600 px on the long side. The share bundle has a total limit of 20 MB. | Share links show "[Image]" with the alt text only. |
| G7 | Sync | Sealed sync sends each image as its own blob, up to 2 MB after G2, as research files do now. | Images stay on each device. |
| G8 | Pull requests | Three: G-A (the node, the table, drop at the pointer, drag to move, backups), G-B (Word, PDF, EPUB, Markdown and manuscript format), G-C (share links, sync and the Gate). | One pull request. |

## Global Constraints

- Everything in the Phase 0 to 15 Global Constraints holds: only `src/lib/net.ts` makes requests, Pen mode sends nothing, WCAG 2.2 AA in each theme, the budgets of spec section 12, and the Part J0 UI and motion rules.
- Never lose a word or an image. A failed image write keeps the text and shows "Vlo could not keep this image on this device." A missing image row shows a box with the alt text, never an empty gap.
- An image gets no network request. A pasted image from a web page goes in only when the clipboard holds its bytes.
- The private-name rule applies to the alt text and the caption: each export and share swaps a private name for its alias.
- Hide the text (Ellipsus comparison, PR 3) blurs or covers each image too.

## Review Focus

1. **A slow scene.** Expected: a scene with 20 photos opens within the 300 ms budget, because the node holds only an id and each image loads as it comes near the screen.
2. **A storage leak.** Expected: deleting the last node of an image deletes its row after the History and Versions no longer hold it. A test counts the rows.
3. **A drop in the wrong place.** Expected: a dropped file goes at the block under the pointer, and a drag of an image moves the node, with Undo. Pinned in Task G2.
4. **An export with no image.** Expected: each format holds each image, and EPUBCheck passes with images (Phase 15 Task O1 runs it).
5. **A share that leaks.** Expected: the relay gets only sealed bytes. The share test reads the request bodies and finds no JPEG or PNG header.

---

## Part G: Images in the text (three pull requests)

### Task G1: The image node and the images table, pull request G-A

**Files:** Create `src/features/editor/extensions/image.ts`, `src/features/images/images.ts`, `src/features/images/resize.ts`, `tests/unit/images.test.ts`. Modify `src/lib/db.ts` (version 15, table `images`), `src/features/editor/docSchema.ts`, `src/features/backup/backup.ts`, `src/features/backup/file.ts` (backup version 13, `images/<id>` files).

- [x] Tests first: an image round trips through a backup with the same bytes; the resize keeps the shape and makes the long side 2,400 px; a backup with a damaged image row fails the check; deleting a project deletes its images.
- [x] The node renders the image from a `blob:` address, with a caption and the alt text. Commit.

### Task G2: Drop, paste and drag, pull request G-A

**Files:** Modify `src/features/editor/extensions/image.ts`, `src/features/editor/toolbar/` (Insert image), `src/features/editor/commands/registry.ts` (`/image`). Create `tests/e2e/images.spec.ts`.

- [x] Tests first: a file dropped on the second paragraph goes after it; a drag moves an image above the first paragraph; Undo puts it back; a paste of an image from the clipboard goes at the caret; the alt text dialog has no serious axe issue.
- [x] A keyboard way to move an image: Alt+Up and Alt+Down move the selected image block. Commit.

### Task G3: Exports, pull request G-B

**Files:** Modify `src/features/export/model.ts`, `docx.ts`, `pdf/`, `epub.ts`, `markdown.ts`, `manuscript.ts`, `safeTree.ts`. Extend the export tests and `tests/unit/epubcheck.test.ts`.

- [x] Tests first: Word, PDF and EPUB each hold the image bytes and the alt text; Markdown gives a zip with the files; manuscript format writes "[Image: caption]"; LibreOffice opens the Word file; EPUBCheck passes. (A PDF from Vlo has no tags, so it holds no alt text. The export notice says so, and the caption stays below the image.)
- [x] Commit.

### Task G4: Share links and sync, pull request G-C, and the Gate

**Files:** Modify `src/features/share/bundle.ts`, `src/features/reader/ReaderText.tsx`, `src/features/sync/engine.ts`, `src/features/sync/blobs.ts`, `src/features/policy/privacy.ts` (privacy page version), `src/features/help/help.ts`, `docs/STATUS.md`.

- [ ] Tests first: a share link shows each image to the reader; the request bodies hold no image header; a second device gets the image after a sync round; an image over 2 MB stays on its device and shows its alt text there.
- [ ] Gate 16: `typecheck`, `lint`, `format:check`, `test`, `build`, `size` and the Chromium and phone suites. A fresh review agent checks Review Focus 1 to 5. Ask the product owner to run "Run workflow" for all 4 browsers.
