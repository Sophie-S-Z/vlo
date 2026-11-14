# Set up accounts, the daily count, feedback and the owner page

Phase 18 uses the same free Supabase project as share links and sync (`docs/sharing-setup.md`). Do that guide first. Then do the steps below. Each step is in the Supabase dashboard unless it says otherwise.

## 1. Apply migration 0008

Run `supabase/migrations/0008_accounts.sql` in the SQL Editor, as for the other migrations. It adds the sync vaults, the daily count, feedback, the owner list and their functions.

## 2. Send the sign-in emails with your own mail server (required)

The built-in Supabase mail sends only to the members of your Supabase team, and only a few emails each hour. Real writers need a mail server. Choose one of the two below.

### Option A: a Gmail address, with no domain

Gmail sends up to about 500 emails a day. Writers see the Gmail address as the sender.

1. In the Google account, turn on 2-Step Verification (https://myaccount.google.com/security).
2. Open https://myaccount.google.com/apppasswords, type the name `Vlo Supabase`, then choose Create. Copy the 16-letter password.
3. In Supabase, open Authentication, then Emails, then SMTP Settings. Turn on custom SMTP, and type: host `smtp.gmail.com`, port `465`, username and sender email the Gmail address, password the app password, sender name `Vlo`.
4. Open Authentication, then Rate Limits. Set "Emails sent per hour" to at least 100.

### Option B: Resend, on your own domain

Resend is free for 3,000 emails a month.

1. Make an account at https://resend.com and add your domain. Resend shows the DNS records to add.
2. In Resend, make an API key with "Sending access".
3. In Supabase, open Authentication, then Emails, then SMTP Settings. Turn on custom SMTP.
4. Type these values:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
   - Sender email: an address on your domain, such as `hello@your-domain`
   - Sender name: `Vlo`
5. Open Authentication, then Rate Limits. Set "Emails sent per hour" to at least 100.

## 3. Send a 6-digit code, not a link

Vlo asks for a code, because a link in an email opens the browser and not the installed app on a phone.

1. Open Authentication, then Emails, then Templates, then "Magic Link".
2. Set the subject to `Your Vlo sign-in code`.
3. Set the body to:

   ```html
   <h2>Your Vlo sign-in code</h2>
   <p>Type this code in Vlo: <strong>{{ .Token }}</strong></p>
   <p>It works for one hour. If you did not ask for it, you can ignore this email.</p>
   ```

4. Do the same for the "Confirm signup" template, so a new writer gets a code too.
5. Open Authentication, then Sign In / Providers, then Email. Keep "Enable Email provider" on. Set "Email OTP Expiration" to `3600`.

## 4. Allow Vlo's address

1. Open Authentication, then URL Configuration.
2. Set Site URL to the address of Vlo, such as `https://vlo-eight.vercel.app`.
3. Add `https://vlo-eight.vercel.app/account` to Redirect URLs. For the Vercel previews, add the preview address with a wildcard too, such as `https://*-<your-team>.vercel.app/account`. Then Google sign-in works on the live site and on each preview.

## 5. Google sign-in (optional)

1. In the Google Cloud console (https://console.cloud.google.com), make a project, then open APIs and Services, then OAuth consent screen. Choose External, and add the app name Vlo and your email.
2. Open Credentials, then Create credentials, then OAuth client ID. Choose "Web application".
3. Under Authorized redirect URIs, add `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Copy the client ID and the client secret.
5. In Supabase, open Authentication, then Sign In / Providers, then Google. Turn it on and paste the two values.
6. In Vercel, add the environment variable `VITE_AUTH_GOOGLE` with the value `1`, then deploy again. The "Continue with Google" button shows only in a build with it.

## 6. Make yourself the owner

1. Sign in to Vlo once with your own email, so your account exists.
2. In the SQL Editor, run this with your email:

   ```sql
   insert into public.app_owners (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

3. Open `/owner` in Vlo. You see the counts, the accounts and the feedback.

To add another owner, run the same SQL with their email. To remove one, delete their row from `app_owners`.

## What the owner sees, and what the owner never sees

- The owner sees: the number of accounts, devices that opened Vlo each day, the kind of each device, versions, accounts that sync, each account's email, start date and last active day, the weekly usage reports that writers chose to send, and every feedback message.
- The owner page never shows a project, a title, a name or a word of writing. The sync server holds sealed copies. The key of each account is in `sync_vaults`, as the product owner chose (ADR 0009), so keep the database password and the service key private.

## Keep the free project awake

A free Supabase project pauses after 7 days with no activity. The daily count of each writer keeps it awake. The GitHub keepalive workflow (`.github/workflows/keepalive.yml`) is a second guard.
