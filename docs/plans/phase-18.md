# Phase 18: Accounts, sync on every device, and the owner page

> **Status:** started on 2026-11-13 from a beta tester's feedback. The product owner asked for the work directly and asked for questions. The four questions went to the product owner on 2026-11-13. Each pull request uses the recommendation of each decision below until the product owner answers. The product owner can change a decision in review.

**Goal:** A writer signs in on a phone, a laptop and any other device and finds every piece there, finished or in progress. The product owner sees how many people use Vlo, how they use it, and what they say about it, on one page that only the owner can open.

**Why:** A beta tester asked for sync between a phone and a laptop, so that no writer starts again from scratch on a new device. The product owner asked for a user system, user counts, usage numbers, and the feedback and suggestions of the people who use Vlo.

**Not in this phase:** real-time co-writing (decision D2 stays), payments, an email newsletter, a native app.

## What Vlo has now

- Sealed sync (ADR 0008, Phase 9) works with a pairing link and no account. The server sees cipher text only.
- Opt-in weekly usage reports (F30). They go to `usage_reports`, and nobody can read them in the app.
- The Feedback tab holds the replies of share-link readers. A writer cannot send feedback to the owner.
- The live build has no Supabase project, so sharing, sync and usage reports say "not set up".

## Research: the backend (Task A0)

Checked on 2026-11-13.

| Choice | Fit for Vlo | Result |
| --- | --- | --- |
| Supabase (Auth, Postgres, row level security) | Every relay of Vlo is already a Supabase function. Auth has email codes, Google and Apple with no extra package: Vlo calls its REST paths through `vloFetch`, so the 250 KB budget holds. The free plan has 50,000 monthly users and 500 MB. | **Used.** |
| Firebase (Auth, Firestore) | Good email links with no mail setup. It adds a large SDK, a second host in the CSP, and a second data model next to the relays. | Not used. |
| PocketBase | One file to host. It needs a server that the owner keeps running and backs up. | Not used. |
| InstantDB, Convex, Triplit | Live sync databases. Each reads the data on its server, which breaks the sealed promise of ADR 0008. | Not used. |
| Clerk with Supabase | Clerk sends its own email. It is a second vendor for one form. | Not used. |

Facts that shape the work:

- The built-in Supabase mail sends only to the team of the project, at a few emails each hour. Real users need custom SMTP. Resend gives 3,000 emails a month free. `docs/accounts-setup.md` gives the steps.
- A free project pauses after 7 days with no activity. The daily count keeps it active.
- Email codes suit an installed app on a phone: a magic link opens in the browser and not in the installed app.

## Decisions

| # | Topic | Recommendation used | Other choice |
| --- | --- | --- | --- |
| A1 | Privacy of synced writing | **Product owner's choice (2026-11-13):** account sign-in only. The account keeps the sync key on the server, and a new device needs only the sign-in. The relay keeps cipher text. | A sync passphrase that locks the key, so nobody on the server can read a word. |
| A2 | Sign-in | **Product owner's choice:** a 6-digit email code, and Google when the build sets `VITE_AUTH_GOOGLE`. No password. | Email only, or Apple too. |
| A3 | User counts | **Product owner's choice:** an anonymous daily count, on by default, with a switch in Settings: a random install id, the day, the app version, the kind of device, and whether Vlo is installed. A signed-in device adds its account id, so the owner sees when each account was last active. | Accounts and opt-in reports only. |
| A4 | The Supabase project | **Product owner's choice:** a new free project "Vlo", made with the connector. | The owner makes it. |
| A5 | Feedback | A "Send feedback" page: a kind (idea, problem, praise, question), the message, an optional 1 to 5 rating, and an optional reply address. A signed-in writer's account goes with it. | A link to GitHub issues only. |
| A6 | The owner page | `/owner`, for accounts in `app_owners` only. Overview, People and Feedback. It shows counts, dates and feedback, never a project, title or word. | A Supabase dashboard only. |
| A7 | Deleting an account | Settings has "Delete my account". The account, its sealed key, its sync space and its link to the daily count and feedback go. The projects stay on each device. | Ask the owner by email. |

## Part A: one pull request

### Task A1: The database (migration 0008)

- `sync_vaults`: one row for each account: the sync space, its token and the sync key.
- `app_pings`: one row for each install and day.
- `app_feedback`: one row for each message, with a status (new, read, planned, done) and a note of the owner.
- `app_owners`: the accounts that can open the owner page.
- Functions: `vault_get`, `vault_put`, `vault_delete`, `daily_ping`, `send_feedback`, `delete_my_account`, `is_owner`, `owner_summary`, `owner_daily`, `owner_accounts`, `owner_feedback`, `owner_set_feedback`. Each table has row level security with no policies, as before, so only the functions reach the tables.
- Limits: 10 feedback messages for each install in a day, and 500 for the whole project. 50,000 pings in a day. Pings older than 400 days go in the daily cleanup.
- Tests: PGlite, as the role `anon` and as `authenticated` with a fake `auth.uid()`.

### Task A2: Accounts on the device

- `src/features/account/auth.ts`: the email code, Google with PKCE, the refresh of the session, sign out, and delete. The session stays in `appMeta`. A new network purpose `account`.
- `/account`: sign in, then the sync passphrase.

### Task A3: Sync with the account

- First device: the sign-in turns sync on. It makes the space (or uses the space of this device) and saves it in the account.
- Next device: the sign-in joins the space. Its own projects merge in.
- A device that syncs with a pairing link asks before it moves to the account's space.
- The pairing link stays for a writer with no account.

### Task A4: Send feedback

- `/send-feedback`, linked from the footer, Help, Settings and the command menu.

### Task A5: The owner page

- Overview: tiles (accounts, active today, this week, this month, accounts that sync, new feedback, average rating), a 30-day chart of active devices and accounts, devices, versions, and the weekly reports.
- People: each account with its email, start date, last active day, devices and feedback count.
- Feedback: newest first, filters by status and kind, a status and note for each message, and a CSV download.

### Task A6: Privacy, help and the release

- New purposes `account`, `ping` and `feedback` on the privacy page (version 12) and in `docs/privacy.md`.
- Help: "Use Vlo on all your devices" and "Send feedback".
- ADR 0009: accounts and sync with an account.
- `docs/accounts-setup.md`: SMTP, Google and the owner row.
