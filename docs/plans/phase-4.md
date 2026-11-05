# Phase 4: AI Modes Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each project chooses how much AI it allows. Pen mode loads no AI code and sends nothing, and the writer can prove it on the network log. Reader mode gives feedback in a side panel that can never enter the manuscript. Co-writer mode drafts only on request, and every AI word carries a mark that the writer can show, hide and count in a provenance report.

**Architecture:** One network module (`src/lib/net.ts`) is the only code that may call `fetch`. It writes a `NetworkLogEntry` for each request that leaves the app's origin. The AI code is one lazy chunk that loads only when a project is in Reader or Co-writer mode. Inside it, one engine interface, `generate({ system, messages, maxTokens, signal }) => AsyncIterable<string>`, has five adapters: WebLLM in the browser, an OpenAI-compatible adapter (OpenRouter, Groq, Gemini), Anthropic, Ollama and LM Studio. Every request goes through `lib/privacy.ts` first, so a memoir request carries aliases only. The WebLLM library is its own lazy chunk inside the AI chunk, and it stays out of the install precache.

**Spec:** `docs/VLO_SPEC.md` sections 3 (F23 to F26, US09 to US11), 4, 5 (`NetworkLogEntry`, `aiOrigin`), 7, 10, 12, 13, 14 (Phase 4), 15.

**Already done:** The ESLint rule for `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon` is active since Phase 0. The CSP `connect-src` already lists every provider host, the two local servers and the model hosts. `aiMode` is in the project data since Phase 1 and is always `pen`. `aliasAiRequests` is on for each new memoir. `minisearch` is installed (command menu).

## Decisions for the product owner

| # | Topic | Recommendation | Other choice |
| --- | --- | --- | --- |
| P1 | Badge morph | The mode badge morphs between a pen, an eye and two pens with SVG paths of the same point count, animated by the Web Animations API. This keeps the Phase 1 and Phase 3 choice of no GSAP. Calm mode swaps the icon at once. | GSAP MorphSVGPlugin, as spec section 10 says. It adds GSAP (about 45 KB gzip) for one icon. |
| P2 | In-browser models | Offer Qwen2.5 1.5B Instruct and SmolLM2 1.7B Instruct (both 4-bit, both Apache 2.0, about 1.6 to 1.8 GB of GPU memory). | Llama 3.2 1B and 3B Instruct. The 3B model writes better, but the Llama 3.2 Community License has use limits that writers must accept. |
| P3 | WebLLM code | `@mlc-ai/web-llm` 0.2.87 (Apache 2.0) loads only when the writer picks the in-browser engine. Its code is about 2.2 MB gzip and the model about 1 GB, so neither goes in the install precache. The service worker caches the code on first use, and WebLLM caches the model. | Precache the code. Every install grows by 2.2 MB, also for writers who never use AI. |
| P4 | Provider checks | Each adapter has Playwright tests against a fake provider (request shape, streaming, 401, 429, CORS refusal). A request with no key checks each real preset for CORS from a browser, which costs nothing. A real answer from each provider needs your key, so you run that check by hand from a short list. | I run real requests with a key that you give me. Free tiers can still bill or log your text, so this needs your OK for each provider. |
| P5 | Where AI answers show | An "Assistant" side panel at the right of the editor, the same panel that the spec layout names for Notes, AI and Comments. Reader answers stay there and have no insert control. Co-writer drafts show there first, and "Insert" puts them in the text with the `aiOrigin` mark. On a phone the panel is a bottom sheet. | Answers in a dialog. A dialog hides the text that the writer asked about. |
| P6 | Key storage | Keys stay in memory by default and go away when the tab closes. "Remember on this device" asks for a passphrase and stores the key with PBKDF2 (SHA-256, 600,000 iterations) and AES-GCM 256, as the spec says. A wrong passphrase three times in a row waits 30 s. | Plain storage in IndexedDB. Any script or person with the device could read the key. |
| P7 | Ask the manuscript | MiniSearch finds the 8 passages that fit the question best, and only those go in the request, under a 3,000-token budget. The drawer shows each passage. | Send the whole manuscript. Most providers and every in-browser model would refuse a novel-length request, and it sends far more text than the question needs. |
| P8 | Provenance report | An export option "Add an AI provenance page" adds a last page: the share of AI-origin words in the whole work and in each item, with the provider and model of each mark. The editor shows AI text with a dotted underline, and "Show AI text" in the More tools menu hides or shows the underline. | A separate report file. A page in the export travels with the work, which is what a publisher or teacher asks for. |

## Packages (for approval)

| Package | License | Ships to browser | Reason |
| --- | --- | --- | --- |
| @mlc-ai/web-llm | Apache-2.0 | yes, lazy, only for the in-browser engine | In-browser engine (spec section 6) |

The provider adapters use `vloFetch` and need no package. No GSAP or `motion` (P1).

## Global Constraints

- Everything in the Phase 0 to 3 plans' Global Constraints still holds.
- Pen mode loads no AI chunk, makes no request, and the network log shows "0 requests" with the mode name (US09). A Playwright test checks the chunk list and the request list over a 60-second scripted session.
- The initial JavaScript stays under 250 KB gzip. The AI chunk without WebLLM stays under 60 KB gzip.
- No AI text enters the manuscript in Reader mode, by any control, key or paste path (US10).
- A memoir request body never holds a real name or a variant of one when `aliasAiRequests` is on (Gate 4).
- On HTTP 429 the panel shows the provider's limit message once. No retry loop.
- Every request first shows the "What will be sent" drawer with the exact text, the host and an estimated token count, until the writer turns the drawer off.
- No proxy server. A provider that blocks browser requests is marked unavailable with a plain message.
- axe finds zero serious issues on `/network`, `/ai-policy`, the mode dialog, the key dialog, the drawer and the Assistant panel, in each theme.

## Review Focus

1. **Pen mode really sends nothing.** Expected: no AI chunk in `performance.getEntriesByType('resource')`, and no request to another origin in 60 s of typing, export, backup, search and sound. Pinned in Task D1 and Gate 4.
2. **A real name in a memoir request.** Expected: no name, nickname or curly-quote variant in the request body, also when the name sits inside a passage that Ask the manuscript found. Pinned in Task D5.
3. **A Reader answer and the manuscript.** Expected: no insert button, no drag source, and a copy from the panel pastes as plain text with no `aiOrigin` mark only through the writer's own paste. Pinned in Task D5.
4. **A Co-writer insert and undo.** Expected: one Undo removes the whole insert, and the mark covers each inserted character and nothing else. Pinned in Task D6.
5. **A stopped request.** Expected: Stop ends the stream at once, keeps the words so far in the panel, and the log shows the request once. Pinned in Task D3.
6. **The passphrase store.** Expected: the stored record holds no key in plain text, and a wrong passphrase never decrypts. Pinned in Task D4.

---

## Part D: AI modes (pull requests D1 to D4)

### Task D1: Network module and network log (F25) (pull request D1)

**Files:** Modify `src/lib/net.ts`, `src/lib/db.ts`, `src/app/routes.tsx`. Create `src/features/network/NetworkPage.tsx`.

- [x] Dexie version 4: `networkLog: 'id, at'` with the spec's `NetworkLogEntry`. Upgrade test from version 3.
- [x] `vloFetch(url, { purpose, body, signal, headers })`: refuses a host that is not on the list of the purpose, writes one log entry for each request that leaves the origin (host, path, purpose, bytes sent, status or "error"), and never logs a key, a header or a body.
- [x] `/network`: newest first, filter by purpose, "Clear log". With no entry: "0 requests. This project is in Pen mode." with the mode of the last project.
- [x] Tests: unit tests for the host lists and the log entry; US09 Playwright test (60 s session, 0 requests, 0 log entries, no AI chunk); axe.

### Task D2: Mode setting, badge and confirm dialog (F23) (pull request D1)

**Files:** Create `src/features/ai/ModeBadge.tsx`, `ModeDialog.tsx`, `modes.ts`. Modify the project header and settings.

- [ ] The badge shows on every project screen. A click opens the mode dialog. P1 morph, with Calm mode at once.
- [ ] A change away from Pen shows what will change: which code loads, what can be sent, and that nothing is sent until the writer asks. A change back to Pen unloads the panel and needs no confirm.
- [ ] Tests: mode change and confirm; Pen loads no AI chunk; Reader loads it; Calm mode; axe.

### Task D3: Engine layer and adapters (F24) (pull request D2)

**Files:** Create `src/features/ai/engine/` (`engine.ts`, `openaiCompatible.ts`, `anthropic.ts`, `local.ts`, `webllm.ts`, `presets.ts`).

- [ ] One interface: `generate({ system, messages, maxTokens, signal }) => AsyncIterable<string>`. Streaming for every adapter. Stop through `signal`.
- [ ] Presets: OpenRouter, Groq, Gemini (OpenAI-compatible), Anthropic (with `anthropic-dangerous-direct-browser-access: true`), Ollama (`http://localhost:11434/v1`), LM Studio (`http://localhost:1234/v1`). Model list from the provider when it has one.
- [ ] WebLLM: check `navigator.gpu`; P2 models with download size and progress; the download goes in the log as `model-download`.
- [ ] Errors: 401 (key), 429 (limit, no retry), CORS (preset unavailable, plain message), local server off (setup help, such as `OLLAMA_ORIGINS`).
- [ ] Tests: each adapter against a fake provider through Playwright request routing; Stop; 429 with no retry; CORS refusal; a CORS check with no key for each real preset (P4).

### Task D4: Keys and free-tier terms (F24, US11) (pull request D2)

**Files:** Create `src/features/ai/keys.ts`, `KeyDialog.tsx`, `terms.ts`.

- [ ] Keys in memory by default. P6 passphrase store with Web Crypto.
- [ ] Before a free-tier key works, the provider's data terms in plain words and a checkbox. Gemini free tier: Google can use the content to improve its products, and human reviewers can read it.
- [ ] Tests: the stored record holds no plain key; a wrong passphrase fails; US11; axe.

### Task D5: Reader actions and the "What will be sent" drawer (F23, US10) (pull request D3)

**Files:** Create `src/features/ai/AssistantPanel.tsx`, `SendDrawer.tsx`, `reader.ts`, `prompts.ts`, `retrieve.ts`.

- [ ] Actions: Feedback on an item, Ask the manuscript (P7), Summarize for synopsis, Suggest tags or themes, Continuity check (names, dates, places). The spec's Reader system prompt.
- [ ] "Summarize for synopsis" fills the synopsis field only after the writer presses "Use as synopsis", which is metadata and not manuscript text.
- [ ] The drawer: exact text, host, estimated tokens, "Send" and "Do not show again". Memoir requests pass through `shareSafe` first.
- [ ] Tests: US10 (no insert path); a memoir request body with no real-name variant (Gate 4); the drawer shows the exact body; axe.

### Task D6: Co-writer actions, `aiOrigin` marks and the provenance report (F23, F26) (pull request D3)

**Files:** Create `src/features/ai/cowriter.ts`, `src/features/editor/extensions/aiOrigin.ts`. Modify the export pipeline.

- [ ] Actions: every Reader action, plus Continue (50 to 300 words), Rewrite selection, Three alternatives and Brainstorm (panel only). The spec's Co-writer system prompt.
- [ ] Insert adds the text with the `aiOrigin` mark (`provider`, `model`, `createdAt`) as one undo step. Typing inside AI text makes the new words the writer's own.
- [ ] "Show AI text" in the More tools menu. P8 provenance page in each export format.
- [ ] Tests: mark coverage; one Undo; a Reader-mode project cannot insert; the provenance share; axe.

### Task D7: AI policy page (pull request D4)

**Files:** Create `src/features/policy/AiPolicyPage.tsx`. Modify `src/app/routes.tsx` and the footer.

- [ ] `/ai-policy` with a version number and date: Vlo trains no model on writer text; no Vlo server receives manuscript text; Pen mode loads no AI code and sends nothing; a provider key means the provider's terms apply, and Vlo shows them first.
- [ ] Tests: the four statements; axe; the footer link.

**Gate 4:** US09, US10 and US11 pass. A Playwright test proves that Pen mode loads no AI chunk. A test proves that a memoir AI request body contains no real-name variant. axe passes on every new route and dialog. The keystroke and open budgets still pass.
