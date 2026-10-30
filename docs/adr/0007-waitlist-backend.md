# 0007. Waitlist backend

Date: 2026-10-30. Status: accepted.

## Context

Spec section 19 gives the waitlist SQL. Section 15 requires row level security with no direct anon access and security definer RPCs with input checks. A test against a real PostgreSQL showed that two sign-ups in one transaction share `created_at`, so both got place 2.

## Decision

- Migration `supabase/migrations/20261030000000_waitlist.sql` follows section 19 with these changes:
  - A `seq` identity column gives strict sign-up order. The place is the count of rows with `seq <=` the row's `seq`.
  - The function trims and lower-cases the email, caps it at 254 characters, and rejects an unknown `writer_type` with `invalid_writer_type` (the check constraint alone would give a raw constraint error).
  - `citext` lives in the `extensions` schema, as Supabase installs it.
  - Table privileges for `anon` and `authenticated` are revoked, because Supabase grants them by default. Function execute goes to `anon` only.
- SQL tests (`supabase/tests/`) run as `anon` on a throwaway PostgreSQL 16 through `scripts/test-sql.sh`, locally and in CI.
- The client calls the RPCs with plain `fetch` through `src/net/`, not `@supabase/supabase-js`. Two RPC calls do not justify a 40 KB+ library, and one network module keeps the network log complete.

## Consequences

- US17 has a known privacy edge: anyone who submits an email that is on the list sees its place and invite code. The code only tracks invites, so the risk is low. Revisit if invite codes ever unlock anything.
- The human applies the migration in the Supabase SQL editor or with the Supabase CLI. Claude never holds the service key.
- The honeypot and the 2-second check run only in the browser, and the function has no rate limit. A script with the public anon key can add rows. Add a per-IP limit (for example a Supabase edge function or a Cloudflare rule) if spam shows up. Recorded as an open issue in `docs/PROGRESS.md`.
- Two sign-ups that commit at the same moment can each see a place that leaves out the other row, so two writers can see the same number. The order in the table stays correct. The place is for display only, so this is accepted.
