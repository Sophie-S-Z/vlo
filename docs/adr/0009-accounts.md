# ADR 0009: Accounts, sync with an account, the daily count and the owner page

- Status: accepted
- Date: 2026-11-13

## Context

A beta tester asked to write on a phone and a laptop and find every piece on both. The pairing link of ADR 0008 does this, but a writer must keep the link, and a lost device takes the link with it. The product owner asked for a user system, user counts, usage numbers, and the feedback of the people who use Vlo. Vlo promises that no server reads a word (ADR 0001).

## Decision

- **Supabase Auth, through its REST paths.** A 6-digit email code, and Google when the build sets `VITE_AUTH_GOOGLE`. No auth package: `src/features/account/auth.ts` calls `/auth/v1/otp`, `/verify`, `/token` and `/logout` through `vloFetch` with the purpose `account`. Google uses PKCE. The session stays in `appMeta`, which no backup holds. A refresh runs under a Web Lock, so two tabs do not spend one refresh token.
- **The account keeps the sync key.** On 2026-11-13 the product owner chose sign-in only, with no sync passphrase (decision A1). An account keeps the sync space of ADR 0008, its token and its 32-byte key in `sync_vaults`, which only `vault_get` of that account reads. `vault_put` needs the space token, so an account cannot point at another writer's space. A sign-in turns sync on: the first device makes the space (or gives its pairing-link space), and each next device joins it with the engine of ADR 0008. The relay still holds cipher text only, and its blob names are still HMACs.
- **A stable device id for each space.** A device keeps its id for each space in `appMeta`. A sign-out forgets the space on the device and keeps its sealed copies on the relay, so the other devices keep its work, and a new sign-in does not count as a sixth device.
- **The daily count.** Once a UTC day, `daily_count` gets a random install id, the app version, the kind of device and whether Vlo is installed. A signed-in device adds its account from the JWT. The switch is in Settings and on by default (decision A3). The state stays in `localStorage`, and off forgets the install id. The server keeps 400 days.
- **Feedback.** `send_feedback` takes a kind, the message, an optional rating and reply address, the screen, the device and the version, and the account from the JWT. Ten messages for each install in a day.
- **The owner page.** `/owner` calls `owner_summary`, `owner_daily`, `owner_accounts`, `owner_feedback` and `owner_set_feedback`. Each checks `app_owners`, which only the SQL editor fills. No function reads a share, a sync blob or a vault key.
- **Deleting an account.** `delete_my_account` deletes the sync space with every sealed copy and the account. The count and feedback rows stay with no account. Each device keeps its projects.

## Consequences

- A writer needs nothing but the email to get every project on a new device, and a lost device loses nothing.
- A person with database access can read the sync key of an account, and with it the sealed copies of that account. The privacy page says so. The owner page reads no key and no blob. A later choice can add a passphrase: the vault would keep a wrapped key in place of the key.
- With the anon key, anyone can send daily counts or feedback up to the limits, as for share links.
- The live build needs custom SMTP for real writers (`docs/accounts-setup.md`), because the built-in Supabase mail sends only to the project team.
- The pairing link stays for writers with no account.
