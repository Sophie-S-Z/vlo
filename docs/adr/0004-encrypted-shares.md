# ADR 0004: Encrypt share links in the browser

- Status: accepted
- Date: 2026-11-07

## Context

Writers need to send drafts to beta readers and editors, and to read their comments (F27, F28, US12, US13). Vlo is local-first (ADR 0001): manuscripts stay on the device, and the only server is a free Supabase project. A share must not let Supabase, a backup of its database, or anyone who reads its logs read the text. Readers need no account and no app.

## Decision

- The writer's browser builds the share bundle from the same export tree that an export file uses (`safeExportTree`). A memoir bundle has each private name as its alias, and the name check runs first, as for a share-safe export.
- The bundle is a reader schema, not the export tree itself. It keeps the structure, poem lines and plain styles, and drops fonts, colors and fills. Each equation goes as a MathML tree of allowed elements, made on the writer's device, so the reader view never loads MathLive and never parses markup.
- The browser seals the bundle: JSON, gzip with `CompressionStream`, then AES-GCM 256 with a new random key and a new 12-byte IV (`src/lib/crypto.ts`).
- The link is `/r/<shareId>#k=<key>`. Browsers never send the fragment to a server. The reader view takes the key once, then removes the fragment from the address bar.
- A random 32-byte owner token stops the link. The server keeps only its SHA-256 hash. The key and the owner token stay in the share record on the writer's device. Backups leave them out.
- Comments are sealed with the link's key in the reader's browser. Anyone with the link can read and add comments, and the reader view says so.
- Vlo calls Postgres functions through PostgREST with `vloFetch`, so each call is in the network log. There is no supabase-js (plan decision S2). Row level security with no policies keeps the tables closed to the anon key.
- The reader view checks every field of a bundle and of a comment (`parseBundle`, `parseComment`) and renders with React elements only.
- The seal has additional data that names its purpose (`vlo:bundle:v1` or `vlo:comment:v1`), so a sealed comment cannot open as a bundle. Opening stops past 64 MB of a bundle or 64 KB of a comment, so a small gzip cannot fill the reader's memory.
- Stop sharing reads the comments first, because the server gives none for a stopped link.
- Migration 0004 puts limits on the whole project, because the anon key is public: new links and comments in an hour, the total size of sealed text, and usage reports in a week. Each function checks the shape of its input.

## Consequences

- Supabase holds cipher text only. A leak of its database shows dates and sizes, not text.
- A lost link cannot be recovered from the server. The writer makes a new one.
- The key in the link is the whole secret. Anyone who gets the whole link can read the text until it expires or the writer stops it.
- A change on the writer's device does not reach readers. The writer shares again, and the Share panel says so.
- The bundle size limit is the server's 2.8 MB of base64. With gzip, a whole long novel fits. A project with many equations comes near the limit sooner, and the panel then asks for fewer items.
- Deleting a project removes its owner tokens, so the delete dialog warns about active links first.
- A person who reads the anon key can call the functions. The limits keep the database healthy, but such a person can use up the hourly limit, and then writers cannot make links for up to an hour. The setup guide says how to change a limit.
