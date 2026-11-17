# ADR 0011: A profile for each account, and the greeting by name

- Status: accepted
- Date: 2026-11-17

## Context

An account had an email and no name. The product owner asked for a name on each account, a profile that the writer can change (a photo, the full name and the other usual parts), and a Library that says "Welcome back to your library" with the writer's name. The owner asked to keep the storage cost near zero.

## Decision

- **The server keeps the profile.** Migration 0011 adds `profiles`: the full name, the name of the greeting, a pen name, a bio and a photo, one row for each account. The table is closed, as before, and only `profile_get` and `profile_put` of the signed-in account reach it. The row goes with the account.
- **A small photo in the row.** The browser draws the square that the writer places at most 256 pixels wide, as WebP, or JPEG where the browser cannot make WebP. The server takes a data URL of at most 60,000 characters, so 10,000 photos take less than 600 MB, with no storage bucket. The new file holds no camera data.
- **A name before the first visit.** After a sign-in, an account with no profile opens `/profile/new`, which asks for the name and offers a photo. Google's name fills the name field. As Vlo opens, a signed-in device with no profile copy goes there too, unless it is offline or the server did not answer and the writer chose "Not now" in that tab.
- **A copy on the device.** The profile stays in `appMeta` of the account's library, so the Library greets the writer with no wait and offline. Vlo reads the server's profile each time it opens, so a change on another device comes over. No backup or sync holds the copy.
- **Where the profile shows.** The Library says "Welcome back to your library, <name>". The header shows the photo or the initials, and a menu with Your profile and Account and sync. A new project takes the pen name, or else the full name, as its author. The Book page can take the bio for "About the author". The owner page shows the name next to the email.

## Consequences

- An account that existed before this change gives its name at its next start on each device. This happens once for each account, because the server then has the profile.
- A person with database access can read the profile. The privacy page says so (version 15).
- A pronoun, a website or a public author page has no place to show in Vlo now, so the profile does not ask for one.
