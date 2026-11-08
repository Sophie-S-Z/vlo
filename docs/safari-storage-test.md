# Safari storage test plan

Spec section 14, Phase 6 task 3. The product owner runs this plan by hand on real Apple devices. Each run takes 14 days.

## Why this test exists

Safari can delete the data that a website stores after 7 days of Safari use with no visit to that website. A web app on the Home Screen (iPhone, iPad) or on the Dock (Mac) keeps its own data and does not follow that rule. Vlo keeps every word in the browser (ADR 0001), so this rule decides if a writer loses work. Vlo answers it in 3 ways:

- It asks the browser to protect its data when the writer creates the first project (`src/lib/storage.ts`).
- It shows Safari users the steps to install it (`src/features/backup/SafariSteps.tsx`).
- It reminds the writer to back up after 7 days without a backup (`src/features/backup/reminder.ts`).

This test finds what Safari does in fact, and if those 3 answers are enough.

## Before you start

- Use the production address, after the Phase 6 release.
- Use one iPhone (iOS 18 or later) and one Mac (Safari 18 or later). An iPad is optional.
- On each device, the installed web app keeps its data apart from the Safari tab. So you can do run A and run B on the same device at the same time.
- Do not use a private window. Do not clear the Safari history during the test.
- Use Safari every day of the test for other websites. Safari counts only the days that you use it.
- Write the device, the system version and the Safari version in the result table.

## Run A: Safari tab only (not installed)

### Day 0

1. Open the production address in a Safari tab.
2. Skip onboarding. Make a Novel, a Memoir and a Poetry collection project.
3. In each project, type one paragraph. In the poetry project, type the poem fixture from spec section 15 with its indents.
4. Take one snapshot in each project.
5. Open Settings. Write down the 3 values under storage health: "Used", "Limit for Vlo" and "Protected from clean-up".
6. Write down if the Library shows the Safari install steps. Expected: it shows them.
7. Close the tab. Do not open Vlo in Safari again until day 8.

### Day 8

1. Open the production address in a Safari tab.
2. Write down if the 3 projects are present. If they are present, check the text of each item and the poem indents, and count the snapshots.
3. Write down if the Library shows the backup reminder on each card. Expected: it shows it, because no backup was made.
4. Close the tab. Do not open Vlo in Safari again until day 14.

### Day 14

1. Do the day 8 steps again.

## Run B: installed web app

### Day 0

1. On the iPhone: open the production address in Safari, tap the Share button, then tap Add to Home Screen. On the Mac: in Safari, choose File, then Add to Dock.
2. Open Vlo from the Home Screen or the Dock.
3. Do steps 2 to 5 of run A, day 0.
4. Write down if the Library shows the Safari install steps. Expected: it does not show them.
5. Close the web app. Do not open it again until day 8.

### Day 8 and day 14

1. Open Vlo from the Home Screen or the Dock.
2. Do steps 2 and 3 of run A, day 8.

## Offline check (run B, day 14)

1. Turn on airplane mode, or turn off Wi-Fi on the Mac.
2. Open Vlo from the Home Screen or the Dock. Expected: the Library opens with the 3 projects.
3. Type one sentence. Close the web app. Open it again. Expected: the sentence is present.
4. Turn the network on again.

## Real Safari budget checks

CI runs WebKit on Linux, which paints in software. STATUS lists these checks as "by hand in Phase 6". Do them once on the Mac in the installed web app.

1. Open Settings and turn off Calm mode.
2. Import the backup of the 100,000-word test project. The file is `vlo-large-backup.zip` in the project files (`backups/`). In the Library, choose Import backup.
3. Open the 10,000-word scene from the binder. Expected: the text shows in under 300 ms. Measure from the click to the first paint of the text in the Safari Web Inspector, Timelines tab.
4. Type 20 keys at a steady speed in the middle of the scene. Expected: each key shows in under 50 ms in the Timelines tab.
5. Open the "Scene" button in the editor and pick a moving scene. Do step 4 again. Expected: under 50 ms.
6. Pick no scene again. Select a paragraph, open "Gradient and shimmer" in the selection toolbar, and pick a shimmer. Do step 4 again in that paragraph. Expected: under 50 ms.

## Result table

Copy this table into `docs/STATUS.md` when the runs end.

| Run          | Device and versions | Day | Projects present | Text and indents exact | Snapshots | Install steps shown | Backup reminder | Protected from clean-up | Notes |
| ------------ | ------------------- | --- | ---------------- | ---------------------- | --------- | ------------------- | --------------- | ----------------------- | ----- |
| A, tab       |                     | 0   | yes              |                        |           |                     | no              |                         |       |
| A, tab       |                     | 8   |                  |                        |           |                     |                 |                         |       |
| A, tab       |                     | 14  |                  |                        |           |                     |                 |                         |       |
| B, installed |                     | 0   | yes              |                        |           |                     | no              |                         |       |
| B, installed |                     | 8   |                  |                        |           |                     |                 |                         |       |
| B, installed |                     | 14  |                  |                        |           |                     |                 |                         |       |

| Budget check               | Device and versions | Result (ms) | Budget (ms) | Pass |
| -------------------------- | ------------------- | ----------- | ----------- | ---- |
| Open the 10,000-word scene |                     |             | 300         |      |
| Plain typing               |                     |             | 50          |      |
| Typing with a moving scene |                     |             | 50          |      |
| Typing in shimmering text  |                     |             | 50          |      |
| Offline open and save      |                     | n/a         | n/a         |      |

## What the results mean

- Run A loses data on day 8 or day 14, and run B keeps it: Vlo's answers are correct. Keep the install steps and the reminder as they are.
- Run B loses data: this is a launch blocker. Tell Claude the day and the device.
- Run A keeps data: Safari protected the tab. Write down the "Protected from clean-up" value, because it can explain why.
- A budget check fails: write down the result. Claude records a trace on the same scene and finds the cause.
