# Vlo

Vlo is a writing app for novels, memoirs and poetry that keeps every word in the writer's own browser. It works offline and needs no account to write. An optional account syncs every project between a writer's devices. Vlo sends nothing else unless the writer asks for an AI request, a share link, feedback, a weekly usage report or a WordPress.com draft, apart from an anonymous daily count that Settings can turn off.

Writers: the user guide is the Help page in the app (`/help`, `src/features/help/help.ts`). The privacy page is `/privacy`.

## Set up

1. Install Node 22 (`.nvmrc`).
2. Run `npm ci`.
3. Run `npm run dev` and open the address that Vite prints.

Sharing, sync, accounts, feedback and usage counts need a Supabase project. Without the two values of `.env.example`, the build shows "Sharing is not set up in this build." and sends nothing. `docs/sharing-setup.md` and `docs/accounts-setup.md` give the steps. The owner page is at `/owner`.

## Scripts

| Script                 | What it does                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`          | Starts the development server.                                                                                           |
| `npm run build`        | Builds the app into `dist/`.                                                                                             |
| `npm run preview`      | Serves `dist/` on port 4173 with the production headers.                                                                 |
| `npm run typecheck`    | Runs TypeScript on every project.                                                                                        |
| `npm run lint`         | Runs ESLint, with the network rule.                                                                                      |
| `npm run format:check` | Checks the Prettier style. `npm run format` fixes it.                                                                    |
| `npm test`             | Runs the unit tests with Vitest.                                                                                         |
| `npm run e2e`          | Builds the app and runs the Playwright tests. Locally only Chromium runs; CI runs Chromium, Firefox, WebKit and a phone. |
| `npm run size`         | Checks the initial JavaScript against the 250 KB gzip budget.                                                            |
| `npm run licenses`     | Checks the package licenses and writes `docs/licenses.md`.                                                               |

Before a push, run `typecheck`, `lint`, `format:check`, `test`, `build` and `size`. CI runs the same checks.

## Where things are

- `src/app`: routes, the app shell and error screens.
- `src/features/<feature>`: one folder for each feature, such as `editor`, `export`, `share` or `ai`.
- `src/lib`: shared code, such as the database (`db.ts`), the item documents (`ydocs.ts`), the network module (`net.ts`) and the private-name code (`privacy.ts`).
- `src/ui`: shared interface pieces.
- `tests/unit`: Vitest tests. `tests/e2e`: Playwright tests, named after the user story they prove where one exists. `tests/fixtures`: the poem, memoir and novel fixtures and the 100,000-word generator.
- `supabase/migrations`: the SQL for share links, sync, sprint rooms, accounts, the daily count, feedback and the owner page.

## Rules for every change

- Only `src/lib/net.ts` may make a network request. An ESLint rule enforces it, and the network log records each request.
- Pen mode sends nothing and loads no AI code. The US09 test checks a 60-second session.
- No third-party script, font, analytics or tracking pixel. The CSP in `vercel.json` lists each allowed host, and a unit test checks it against `HOSTS` in `src/lib/net.ts`.
- A copy that leaves the writer's text (an export, a share link, an AI request or a web search) takes the people from `privatePeople` and puts the aliases in.
- Poems keep every space, indent and stanza break in every format.
- A new network purpose needs an entry on the privacy page (`src/features/policy/privacy.ts`). A unit test fails until it has one.

## Documents

- `docs/VLO_SPEC.md`: the product spec.
- `docs/plans/`: the plan of each phase.
- `docs/adr/`: the architecture decisions.
- `docs/STATUS.md`: what is done, what is open, and each decision with its date.
- `docs/ai-policy.md`, `docs/privacy.md`: the words of the two policy pages.
- `docs/safari-storage-test.md`: the 14-day Safari check by hand.

## License

MIT. See `LICENSE`.
