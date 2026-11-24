# ADR 0015: Thin automatic snapshots, and store snapshots with no edit history

- Status: accepted
- Date: 2026-11-24

## Context

Vlo saved a snapshot after every 10 active minutes of an item, and kept each one forever. A writer who
works two hours a day on one chapter got about 4,000 snapshots a year for that chapter. The device storage,
the History list and each backup grew without a limit. Safari and phones give a site the smallest storage.

Each snapshot and each named version held the whole Yjs state of the item. That state also holds the edit
history: the structure of each deleted run and each change of a format. A test typed 5,000 words, and
deleted some words and typed them again. The whole state took 21 KB in gzip, and the text alone took 9 KB.

A snapshot or a version never merges with the live text. A restore, a switch and a "Use this" read the text
fragment into the editor's schema, and the editor puts the change in the live document.

## Decision

- Each new automatic snapshot thins the older automatic snapshots of its item, as Apple Time Machine
  thins its backups. All snapshots of the last day stay. Then the newest of each day stays for 30 days,
  and after that the newest of each week (from Monday). Days and weeks use the device's own clock.
- The automatic snapshots are the timer's snapshots (no label) and the "Before sync" snapshots. Only they
  thin, and only they start a thinning.
- A snapshot that the writer saved always stays. So does a snapshot from before a step of the writer: a
  restore, a switch of version, "Use this", Replace all in project or Word changes. A restore never thins,
  so the snapshot that it restored stays in the list.
- A snapshot and a version store `contentState(doc)`. It is a new Yjs document with a copy of the text
  fragment and the schema stamp, and with no edit history.
- The stored format is still one Yjs update. A backup, sync, an older build and the image sweep read it as
  before. The live item document keeps its full history, because sync merges it.
- A thinning reads only the id, the label and the date of each row, not the states. A thinning that fails
  does not fail the snapshot. The next automatic snapshot tries again.

## Consequences

- An item that gets automatic snapshots keeps about one day of them, plus 30, plus one for each week. Its
  History list and its part of a backup stay short.
- An item that gets no new automatic snapshot keeps its old ones until the writer edits it again.
- New snapshots and versions take about half the space, and a version sync sends less data.
- The copy costs more time than a plain encode: about 25 ms for one item of 100,000 words in Node, and
  about 2 to 4 ms for a chapter of 5,000 words. The timer snapshot runs after a 2-second pause in typing.
- A writer cannot get back the text of an automatic snapshot that thinning deleted. A writer who wants a
  point to stay saves a snapshot, or keeps a named version.
- The first automatic snapshot after this change can delete many old snapshots of that item at once.
