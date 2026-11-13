# Set up share links, sync and usage counts

Vlo uses one free Supabase project for three features: read-and-comment share links (F27, F28, F50), sync between a writer's devices (F49) and opt-in usage counts (F30). Until the project exists, Vlo says "Sharing is not set up in this build." and "Sync is not set up in this build.", and sends nothing. This guide is plan decision S1. ADR 0004 and ADR 0008 give the design.

The product owner does steps 1 to 4. Claude does step 5 when it has the URL and the anon key. Never give Claude, or commit, the service key.

## 1. Make the Supabase project

1. Sign in at https://supabase.com/dashboard.
2. Choose New project. Use the free plan.
3. Pick the region nearest to most readers.
4. Keep the database password in a password manager. Vlo does not need it.
5. Wait until the project shows "Healthy".

## 2. Turn on pg_cron

1. Open Database, then Extensions.
2. Find pg_cron and turn it on.

Migrations 0003 and 0005 then schedule the daily cleanups. One deletes each share 30 days after it expires. The other deletes each sync space with no use for 90 days. Without pg_cron the migrations still run, but no cleanup runs. Turn pg_cron on and run 0003 and 0005 again to fix that.

## 3. Apply the migrations

Run the 8 files in order. Each one runs once.

Option A, in the dashboard:

1. Open SQL Editor and choose New query.
2. Paste all of `supabase/migrations/0001_shares.sql`, then choose Run.
3. Do the same for `0002_usage.sql`, `0003_cleanup.sql`, `0004_limits.sql`, `0005_sync.sql`,
   `0006_rooms.sql`, `0007_share_images.sql` and `0008_accounts.sql`.

Option B, with the Supabase CLI on your computer:

```sh
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

To check the result, run this in the SQL Editor. The answer is 1.

```sql
select public.ping();
```

## 4. Give the public values

1. Open Project Settings, then API.
2. Copy the Project URL, such as `https://abcd1234.supabase.co`.
3. Copy the `anon` `public` key. Do not copy the `service_role` key.
4. Give both values to Claude in the project chat.

Both values are public by design. Each browser that opens Vlo gets them. Row level security with no policies keeps every table closed, so the anon key can only call the functions in the migrations.

## 5. What Claude does with the values

- Writes them to a committed `.env` file as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Adds the project URL to `connect-src` in the CSP in `vercel.json`. A unit test checks that the CSP lists exactly the hosts in `src/lib/net.ts`.
- Opens a pull request. The Vercel preview of that pull request is the first build with sharing on.

Vercel builds from the committed `.env`, so Vercel needs no new variables. To use other values on Vercel only, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel, under Project Settings, then Environment Variables. A value set there wins over `.env`.

A new project URL also needs a change to `connect-src` in `vercel.json`. Without it, the browser blocks each call to the new host, and readers see "Vlo could not reach the share server." Change both in one pull request.

## 6. Keep the free project awake

A free Supabase project pauses after 7 days with no requests. The workflow `.github/workflows/keepalive.yml` calls `ping()` every 3 days. It needs two settings on GitHub, under Settings, then Secrets and variables, then Actions:

1. On the Variables tab, add `SUPABASE_URL` with the project URL.
2. On the Secrets tab, add `SUPABASE_ANON_KEY` with the anon key.

Until `SUPABASE_URL` exists, the workflow skips. To test it, open the Actions tab, choose "Supabase keepalive", then Run workflow.

The workflow uses GitHub Actions minutes, about 1 minute every 3 days. While the free Actions minutes are used up, it cannot run, and the project can pause.

## 7. Restore a paused project

1. Open the project in the Supabase dashboard.
2. Choose Restore project, and wait until it shows "Healthy". This can take a few minutes.
3. Shares and comments are still there. Links work again at once.

While the project is paused, readers see "Vlo could not reach the share server." and writers cannot make a link. Nothing on any writer's device changes.

## What the server holds

- `shares`: the sealed bundle, its IV, a SHA-256 hash of the owner token, the dates and the revoked flag. The key is never on the server: it is in the link fragment, which browsers do not send.
- `share_comments`: sealed comments, sealed with the link's key.
- `usage_reports`: the weekly reports that writers chose to send. Each holds bands and fixed names only.
- `sync_spaces`: one row for each writer who turned on sync, with a SHA-256 hash of the space token and the dates.
- `sync_blobs`: for each device of a space, the newest sealed blob of each key. A key is an HMAC that only the writer's devices can make, so the server sees no project or item id.

## The limits

Anyone can read the anon key from the app, so migration 0004 puts limits on the whole project. They keep the free database under its 500 MB.

- At most 120 new links in an hour, and at most 300 MB of sealed text in all.
- At most 600 new comments in an hour, and 500 comments on one link.
- At most 2,000 usage reports in 7 days.
- Sync (migration 0005): at most 20 new sync spaces in an hour, 5 devices and 100 MB for each space, 2.8 MB for each blob, and 150 MB of sync in all, so share links keep their room.
- Each function checks the length and the characters of the IV and the owner token.

When a limit stops a request, the writer or reader sees "The share server is at its limit for now. Try again in an hour." To change a limit, write a new migration with the new number. The daily cleanup frees space 30 days after each link expires.
