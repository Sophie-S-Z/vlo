# Rules for Claude in this repository

## Supabase migrations and SQL

The owner runs every change to the live Supabase database. Claude does not apply a migration or run
writing SQL on the live database. Read-only queries for measurement are allowed.

When a migration or an SQL run is necessary, give the owner all of this:

1. The file path in `supabase/migrations/`, and the full SQL in one block to copy.
2. Where to run it: Supabase dashboard, project "Vlo", SQL Editor, New query.
3. What the SQL changes, in a few short lines, and if old app versions keep working.
4. Any prompt that Supabase shows (for example a warning about a destructive statement), and the answer.
5. A read-only check query to run after it, and the result to expect.
6. The order of the steps, for example "run the SQL first, then merge the pull request".
