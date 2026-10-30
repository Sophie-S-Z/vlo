# Vlo: working rules for Claude

Vlo is a free, local-first creative writing web app with a landing page and waitlist. The full spec is `docs/BUILD_PROMPT.md`.

## Start of every session

Read, in this order: `docs/BUILD_PROMPT.md`, `docs/PROGRESS.md`, `docs/HANDOFF.md` (if present).

## Working rules (spec section 1)

1. Treat spec sections 4 to 21 as the spec and section 22 as the order of work. Do not start a milestone until the gate of the one before it passes.
2. Plan before you code. Each milestone gets `docs/plans/M<n>.md` with tasks, files, tests and the gate check.
3. Write tests first for every behavior with an acceptance criterion.
4. Verify before you claim success. Run the tests, the build and the gate checks, and read the output.
5. Keep changes small. One task per commit. Clear commit messages.
6. Check current library docs (WebFetch) and the installed version in `package.json` before you use an API.
7. Use only free, open-source libraries and free service tiers. The project costs $0 to build and run at launch scale.
8. No analytics, trackers or third-party scripts. Self-host all fonts.
9. Record each real decision as an ADR in `docs/adr/NNNN-title.md` (context, decision, consequences).
10. Keep `docs/PROGRESS.md` current after each task.
11. When context gets long, write `docs/HANDOFF.md` (spec section 23).
12. Never create accounts, enter real passwords or handle payment details. Ask the human for spec section 3 items.

## Principles (spec section 5)

1. The editor is quiet. Motion lives around the writing, never inside it.
2. Manuscripts stay on the device. No Vlo server receives manuscript text.
3. Pen mode is the default. The writer turns AI on per project.
4. Every effect has a static fallback and obeys reduced-motion settings.
5. The product costs $0 to build and to run at launch scale.

## Commands

| Task                | Command                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| Dev server          | `npm run dev`                                                                |
| Unit tests          | `npm test`                                                                   |
| Lint, format, types | `npm run lint`, `npm run format:check`, `npm run typecheck`                  |
| Build               | `npm run build`                                                              |
| Bundle guardrail    | `npm run check:bundle` (after build)                                         |
| E2E and axe         | `npm run test:e2e` (after build; serves `dist` with `vite preview`)          |
| Lighthouse CI       | `npm run lhci` (after build; set `CHROME_PATH` if Chrome is not on the path) |

## Code conventions

- Path alias `@/` maps to `src/`. Folder roles follow spec section 8.
- Effect code checks `useMotionPreferences().reduced` before it starts (ADR 0005).
- Colors come only from CSS variables in `src/ui/tokens.css`, through Tailwind names `bg-bg`, `text-fg`, `text-muted`, `text-accent`, `border-rule`, `bg-surface`.
- Heavy libraries (three, matter-js, tweakpane, web-llm) and `src/ai/` load only through dynamic `import()`. `npm run check:bundle` fails otherwise.
- All outgoing requests go through `src/net/` (from M1 on). Add any new host to `scripts/csp.ts`.
