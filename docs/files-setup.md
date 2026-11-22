# Set up the file store of sync

Sync can keep its research files, images and saved versions in Cloudflare R2 (scaling fix 5, ADR 0014). R2 gives 10 GB free and charges nothing for downloads, so these files use none of the free Supabase database or egress. A small Cloudflare Worker (`workers/files`) stands in front of the bucket. Until a build has the Worker's address, sync keeps every file in Supabase, as before.

The product owner does steps 1 to 4. Claude does step 5 when it has the Worker's address. Never give Claude, or commit, a Cloudflare API token.

## 1. Run migration 0018

1. Open the Supabase dashboard, project "Vlo", SQL Editor, New query.
2. Paste all of `supabase/migrations/0018_sync_files.sql`, then choose Run.
3. Run this check. It must show 4 names, and `files` must be 0.

```sql
select proname from pg_proc
where proname in ('sync_put_file', 'sync_check', 'sync_files_known', 'sync_put_checks') order by 1;
select count(*) filter (where file) as files, count(*) as all_rows from public.sync_blobs;
```

The app of before keeps working with this migration.

## 2. Make the Cloudflare account and turn on R2

1. Make a free account at https://dash.cloudflare.com/sign-up.
2. Open R2 Object Storage in the side menu, and turn on R2. Cloudflare can ask for a card. The first 10 GB each month cost $0.

## 3. Deploy the Worker

Use a terminal in the repository folder. `npx` asks to get Wrangler, the Cloudflare tool, the first time. Answer `y`. Wrangler does not go into `package.json`.

```sh
cd workers/files
npx wrangler login
npx wrangler r2 bucket create vlo-files
npx wrangler deploy
```

`wrangler login` opens the browser. Choose Allow. `wrangler deploy` prints the Worker's address, such as `https://vlo-files.<your-subdomain>.workers.dev`. It also sets the sweep of unused files to run each hour.

## 4. Check the Worker

Open the Worker's address in the browser. It must show `{"message":"not found"}`.

## 5. Turn on the file store in the app

Claude adds the address to `.env` as `VITE_FILES_URL` and to `connect-src` in `vercel.json`. A unit test checks that the two agree. After the deploy, a new image on one device goes to R2, and the other devices get it from there.

## Limits

- Each sync space has room for 200 MB of files. All files together stop at 9 GB, under the free 10 GB. A full store keeps a file on its device, and the text still syncs.
- The Worker deletes a file about 1 to 2 days after no row uses it.
- The free Workers plan allows 100,000 requests each day, about 1,500 daily writers.
