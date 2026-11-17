# ADR 0010: A library for each account, and the sign-in screen

- Status: accepted
- Date: 2026-11-17

## Context

Vlo kept one database for each browser. A sign-in gave the device's projects to the account, so each account that signed in on one browser took every project of the accounts before it. The product owner found the projects of three accounts in each of the three. The owner asked for a separate library for each account, a merge only when the writer asks for it, and a sign-in screen for each signed-out visit.

## Decision

- **One library for each account.** `src/lib/library.ts` keeps the open account in `localStorage` (`vlo:library`), so the database name is known before any code opens it. The library with no account is `vlo`. An account's library is `vlo-<account id>`, and its item texts are `vlo-<account id>-item-<item id>`. The tab channels of an item take the same name, so no edit goes to a tab of another account. A switch loads the page again.
- **No word moves in the upgrade.** A device that was signed in before keeps `vlo` as the library of that account (`legacy`), and the library with no account becomes `vlo-guest`.
- **A session stays in its account's library.** A sign-in writes the session there and opens that library. More than one account can be signed in on a device. Sign out hides the account's library until the next sign-in.
- **A merge copies.** On the Account page, "Bring its projects here" copies each project of another library through the backup code (`copyProject`). Only the library with no account, or an account that is signed in on this device, can give its projects. A project that is here already in the same version stays as it is; one in another version comes in as a copy. The other library keeps its projects.
- **Delete my account** copies the account's projects to the library with no account, then removes the account's library from the device. Each device keeps its projects, as before.
- **The sign-in screen.** `/sign-in` opens first on each signed-out visit in a build with accounts. "Write without an account" holds for the browser tab (`sessionStorage`). The Account page, a pairing link, help, the policies and Verify open with no sign-in.
- **Sync starts after a sign-in on any screen.** A signed-in device with no sync turns on the account's sync as Vlo opens (`startAccountSync`, one run at a time in a tab).

## Consequences

- Accounts that shared projects before this change keep them. The writer deletes, in each account, the projects that do not belong there.
- AI keys, folder backups and other settings in `appMeta` belong to a library, so each account sets its own.
- An account's projects stay in the browser after a sign-out, hidden. Delete my account removes them from the device after it copies them to the library with no account.
