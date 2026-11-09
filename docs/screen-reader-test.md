# Screen reader test

Roadmap F37 (plan Task G8). Run this script before each release with two pairs:

- NVDA with Firefox on Windows.
- VoiceOver with Safari on macOS.

Use the keyboard only. Do not use the mouse or the trackpad. `tests/e2e/screen-reader.spec.ts` runs the same steps by role and name, so a failure in the browser test points to the same step here.

## Before you start

1. Open Vlo in a private window, so the welcome screen shows.
2. Start the screen reader. In NVDA, use browse mode to read and focus mode to type. In VoiceOver, turn on Quick Nav only to read.

## Steps

Write down what the screen reader says at each check. A check fails when the reader says nothing, says a wrong name, or says a name twice.

1. **Skip the welcome.** Press Tab to "Skip" and press Enter.
   - Check: the reader says the "Library" heading.
2. **Create a project.** Tab to "New project" and press Enter. Type the title "Salt Year" and press Enter.
   - Check: the reader says the "New project" dialog and the "Title" field.
   - Check: after Enter, focus is in the "Scene 1" text box.
3. **Write.** Type "The harbour lights came on." Wait 2 seconds.
   - Check: the save status says "Saved" (NVDA reads the live region; in VoiceOver, press VO+F3 on the status).
4. **Take a snapshot.** Tab to "History" and press Enter. Tab to "Save a snapshot now" and press Enter. Press Escape.
   - Check: the reader says "Snapshot saved."
   - Check: after Escape, focus goes back to "History".
5. **Add a scene and reorder it.** Tab to "Options for Chapter 1" and press Enter. Press the arrow keys to "Add Scene inside" and press Enter. Then Tab to "Move Scene 2", press Space, press Up Arrow, and press Space.
   - Check: the reader says "Picked up Scene 2.", then "Scene 2 is over Scene 1.", then "Scene 2 moved. It is now 1 of 2 in Chapter 1."
6. **Export.** Press Ctrl+K (Cmd+K on a Mac). Type "Export" and press Enter. Tab to "Export" and press Enter.
   - Check: the reader says the "Export" dialog, then the "Your file is ready" dialog.
7. **Back up.** Press Ctrl+K. Type "Back up" and press Enter. Tab to "Download backup" and press Enter.
   - Check: the reader says the "Back up Salt Year" dialog and that the backup is saved.
8. **Rename.** Press Ctrl+K. Type "Library" and press Enter. Tab to "Options for Salt Year" and press Enter. Press the arrow keys to "Rename" and press Enter. Type "Salt Years" and press Enter.
   - Check: the reader says the "Rename project" dialog, and the Library card says "Salt Years".

## Record the result

Add a line to `docs/STATUS.md` with the date, the screen reader, the browser and their versions, and each failed check.
