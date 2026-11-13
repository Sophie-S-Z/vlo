# ADR 0009: Accounts, a sealed sync key, the daily count and the owner page

- Status: accepted
- Date: 2026-11-13

## Context

A beta tester asked to write on a phone and a laptop and find every piece on both. The pairing link of ADR 0008 does this, but a writer must keep the link, and a lost device takes the link with it. The product owner asked for a user system, user counts, usage numbers, and the feedback of the people who use Vlo. Vlo promises that no server reads a word (ADR 0001).

## Decision

- **Supabase Auth, through its REST paths.** A 6-digit email code, and Google when the build sets `VITE_AUTH_GOOGLE`. No auth package: `src/features/account/auth.ts` calls `/auth/v1/otp`, `/verify`, `/token` and `/logout` through `vloFetch` with the purpose `account`. Google uses PKCE. The session stays in `appMeta`, which no backup holds. A refresh runs under a Web Lock, so two tabs do not spend one refresh token.
- **The sync key stays sealed.** An account keeps the sync space of ADR 0008, its token, and its 32-byte key wrapped with AES-GCM under a key that PBKDF2-SHA256 (600,000 rounds, a 16-byte salt) makes from the writer's sync passphrase. The passphrase never leaves the device. `vault_put` needs the space token, so an account cannot point at another writer's space. A new device signs in, types the passphrase, and joins the space with the engine of ADR 0008. A wrong passphrase fails the GCM tag and changes nothing.
- **A stable device id for each space.** A device keeps its id for each space in `appMeta`. A sign-out forgets the space on the device and keeps its sealed copies on the relay, so the other devices keep its work, and a new sign-in does not count as a sixth device.
- **The daily count.** Once a UTC day, `daily_count` gets a random install id, the app version, the kind of device and whether Vlo is installed. A signed-in device adds its account from the JWT. The switch is in Settings and on by default (decision A3). The state stays in `localStorage`, and off forgets the install id. The server keeps 400 days.
- **Feedback.** `send_feedback` takes a kind, the message, an optional rating and reply address, the screen, the device and the version, and the account from the JWT. Ten messages for each install in a day.
- **The owner page.** `/owner` calls `owner_summary`, `owner_daily`, `owner_accounts`, `owner_feedback` and `owner_set_feedback`. Each checks `app_owners`, which only the SQL editor fills. No function reads a share, a sync blob or a vault key.
- **Deleting an account.** `delete_my_account` deletes the sync space with every sealed copy and the account. The count and feedback rows stay with no account. Each device keeps its projects.

## Consequences

- A writer who forgets the passphrase and has no device that syncs cannot open the sealed copies. Each device still has its projects, and "I forgot the passphrase" starts a new space from this device.
- A person with database access sees emails, dates, device kinds and feedback, never writing. With the anon key, anyone can send daily counts or feedback up to the limits, as for share links.
- The live build needs custom SMTP for real writers (`docs/accounts-setup.md`), because the built-in Supabase mail sends only to the project team.
- The pairing link stays for writers with no account.
