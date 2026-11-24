# ADR 0016: Sealed data as bytes, and leaderboard photos once

- Status: accepted
- Date: 2026-11-24

## Context

Vlo is local-first: the writing stays in the browser, and the server keeps only optional extras. The free Supabase plan limits those extras to a 500 MB database and 5 GB of egress each month (ADR 0008, ADR 0014). On 2026-11-24 the product owner asked for less storage and egress on the server, with the costs kept off the owner as Vlo grows.

Two wastes were left after migrations 0017 and 0018:

- Sync blobs, share links and share images arrive as base64 text and stay as text. Base64 is a third larger than its bytes. Postgres compresses only repeats, and cipher text has none, so a test in PGlite kept 133,336 bytes for 100,000 bytes of cipher text.
- The leaderboard loads again each minute while it is on the screen, and each load carried up to 11 profile photos of about 15 KB. One open page took about 10 MB of egress an hour.

## Decision

- **Bytes in the tables.** Migration 0019 changes `payload` of `sync_blobs`, `shares` and `share_images` to `bytea`. The functions take and give base64 as before (`vlo_b64`), so the app and an older Vlo do not change. A file row of migration 0018 keeps its id as the 16 bytes of the UUID. The rows of before change in place. A row that is no base64 keeps its characters as bytes, so the change cannot fail on bad data.
- **The same limits.** The limits still count base64 characters, as the app does (`size` for sync, `vlo_b64_length` for shares). So 25% less space holds the same data, and no writer meets a new limit.
- **Shares respect the database.** `create_share` and `add_share_image` now stop with `server full` when the database nears 450 MB (`sync_server_full`), as sync does. Before, shares had only their own 300 MB, which other data did not count.
- **Photos once.** Migration 0020 gives each leaderboard row a `photo_id`, the MD5 of its photo. A load names the ids that the device has in `p_have`, and the server leaves those photos out. The app keeps the photos of the last load. A device of an older Vlo names none and gets every photo. A server from before 0020 gives no ids, so the app never sends `p_have` to it.
- **Comments stay text.** Each is at most 20,000 characters, and the change would touch more functions than it saves.

## Considered and left

- **Sync through the writer's own Google Drive or cloud folder**, so each writer pays for the storage. It needs a Google app review and a second sync path, and it fails in some mobile browsers. The relay with R2 costs $0 to about 1,000 daily writers, so it is not worth the risk now.
- **Yjs deltas in place of whole texts.** The relay keeps one blob per key and replaces it, so a device that missed a delta would lose edits.
- **A rows blob for each table.** The `items` rows change with each text change (the word count), so most pushes would still send the largest part.

## Consequences

- Sync and share data use about 25% less database space. The egress of sync and shares does not change.
- An open leaderboard costs about 5 KB a minute in place of about 150 KB.
- Run migration 0018 before 0019, and 0019 before 0020.
