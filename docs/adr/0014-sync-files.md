# ADR 0014: Sync files go to Cloudflare R2

- Status: accepted
- Date: 2026-11-22

## Context

The free Supabase plan gives a 500 MB database and 5 GB of egress each month. On 2026-11-19, research files and images used 3.4 MB of the 5.8 MB of sync data, and each saved version is a full copy of its chapter. These blobs grow with each writer, and each download of them counts against the egress. Cloudflare R2 gives 10 GB free, charges $0.015 for each GB after that, and charges nothing for downloads. The product owner chose this change (scaling fix 5) on 2026-11-22.

## Decision

- **What moves.** The blobs `file:`, `image:` and `version:` go to an R2 bucket through a Cloudflare Worker (`workers/files`). Rows blobs and chapter text stay in Postgres. They are small, and they change most often.
- **A row for each file.** Migration 0018 keeps a row in `sync_blobs` for each file, with `file = true`. Its payload is the id of the file in R2, and it keeps the key, the IV, the size and the time. So `sync_list`, the seen list of migration 0017 and the device limit work as before. A UUID has a "-", and base64 never has one, so a device tells the two kinds apart. An older Vlo cannot open a file row, and skips it.
- **The Worker stores, then registers.** A PUT stores the sealed bytes under a new id, then calls `sync_put_file` with the true size. A refusal deletes the new file again. A file never changes, so a device that read a row a moment before it changed still gets the file of that row.
- **Limits.** Each space gets 200 MB of files, and all files stop at 9 GB, under the 10 GB free tier. A refusal says `files full`. The file stays on its device, and the text still syncs. The 50 MB of each space and the 450 MB stop of migration 0017 now count only rows in Postgres.
- **The token.** The Worker sends the space token to Supabase on each PUT and GET (`sync_put_file`, `sync_check`). It keeps no secret, and it uses the publishable key, as the app does.
- **Unused files.** Each hour, the Worker reads up to 5,000 files from where its last run stopped. It deletes each file older than a day that no row uses with its size (`sync_files_known`). So a drop, a device that leaves, a deleted space, the 90-day cleanup and a deleted account need no change. A row that names a wrong size keeps no file, so a device cannot hide a file from the limits.
- **A switch.** The app uses the store only when the build sets `VITE_FILES_URL`. With none, every blob stays on the relay, as before.

## Consequences

- A file in R2 stays up to about 2 days after its last row goes. The privacy page says so (version 22).
- The blobs of files that are already on the relay stay there until they change. They are small.
- The free Workers plan allows 100,000 requests each day. A sync of a file is one request, and a download is one. At about 1,500 daily writers, the Workers Paid plan ($5 a month) is necessary.
- A Worker run may use 10 ms of CPU and 50 calls on the free plan. A sweep uses at most 17 calls. With more than about 100,000 files, the sweep needs more runs each hour.
