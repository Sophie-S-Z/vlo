# Phase 0: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Vite, React and TypeScript app shell for Vlo that builds, lints, tests, installs as a PWA, opens offline, has the three themes and Calm mode, and passes CI.

**Architecture:** A static single-page app. React Router serves a small route table from `src/app/routes.tsx`. Theme and Calm mode are attributes on `<html>` (`data-theme`, `data-calm`), driven by CSS variables in `src/styles/`. vite-plugin-pwa makes a Workbox service worker that caches the app shell. Vercel builds from GitHub and serves `dist/` with the headers and the SPA rewrite in `vercel.json`.

**Tech Stack:** React 19.3, React Router 8.5 (library mode), Vite 8.3, TypeScript 6.0 (strict), Tailwind CSS 4.3, shadcn/ui, vite-plugin-pwa 2.0, Vitest 5.1, Playwright 1.63, @axe-core/playwright 4.14, ESLint 10, typescript-eslint 8.72, Prettier 3.9.

**Spec:** `docs/VLO_SPEC.md` (sections 0, 4, 6, 12, 13 and 14 Phase 0).

## Decisions from the section 17 questions

| Question | Answer |
| --- | --- |
| Repository | `Sophie-S-Z/vlo` |
| License | MIT |
| Hosting | Vercel, built from the GitHub repository (replaces Cloudflare Pages) |
| Supabase | Create in Phase 5 |
| Phones | Full editing. Board and timeline show as lists under 600 px |
| AI presets | OpenRouter, Anthropic, Groq, Gemini, Ollama, LM Studio |
| Manuscript font | Newsreader 12 pt, with a Courier-style option |
| Marketing site | https://vlo-landing-page.vercel.app/ |

## Changes to the spec that this plan makes

1. **Vercel instead of Cloudflare Pages.** `vercel.json` holds the headers from section 12 and a rewrite of every path to `/index.html`. There is no `public/_headers` file. ADR 0002 records this.
2. **CSP in Phase 0 has no Supabase host.** The spec CSP has a `<SUPABASE_REF>` placeholder. Rule 8 bans placeholders, so Phase 5 adds the real host.
3. **Routes arrive with their features.** Phase 0 registers only `/`, `/settings` and the 404 route. Each later phase adds its own routes to `src/app/routes.tsx`. This keeps fake screens out of the app (rule 8).
4. **Paper accent text.** `#C8452D` on the Paper background has a contrast of 4.29:1, which fails WCAG AA for body text. Paper gets an extra token `--accent-text: #B83E28` (4.96:1). Accent fills, icons and large text keep `#C8452D`.
5. **Sepia has only three colors in the spec.** I add surface `#F6ECD9`, muted `#6E5D48` and rule `#DCCBAA`. Muted on the Sepia background is 4.98:1.
6. **TypeScript 6.0, not 7.0.** typescript-eslint 8.72 supports TypeScript up to 6.0.x only.
7. **Playwright 1.63.1 is pinned locally** to match the browser in the cloud workspace. CI installs its own browsers.

## Branches

- `main`: a new default branch that starts at the commit with `docs/VLO_SPEC.md`.
- `phase-0-foundation`: all Phase 0 work. A pull request merges it into `main` at Gate 0.

## Packages outside section 6 (need your approval)

All are MIT unless noted. Sizes are install sizes, and none of the dev tools ship to the browser.

| Package | License | Ships to browser | Reason |
| --- | --- | --- | --- |
| react-dom | MIT | yes (part of React) | Renders React in the browser |
| @vitejs/plugin-react | MIT | no | React support in Vite |
| @tailwindcss/vite | MIT | no | Tailwind 4 plugin for Vite |
| workbox-window | MIT | yes, about 3 KB gzip | Peer dependency of vite-plugin-pwa, shows "update ready" |
| class-variance-authority, clsx, tailwind-merge | Apache-2.0, MIT, MIT | yes, about 8 KB gzip total | shadcn/ui component helpers |
| radix-ui | MIT | yes, only the parts used | Accessible primitives under shadcn/ui (Switch, Dialog, RadioGroup) |
| lucide-react | ISC | yes, only the icons used | Icon set that shadcn/ui uses |
| tw-animate-css | MIT | CSS only | shadcn/ui animation classes, turned off by Calm mode |
| jsdom | MIT | no | DOM for Vitest component tests |
| @types/react, @types/react-dom, @types/node | MIT | no | Types |
| eslint-plugin-react-hooks, eslint-plugin-jsx-a11y | MIT | no | Lint rules for hooks and accessibility |

## Global Constraints

- TypeScript `strict: true`, plus `noUncheckedIndexedAccess: true` and `exactOptionalPropertyTypes: true`.
- Only `src/lib/net.ts` may call `fetch`, `XMLHttpRequest`, `WebSocket` or `EventSource` (section 10). `net.ts` arrives in Phase 4. Until then no source file may use them.
- Initial JavaScript (gzip), without lazy chunks: under 250 KB (250,000 bytes).
- No third-party scripts, analytics, fonts or tracking pixels. Fonts come from `@fontsource*` packages and ship from the app origin.
- Every effect obeys `prefers-reduced-motion: reduce` and Calm mode.
- Layout works at 360 px width with a 16 px side gutter and no horizontal page scroll.
- axe finds zero serious or critical issues on every route, in all three themes.
- No placeholder code, no "TODO later" comments, no fake data in the interface.
- Commit after each task. Every commit ends with the session attribution lines.

## Review Focus

1. **A service worker update while the writer types.** Expected: the app never reloads by itself. It shows a quiet "Update ready" control, and the writer picks when to reload. Pinned in Task 5 (`registerType: 'prompt'` and an e2e test that a new worker does not reload the page).
2. **A deep link opened offline**, for example `/settings` or `/p/abc`. Expected: the cached app shell loads and the router shows the right screen or the 404 screen. Pinned in Task 5 (offline navigation to `/settings` and `/nope`).
3. **A network call through a side door**, such as `window.fetch`, `globalThis.fetch`, `self.fetch` or `navigator.sendBeacon`. Expected: lint fails. Pinned in Task 2 (ESLint rule test cases for each form).
4. **System theme change while the app is open.** Expected: with "System" chosen, the theme follows the change at once with no reload. A chosen theme stays fixed. Pinned in Task 3 (`emulateMedia({ colorScheme })` test).
5. **Calm mode changed in one tab while another tab is open.** Expected: both tabs follow the change. Pinned in Task 3 (a `storage` event test on `usePreferences`).

---

### Task 1: Project scaffold, tooling and docs

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/app/App.tsx`, `.prettierrc.json`, `.gitignore`, `.nvmrc` (`22`), `LICENSE` (MIT, "Copyright (c) 2026 Vlo contributors")
- Create: `docs/STATUS.md`, `docs/adr/0001-local-first.md`, `docs/adr/0002-vercel-hosting.md`, `docs/licenses.md`, `scripts/licenses.mjs`
- Test: `tests/unit/smoke.test.tsx`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `preview`, `typecheck` (`tsc -b`), `lint`, `format`, `test` (Vitest), `e2e` (Playwright), `size`, `licenses`. Path alias `@/` maps to `src/`.

- [ ] **Step 1:** Write `tests/unit/smoke.test.tsx`: render `<App />` and assert that the text "Vlo" is in the document.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL, `App` does not exist.
- [ ] **Step 3:** Create the Vite React TypeScript project with the versions in the header. `App` renders a `<main>` with the heading "Vlo".
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`. Expected: PASS, 0 errors.
- [ ] **Step 5:** Write `scripts/licenses.mjs`. It reads `name`, `version` and `license` from each direct dependency in `node_modules/*/package.json` and writes a Markdown table to `docs/licenses.md`. It exits with code 1 if a license is outside this list: MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, OFL-1.1, 0BSD, MPL-2.0.
- [ ] **Step 6:** Write `docs/STATUS.md` (Done, In progress, Blocked, Decisions, Spec changes; fill Decisions and Spec changes from this plan) and ADRs 0001 and 0002 (context, decision, consequences, under 40 lines each).
- [ ] **Step 7:** Commit `chore: scaffold Vite React TypeScript app`.

### Task 2: ESLint network rule and Prettier

**Files:**
- Create: `eslint.config.js`
- Test: `tests/unit/eslint-network-rule.test.ts`

**Interfaces:**
- Produces: one ESLint flat config. The network block has `ignores: ['src/lib/net.ts']`.

- [ ] **Step 1:** Write the test. It runs `new ESLint({ overrideConfigFile: 'eslint.config.js' }).lintText(code, { filePath: 'src/features/x.ts' })` and expects one error for each of these inputs:

```ts
const banned = [
  "fetch('/a')",
  "window.fetch('/a')",
  "globalThis.fetch('/a')",
  "self.fetch('/a')",
  "new XMLHttpRequest()",
  "new WebSocket('wss://a')",
  "new EventSource('/a')",
  "navigator.sendBeacon('/a')",
];
```

  It also expects 0 errors for `fetch('/a')` with `filePath: 'src/lib/net.ts'`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/eslint-network-rule.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write `eslint.config.js`: typescript-eslint `strictTypeChecked`, react-hooks, jsx-a11y `recommended`, `no-restricted-globals` for `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, and `no-restricted-properties` for `fetch` on `window`, `globalThis` and `self`, and `sendBeacon` on `navigator`. Each message says "Only src/lib/net.ts may make network requests (VLO_SPEC section 10)."
- [ ] **Step 4:** Run the test and `npm run lint`. Expected: PASS, 0 problems.
- [ ] **Step 5:** Commit `chore: add ESLint with the network rule`.

### Task 3: Design tokens, themes, fonts, Calm mode and reduced motion (F08)

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/themes.css`, `src/styles/index.css`, `src/app/preferences.ts`, `src/app/PreferencesProvider.tsx`, `src/ui/` (shadcn `button`, `switch`, `radio-group`, `components.json`), `src/lib/featureFlags.ts`
- Test: `tests/unit/preferences.test.ts`, `tests/unit/contrast.test.ts`

**Interfaces:**
- Produces:

```ts
// src/app/preferences.ts
export type ThemeChoice = 'system' | 'ink' | 'paper' | 'sepia';
export type ResolvedTheme = 'ink' | 'paper' | 'sepia';
export interface Preferences { theme: ThemeChoice; calm: boolean }
export const DEFAULT_PREFERENCES: Preferences; // { theme: 'system', calm: false }
export function loadPreferences(storage: Storage): Preferences;   // bad or missing JSON gives the defaults
export function savePreferences(storage: Storage, p: Preferences): void; // key 'vlo:preferences'
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme;

// src/app/PreferencesProvider.tsx
export function usePreferences(): { prefs: Preferences; setTheme(t: ThemeChoice): void; setCalm(on: boolean): void; resolvedTheme: ResolvedTheme };
export function useMotionAllowed(): boolean; // false when calm is on or the system asks for reduced motion
```

- [ ] **Step 1:** Write `tests/unit/preferences.test.ts`. Cases: defaults on empty storage; defaults on the string `"{bad"`; round trip of `{ theme: 'sepia', calm: true }`; `resolveTheme('system', true)` is `'ink'`, `resolveTheme('system', false)` is `'paper'`, `resolveTheme('sepia', true)` is `'sepia'`; `useMotionAllowed()` is false when calm is true, false when `matchMedia('(prefers-reduced-motion: reduce)')` matches, true otherwise; a `storage` event with a new value updates `usePreferences().prefs` (Review Focus 5).
- [ ] **Step 2:** Write `tests/unit/contrast.test.ts`. It parses `src/styles/themes.css`, then asserts a WCAG contrast of 4.5 or more for `--text`, `--muted` and `--accent-text` on `--bg` and `--surface`, in each theme.
- [ ] **Step 3:** Run both tests. Expected: FAIL.
- [ ] **Step 4:** Write the CSS. Theme colors from spec section 13 and from "Changes to the spec" items 4 and 5. Variables: `--bg`, `--surface`, `--text`, `--muted`, `--rule`, `--accent`, `--accent-text`, `--radius-card: 10px`, `--ease-reveal: cubic-bezier(0.215, 0.61, 0.355, 1)` (power3.out), font stacks `--font-display` (Fraunces), `--font-manuscript` (Newsreader), `--font-ui` (Inter), `--font-mono` (JetBrains Mono). Import `@fontsource-variable/fraunces/full.css` so the SOFT axis loads. `html[data-calm='true'] *` and `@media (prefers-reduced-motion: reduce)` set `animation: none` and `transition: none` on decorative motion.
- [ ] **Step 5:** Write `preferences.ts` and `PreferencesProvider.tsx`. The provider sets `data-theme` and `data-calm` on `<html>`, listens to `prefers-color-scheme` and `prefers-reduced-motion` changes, and listens to `storage` events. An inline script in `index.html` sets `data-theme` before first paint, so no flash of the wrong theme shows (CSP allows it by a hash in `vercel.json`).
- [ ] **Step 6:** Run the tests. Expected: PASS.
- [ ] **Step 7:** Commit `feat: add themes, fonts and Calm mode (F08)`.

### Task 4: App shell, routes, Settings, error boundaries and 404

**Files:**
- Create: `src/app/routes.tsx`, `src/app/AppShell.tsx`, `src/app/RouteError.tsx`, `src/app/NotFound.tsx`, `src/features/library/LibraryPage.tsx`, `src/features/settings/SettingsPage.tsx`, `src/features/settings/StorageHealth.tsx`, `src/app/links.ts`
- Test: `tests/unit/routes.test.tsx`, `tests/e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `usePreferences`, `useMotionAllowed` (Task 3).
- Produces: `export const routes: RouteObject[]` in `src/app/routes.tsx`, which later phases extend. `export const MARKETING_URL = 'https://vlo-landing-page.vercel.app/'` in `src/app/links.ts`.

- [ ] **Step 1:** Write `tests/unit/routes.test.tsx` with a memory router: `/` shows the heading "Library"; `/settings` shows "Settings"; `/nope` shows "Page not found" and a link to `/`; a route whose element throws shows the error screen with a "Reload Vlo" button.
- [ ] **Step 2:** Write `tests/e2e/shell.spec.ts`: at 360 px and 1280 px width, on `/`, `/settings` and `/nope`, `document.documentElement.scrollWidth <= window.innerWidth`; axe finds 0 serious or critical issues in Ink, Paper and Sepia; with `emulateMedia({ colorScheme: 'light' })` and theme "System", `data-theme` is `paper`, and after `emulateMedia({ colorScheme: 'dark' })` it is `ink` with no reload (Review Focus 4); the Calm mode switch sets `data-calm="true"`.
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4:** Build the screens. The shell has a top bar with the Vlo wordmark (Fraunces), links to Library and Settings, and a skip link to `<main>`. The Library shows the empty state "Your projects will live here, on this device." with a link to the marketing site. Phase 1 adds project creation. Settings has: Theme (radio group: System, Ink, Paper, Sepia), Calm mode (switch, with one sentence on what it turns off), and Storage health (`navigator.storage.estimate()` usage and quota, and `navigator.storage.persisted()` status; Phase 1 adds the request). A live region announces the theme change.
- [ ] **Step 5:** Run both tests. Expected: PASS.
- [ ] **Step 6:** Commit `feat: add app shell, Library, Settings and 404`.

### Task 5: PWA, offline shell and update prompt (F09)

**Files:**
- Modify: `vite.config.ts`
- Create: `public/icons/icon.svg`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `public/icons/apple-touch-icon.png`, `scripts/render-icons.mjs`, `src/app/UpdatePrompt.tsx`
- Test: `tests/e2e/pwa.spec.ts`

**Interfaces:**
- Consumes: `routes`, `AppShell` (Task 4).
- Produces: `<UpdatePrompt />` in the shell footer.

- [ ] **Step 1:** Write `tests/e2e/pwa.spec.ts` against `npm run preview`: the manifest has `name: "Vlo"`, `short_name: "Vlo"`, `start_url: "/"`, `display: "standalone"`, `theme_color`, `background_color`, and icons of 192 and 512 px plus one with `purpose: "maskable"`, and each icon URL returns 200; after `navigator.serviceWorker.ready`, `context.setOffline(true)`, a reload of `/` shows "Library", a direct visit to `/settings` shows "Settings" and `/nope` shows "Page not found" (Review Focus 2); a new service worker that waits does not reload the page, and "Update ready" shows (Review Focus 1).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Configure vite-plugin-pwa: `registerType: 'prompt'`, `strategies: 'generateSW'`, `workbox.navigateFallback: '/index.html'`, `globPatterns: ['**/*.{js,css,html,svg,png,woff2}']`. Draw `icon.svg` (the "Vlo" mark in Fraunces on Ink). `scripts/render-icons.mjs` uses Playwright to render the PNG sizes, so no new package is needed.
- [ ] **Step 4:** Run the test. Expected: PASS. Then check install by hand in Chromium with Playwright (the install criteria in DevTools Application panel) and record the screenshot path in `docs/STATUS.md`.
- [ ] **Step 5:** Commit `feat: make Vlo an installable offline PWA (F09)`.

### Task 6: Vercel config and security headers

**Files:**
- Create: `vercel.json`
- Test: `tests/unit/vercel-config.test.ts`

- [ ] **Step 1:** Write the test. It parses `vercel.json` and asserts: a rewrite from `/(.*)` to `/index.html`; headers on `/(.*)` for `Content-Security-Policy`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`; the CSP contains `default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'` plus the `sha256-` hash of the theme script in `index.html` (computed in the test), `frame-ancestors 'none'`, `object-src 'none'`, and no `<` character; `Cache-Control: no-cache` on `/sw.js`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Write `vercel.json` with the CSP from spec section 12, without the Supabase host (see "Changes to the spec" item 2). `buildCommand: "npm run build"`, `outputDirectory: "dist"`.
- [ ] **Step 4:** Run it. Expected: PASS. Then run `npm run build && npm run preview` with the same headers applied by a small preview middleware in `vite.config.ts` (`preview.headers` from `vercel.json`), open every route in Playwright, and assert 0 CSP violations in the console.
- [ ] **Step 5:** Commit `feat: add Vercel config with CSP and security headers`.

### Task 7: Bundle-size check and CI

**Files:**
- Create: `scripts/bundle-size.mjs`, `scripts/bundle-size-lib.mjs`, `playwright.config.ts`, `.github/workflows/ci.yml`
- Test: `tests/unit/bundle-size.test.ts`

**Interfaces:**
- Produces: `initialChunks(manifest: ViteManifest, entry: string): string[]` in `scripts/bundle-size-lib.mjs`. It follows `imports` (static) and skips `dynamicImports`.

- [ ] **Step 1:** Write the test with a small fake Vite manifest: entry `index.html` imports `a.js`, `a.js` imports `b.js`, `a.js` has dynamic import `lazy.js`, and `b.js` imports `a.js` (a cycle). Expected: `['index.js', 'a.js', 'b.js']` in any order, no `lazy.js`, and no endless loop.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `initialChunks`. `bundle-size.mjs` reads `dist/.vite/manifest.json` (set `build.manifest: true`), gzips each initial JS file with `node:zlib`, prints the table and the total, and exits with code 1 at 250,000 bytes or more.
- [ ] **Step 4:** Run the test and `npm run build && npm run size`. Expected: PASS, total well under 250,000 bytes.
- [ ] **Step 5:** Write `playwright.config.ts`: `webServer: npm run build && npm run preview`, projects `chromium`, `firefox`, `webkit`, and `mobile-chrome` (Pixel 7). Locally, only `chromium` runs unless `CI` is set.
- [ ] **Step 6:** Write `.github/workflows/ci.yml` on push and pull request, Node 22: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run size`, `npx playwright install --with-deps`, `npm run e2e`, `npm run licenses` with `git diff --exit-code docs/licenses.md`. Upload the Playwright report as an artifact on failure.
- [ ] **Step 7:** Commit `ci: add bundle-size check and GitHub Actions`.

### Task 8: Gate 0 check and pull request

- [ ] **Step 1:** Run the full suite locally: typecheck, lint, unit tests, build, size, e2e on Chromium. Expected: all pass.
- [ ] **Step 2:** Open each route in Playwright at 360 px and 1280 px in each theme, with Calm mode on and off. Save screenshots to the scratchpad and look at each one.
- [ ] **Step 3:** Push `phase-0-foundation`. Open a pull request into `main` with the PR template layout if one exists. Subscribe to its activity. Fix CI until it passes.
- [ ] **Step 4:** Ask Praneel to import the repository in Vercel (https://vercel.com/new), so each pull request gets a preview. Check the preview URL: headers present, install works, offline works.
- [ ] **Step 5:** Update `docs/STATUS.md` and write the handoff with `anthropic-skills:handoff`.

**Gate 0:** CI passes. The app installs and opens offline. Initial JavaScript is under 250 KB. axe finds zero serious issues.
