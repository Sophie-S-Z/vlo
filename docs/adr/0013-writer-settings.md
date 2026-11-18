# ADR 0013: The writer's toolbar and keys go with the account

- Status: accepted
- Date: 2026-11-18

## Context

Phase 19, Task E1 lets the writer pin their own tools on the toolbar, put them in their own order, and give a tool a new key. The plan (decision D8 and the global constraints) says that these are writer settings, and that writer settings go in the account row once the profile work adds it. Migration 0011 added the profile, but it has no place for settings. The product owner chose a Supabase change for this on 2026-11-18.

## Decision

- **A small table.** Migration 0015 adds `writer_settings`: one JSON object and its change time for each account. The table is closed, as before, and only `writer_settings_get` and `writer_settings_put` of the signed-in account reach it. The server takes an object of at most 16,000 characters. The row goes with the account.
- **The newer copy wins.** The object holds the pinned tools and the keys that the writer changed. Each copy has the time of the change on the device where the writer made it. `writer_settings_put` keeps the server's copy when it is from a later change, so an old device never takes back a new change.
- **A copy on the device.** The settings stay in `localStorage` (`vlo:writer-tools`), so the toolbar and the keys work with no account and offline. As Vlo opens on a signed-in device, the newer copy goes to the other side. A change goes up 2 seconds after the writer makes it.
- **Only what the writer changed.** A key that the writer never changed is not in the object, so a new Vlo key reaches the writer with no step.

## Consequences

- A person with database access can read the toolbar and the keys of an account. The privacy page says so (version 20).
- A device where two accounts sign in, one after the other, keeps one toolbar. The second account gets the copy of this device when it is newer.
- Other writer settings, such as the page look, can join this object later with no new migration.
