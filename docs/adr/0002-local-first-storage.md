# 0002. Local-first storage

Date: 2026-10-30. Status: accepted.

## Context

Principle 2: manuscripts stay on the device. Writers distrust cloud storage (section 4). Browsers can still delete site data (section 14).

## Decision

- Each item is one Yjs `Y.Doc`, persisted with `y-indexeddb`. Project metadata (projects, items, sequences, snapshots index, people, submissions, shares) lives in IndexedDB through Dexie.
- No Vlo server stores manuscript text. Data leaves the device only for AI requests the writer sends on purpose, encrypted share copies, and opt-in counts with no text. One network module (`src/net/`) sends every request and logs it.
- Durability: `navigator.storage.persist()` at the first project, a full `.zip` backup in one click, a reminder after 7 days without a backup, and install steps for Safari.

## Consequences

- No accounts and no cross-device sync in version 1. The backup file moves a project between browsers.
- Storage code sits behind `src/data/` so tests can run it with `fake-indexeddb`.
