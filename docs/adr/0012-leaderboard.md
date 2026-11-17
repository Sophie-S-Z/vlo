# ADR 0012: A writing leaderboard for signed-in writers

- Status: accepted
- Date: 2026-11-17

## Context

The product owner asked for a live leaderboard of words written today, this week, this month and this year, which every signed-in writer can see, with gold, silver and bronze for the first three and a crown for the first. The owner asked for no new cost.

## Decision

- **The words come from the daily count.** Migration 0009 already sends the words that each device added on its local day. The board adds no new request from the editor and no new table. The words of an account on a day are the most that any of its devices counted, as on the owner page.
- **Two functions, for signed-in accounts only.** Migration 0013 adds `leaderboard(period, today)` and `leaderboard_show(on)`. The tables stay closed. A week starts on Monday. The board gives at most 50 writers, and the signed-in writer at its own place. Only the first 10 and the signed-in writer carry a photo, so a call stays small.
- **A name that the writer chose to show.** A writer shows by the pen name, or else the name of the greeting, never the full name or the email. `profiles.on_leaderboard` is on by default, and a switch on the page takes the writer off. An account with no profile is never on the board.
- **Live by polling.** The page loads again every minute while it is on the screen, and sends this device's count first. A hidden tab sends no request. No realtime channel, so the free plan of Supabase is enough.

## Consequences

- A writer with the daily count off does not count. The page says so, with a link to Settings.
- Other signed-in writers see the pen name or the greeting name, the photo and the word count. The privacy page says so (version 16).
- Migration 0013 must be on the live database before the app that calls it goes live.
