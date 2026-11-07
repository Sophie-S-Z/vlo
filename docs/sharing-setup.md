# Set up share links and usage counts

Vlo uses one free Supabase project for two features: read-and-comment share links (F27, F28) and opt-in usage counts (F30). Until the project exists, Vlo says "Sharing is not set up in this build." and sends nothing. This guide is plan decision S1. ADR 0004 gives the design.

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

Migration 0003 then schedules the daily cleanup, which deletes each share 30 days after it expires. Without pg_cron the migration still runs, but no cleanup runs. Turn pg_cron on and run 0003 again to fix that.

## 3. Apply the migrations

Run the 3 files in order. Each one runs once.

Option A, in the dashboard:

1. Open SQL Editor and choose New query.
2. Paste all of `supabase/migrations/0001_shares.sql`, then choose Run.
3. Do the same for `0002_usage.sql`, then `0003_cleanup.sql`.

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
