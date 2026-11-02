# ADR 0001: Local-first storage

- Status: accepted
- Date: 2026-11-02

## Context

Writers fear that drafts leak or train AI models (spec section 2). Vlo has no accounts and no cloud sync in version 1.

## Decision

Every manuscript lives in the browser. Metadata goes in IndexedDB through Dexie. Each item's text goes in its own Yjs document, saved with y-indexeddb. No Vlo server receives manuscript text.

Only three things can leave the device: AI requests that the writer sends on purpose, encrypted share copies, and opt-in usage counts with no text. All three pass through `src/lib/net.ts`, which logs each request.

## Consequences

- The app works offline, and it costs nothing to run.
- Browsers can delete local data. Vlo asks for persistent storage, shows backup reminders, and offers a one-click backup.
- A writer who moves to a new device must move a backup file by hand.
